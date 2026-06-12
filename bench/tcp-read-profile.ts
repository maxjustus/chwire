/**
 * Profiles the TCP client's bulk-read path: throughput, per-block read/decode
 * time, and kernel read stop/start churn on the socket.
 *
 * The churn metric is the mechanism behind WAN throughput collapse: each
 * handle.readStop() leaves arriving data in the kernel receive buffer, which
 * shrinks the advertised TCP window and defeats receive-window autotuning.
 * A healthy bulk read shows ~0 readStop calls; the old async-iterator reader
 * showed one per ~64KB (the stream highWaterMark).
 *
 * Usage:
 *   npx tsx bench/tcp-read-profile.ts [--http] [--runs N]
 *
 * Environment:
 *   CH_HOST      - host (default: localhost)
 *   CH_PORT      - TCP port (default: 9000)
 *   CH_USER      - username (default: default)
 *   CH_PASSWORD  - password (default: "")
 *   CH_TLS       - set to 1 for TLS (default: off)
 *   CH_HTTP_URL  - HTTP interface for --http (default derived: http://host:8123
 *                  or https://host:8443 when CH_TLS=1)
 *   ROWS         - row count for the default query (default: 3000000)
 *   COMPRESSION  - lz4 | zstd | false (default: lz4)
 *   QUERY        - override the query entirely
 */
import { TcpClient } from "../tcp_client/client.ts";

const HOST = process.env.CH_HOST ?? "localhost";
const PORT = Number(process.env.CH_PORT ?? 9000);
const USER = process.env.CH_USER ?? "default";
const PASSWORD = process.env.CH_PASSWORD ?? "";
const TLS = process.env.CH_TLS === "1";
const ROWS = Number(process.env.ROWS ?? 3_000_000);
const COMPRESSION = process.env.COMPRESSION ?? "lz4";
const QUERY =
  process.env.QUERY ??
  `SELECT number, toString(number) AS s, number / 3 AS f, number * 2 AS d FROM numbers(${ROWS})`;

const RUNS = Number(process.argv[process.argv.indexOf("--runs") + 1] || 3);
const INCLUDE_HTTP = process.argv.includes("--http");

type SocketHandle = Record<string, (...args: unknown[]) => unknown>;

/** Counts kernel read stop/start churn by patching the socket's internal handle (Node only). */
function instrumentHandle(socket: unknown) {
  const counters = { stops: 0, stoppedMs: 0, maxStallMs: 0, supported: false };
  const handle = (socket as { _handle?: SocketHandle })._handle;
  if (!handle?.readStop || !handle?.readStart) return counters;
  counters.supported = true;
  let stoppedSince = -1;
  const origStop = handle.readStop;
  const origStart = handle.readStart;
  handle.readStop = function (...args: unknown[]) {
    counters.stops++;
    stoppedSince = performance.now();
    return origStop.apply(this, args);
  };
  handle.readStart = function (...args: unknown[]) {
    if (stoppedSince >= 0) {
      const stall = performance.now() - stoppedSince;
      counters.stoppedMs += stall;
      if (stall > counters.maxStallMs) counters.maxStallMs = stall;
      stoppedSince = -1;
    }
    return origStart.apply(this, args);
  };
  return counters;
}

async function runTcp(): Promise<number> {
  const client = new TcpClient({
    host: HOST,
    port: PORT,
    user: USER,
    password: PASSWORD,
    compression: COMPRESSION === "false" ? false : (COMPRESSION as "lz4" | "zstd"),
    ...(TLS ? { tls: true } : {}),
  });
  await client.connect();
  const socket = (client as unknown as { socket: { bytesRead: number } }).socket;
  const churn = instrumentHandle(socket);

  const bytesBefore = socket.bytesRead;
  let rows = 0;
  let blocks = 0;
  let decodeMs = 0;
  const t0 = performance.now();
  for await (const packet of client.query(QUERY)) {
    if (packet.type === "Data") {
      rows += packet.batch.rowCount;
      blocks++;
      decodeMs += packet.batch.decodeTimeMs ?? 0;
    }
  }
  const wallMs = performance.now() - t0;
  const bytes = socket.bytesRead - bytesBefore;
  client.close();

  const mbps = bytes / 1e6 / (wallMs / 1000);
  let line =
    `tcp:  ${(bytes / 1e6).toFixed(1)}MB wire, ${rows} rows, ${blocks} blocks, ` +
    `${wallMs.toFixed(0)}ms wall (${mbps.toFixed(1)}MB/s), decode ${decodeMs.toFixed(0)}ms`;
  if (churn.supported) {
    line +=
      `, readStop x${churn.stops}` +
      (churn.stops > 0
        ? ` (${churn.stoppedMs.toFixed(1)}ms stopped, max stall ${churn.maxStallMs.toFixed(2)}ms)`
        : "");
  }
  console.log(line);
  return mbps;
}

async function runHttp(): Promise<number> {
  const base = process.env.CH_HTTP_URL ?? (TLS ? `https://${HOST}:8443` : `http://${HOST}:8123`);
  const url = `${base}/?query=${encodeURIComponent(`${QUERY} FORMAT Native`)}`;
  const t0 = performance.now();
  // Without this, fetch silently negotiates gzip and transparently
  // decompresses, making wall time reflect far fewer wire bytes than counted.
  const res = await fetch(url, {
    headers: {
      "X-ClickHouse-User": USER,
      "X-ClickHouse-Key": PASSWORD,
      "Accept-Encoding": "identity",
    },
  });
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  let bytes = 0;
  for await (const chunk of res.body) {
    bytes += chunk.length;
  }
  const wallMs = performance.now() - t0;
  const mbps = bytes / 1e6 / (wallMs / 1000);
  const encoding = res.headers.get("content-encoding") ?? "identity";
  console.log(
    `http: ${(bytes / 1e6).toFixed(1)}MB wire (${encoding}), ${wallMs.toFixed(0)}ms wall (${mbps.toFixed(1)}MB/s), transport only (no decode)`,
  );
  return mbps;
}

function median(xs: number[]): number {
  const sorted = [...xs].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)]!;
}

async function main() {
  console.log(
    `target=${HOST}:${PORT} tls=${TLS} compression=${COMPRESSION} runs=${RUNS}\nquery: ${QUERY}\n`,
  );
  const tcpRates: number[] = [];
  const httpRates: number[] = [];
  for (let i = 0; i < RUNS; i++) {
    tcpRates.push(await runTcp());
    if (INCLUDE_HTTP) httpRates.push(await runHttp());
  }
  console.log(`\nmedian tcp: ${median(tcpRates).toFixed(1)}MB/s`);
  if (INCLUDE_HTTP) console.log(`median http: ${median(httpRates).toFixed(1)}MB/s`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
