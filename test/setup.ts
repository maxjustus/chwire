import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ClickHouseContainer, type StartedClickHouseContainer } from "@testcontainers/clickhouse";

let container: StartedClickHouseContainer | undefined;
let tlsFixtureDir: string | undefined;

const TCP_SECURE_PORT = 9440;
const TLS_CONFIG = `<clickhouse>
  <tcp_port_secure>9440</tcp_port_secure>
  <openSSL>
    <server>
      <certificateFile>/etc/clickhouse-server/certs/server.crt</certificateFile>
      <privateKeyFile>/etc/clickhouse-server/certs/server.key</privateKeyFile>
      <verificationMode>none</verificationMode>
      <cacheSessions>true</cacheSessions>
      <disableProtocols>sslv2,sslv3</disableProtocols>
      <preferServerCiphers>true</preferServerCiphers>
    </server>
  </openSSL>
</clickhouse>
`;

function removeTlsFixtureDir() {
  if (!tlsFixtureDir) return;
  rmSync(tlsFixtureDir, { recursive: true, force: true });
  tlsFixtureDir = undefined;
}

function createTlsFixtureDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "chwire-clickhouse-tls-"));
  try {
    execFileSync(
      "openssl",
      [
        "req",
        "-x509",
        "-newkey",
        "rsa:2048",
        "-sha256",
        "-days",
        "1",
        "-nodes",
        "-keyout",
        join(dir, "server.key"),
        "-out",
        join(dir, "server.crt"),
        "-subj",
        "/CN=localhost",
        "-addext",
        "subjectAltName=DNS:localhost,IP:127.0.0.1",
      ],
      { stdio: "ignore" },
    );
  } catch (cause) {
    rmSync(dir, { recursive: true, force: true });
    throw new Error("openssl is required to generate ClickHouse TLS test certificates", { cause });
  }
  return dir;
}

export async function startClickHouse(version = "25.8", options: { tls?: boolean } = {}) {
  // Reuse an externally-managed server (set by fuzz/parallel.ts) so parallel
  // fuzz processes share one ClickHouse instead of each starting a container.
  // TLS needs a purpose-built container, so it always starts its own.
  const sharedUrl = process.env.FUZZ_CH_URL;
  if (sharedUrl && !options.tls) {
    const u = new URL(sharedUrl);
    return {
      container: undefined,
      url: sharedUrl,
      host: u.hostname,
      port: Number(u.port),
      tcpPort: Number(process.env.FUZZ_CH_TCP_PORT),
      tcpSecurePort: undefined,
      username: "default",
      password: "password",
    };
  }

  console.log("Starting ClickHouse container...");

  const clickhouse = new ClickHouseContainer(`clickhouse/clickhouse-server:${version}`)
    .withDatabase("default")
    .withUsername("default")
    .withPassword("password");

  if (options.tls) {
    tlsFixtureDir = createTlsFixtureDir();
    clickhouse
      .withExposedPorts(TCP_SECURE_PORT)
      .withCopyContentToContainer([
        {
          content: TLS_CONFIG,
          target: "/etc/clickhouse-server/config.d/ssl.xml",
          mode: 0o644,
        },
      ])
      .withCopyFilesToContainer([
        {
          source: join(tlsFixtureDir, "server.crt"),
          target: "/etc/clickhouse-server/certs/server.crt",
          mode: 0o644,
        },
        {
          source: join(tlsFixtureDir, "server.key"),
          target: "/etc/clickhouse-server/certs/server.key",
          mode: 0o644,
        },
      ]);
  }

  try {
    container = await clickhouse.start();
  } catch (cause) {
    removeTlsFixtureDir();
    throw cause;
  }

  const host = container.getHost();
  const port = container.getMappedPort(8123);
  const tcpPort = container.getMappedPort(9000);
  const tcpSecurePort = options.tls ? container.getMappedPort(TCP_SECURE_PORT) : undefined;
  const url = `http://${host}:${port}`;

  console.log(
    `ClickHouse started at ${url} (TCP: ${tcpPort}${tcpSecurePort ? `, TLS: ${tcpSecurePort}` : ""})`,
  );
  return {
    container,
    url,
    host,
    port,
    tcpPort,
    tcpSecurePort,
    username: "default",
    password: "password",
  };
}

export async function stopClickHouse() {
  try {
    if (container) {
      console.log("Stopping ClickHouse container...");
      await container.stop();
    }
  } finally {
    removeTlsFixtureDir();
  }
}
