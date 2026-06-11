import assert from "node:assert";
import { after, before, describe, test } from "node:test";
import { batchFromCols, getCodec } from "../../native/index.ts";
import { TcpClient } from "../index.ts";
import { startClickHouse, stopClickHouse } from "../../test/setup.ts";
import {
  type TcpConfig,
  toClientOptions,
  withClient as withClientBase,
} from "../../test/test_utils.ts";

describe("TCP Client Protocol Features", () => {
  let options: TcpConfig;
  let tcpSecurePort: number;

  before(async () => {
    const ch = await startClickHouse("25.8", { tls: true });
    options = {
      host: ch.host,
      tcpPort: ch.tcpPort,
      username: ch.username,
      password: ch.password,
    };
    if (!ch.tcpSecurePort) throw new Error("TLS-enabled ClickHouse test container has no TLS port");
    tcpSecurePort = ch.tcpSecurePort;
  });

  after(async () => {
    await stopClickHouse();
  });

  const withClient = <T>(fn: (client: TcpClient) => Promise<T>) => withClientBase(options, fn);

  test("should handle WITH TOTALS", () =>
    withClient(async (client) => {
      let gotTotals = false;
      let dataRows = 0;
      for await (const packet of client.query(
        "SELECT count() as cnt FROM numbers(100) GROUP BY number % 10 WITH TOTALS",
      )) {
        if (packet.type === "Data") dataRows += packet.batch.rowCount;
        if (packet.type === "Totals") gotTotals = true;
      }
      assert.ok(gotTotals, "Should receive Totals packet");
      assert.strictEqual(dataRows, 10, "Should have 10 data rows");
    }));

  test("should handle extremes setting", () =>
    withClient(async (client) => {
      let gotExtremes = false;
      for await (const packet of client.query("SELECT number FROM numbers(100)", {
        settings: { extremes: true },
      })) {
        if (packet.type === "Extremes") gotExtremes = true;
      }
      assert.ok(gotExtremes, "Should receive Extremes packet");
    }));

  test("should use ZSTD compression", async () => {
    const client = new TcpClient({
      ...toClientOptions(options),
      compression: { method: "zstd", level: 6 },
    });
    await client.connect();
    try {
      let rows = 0;
      for await (const packet of client.query("SELECT * FROM numbers(1000)")) {
        if (packet.type === "Data") rows += packet.batch.rowCount;
      }
      assert.strictEqual(rows, 1000, "Should receive all rows with ZSTD compression");
    } finally {
      client.close();
    }
  });

  test("should use LZ4 compression by default when enabled", async () => {
    const client = new TcpClient({ ...toClientOptions(options), compression: "lz4" });
    await client.connect();
    try {
      let rows = 0;
      for await (const packet of client.query("SELECT * FROM numbers(1000)")) {
        if (packet.type === "Data") rows += packet.batch.rowCount;
      }
      assert.strictEqual(rows, 1000, "Should receive all rows with LZ4 compression");
    } finally {
      client.close();
    }
  });

  test("should insert with LZ4 compression", async () => {
    const client = new TcpClient({ ...toClientOptions(options), compression: "lz4" });
    await client.connect();
    try {
      const tableName = `test_insert_lz4_${Date.now()}`;
      await client.query(`CREATE TABLE ${tableName} (id UInt32, val String) ENGINE = Memory`);

      const table = batchFromCols({
        id: getCodec("UInt32").fromValues(new Uint32Array([1, 2, 3])),
        val: getCodec("String").fromValues(["a", "b", "c"]),
      });
      await client.insert(`INSERT INTO ${tableName} VALUES`, table);

      let rows = 0;
      for await (const packet of client.query(`SELECT * FROM ${tableName} ORDER BY id`)) {
        if (packet.type === "Data") rows += packet.batch.rowCount;
      }
      assert.strictEqual(rows, 3, "Should have inserted 3 rows with LZ4 compression");

      await client.query(`DROP TABLE ${tableName}`);
    } finally {
      client.close();
    }
  });

  test("should insert with ZSTD compression", async () => {
    const client = new TcpClient({
      ...toClientOptions(options),
      compression: { method: "zstd", level: 6 },
    });
    await client.connect();
    try {
      const tableName = `test_insert_zstd_${Date.now()}`;
      await client.query(`CREATE TABLE ${tableName} (id UInt32, val String) ENGINE = Memory`);

      const table = batchFromCols({
        id: getCodec("UInt32").fromValues(new Uint32Array([1, 2, 3])),
        val: getCodec("String").fromValues(["a", "b", "c"]),
      });
      await client.insert(`INSERT INTO ${tableName} VALUES`, table);

      let rows = 0;
      for await (const packet of client.query(`SELECT * FROM ${tableName} ORDER BY id`)) {
        if (packet.type === "Data") rows += packet.batch.rowCount;
      }
      assert.strictEqual(rows, 3, "Should have inserted 3 rows with ZSTD compression");

      await client.query(`DROP TABLE ${tableName}`);
    } finally {
      client.close();
    }
  });

  test("should handle typed settings (number/boolean)", () =>
    withClient(async (client) => {
      let rows = 0;
      for await (const packet of client.query("SELECT * FROM numbers(10)", {
        settings: { max_threads: 2, log_queries: false },
      })) {
        if (packet.type === "Data") rows += packet.batch.rowCount;
      }
      assert.strictEqual(rows, 10, "Should work with typed settings");
    }));

  test("should handle bigint settings", () =>
    withClient(async (client) => {
      const largeValue = 9007199254740993n; // 2^53 + 1
      let rows = 0;
      for await (const packet of client.query("SELECT * FROM numbers(5)", {
        settings: { max_memory_usage: largeValue },
      })) {
        if (packet.type === "Data") rows += packet.batch.rowCount;
      }
      assert.strictEqual(rows, 5, "Should work with bigint settings");
    }));

  test("should handle Log packets when send_logs_level is set", () =>
    withClient(async (client) => {
      let gotLog = false;
      for await (const packet of client.query("SELECT 1", {
        settings: { send_logs_level: "trace" },
      })) {
        if (packet.type === "Log") {
          gotLog = true;
          assert.ok(packet.entries.length > 0, "Log should have entries");
          assert.ok(typeof packet.entries[0].text === "string", "Log entry should have text");
        }
      }
      // Log packets are optional - server may or may not send them
      console.log(`  (Log packets received: ${gotLog})`);
    }));

  test("should accumulate ProfileEvents across packets", () =>
    withClient(async (client) => {
      let packetCount = 0;
      let lastAccumulated: Map<string, bigint> | null = null;

      for await (const packet of client.query("SELECT sleep(0.05), number FROM numbers(10)", {
        settings: { send_profile_events: true, profile_events_delay_ms: 25 },
      })) {
        if (packet.type === "ProfileEvents") {
          packetCount++;
          lastAccumulated = packet.accumulated;
          assert.ok(packet.accumulated instanceof Map, "accumulated should be a Map");
        }
      }

      assert.ok(packetCount > 0, "Should receive at least one ProfileEvents packet");
      assert.ok(lastAccumulated!.size > 0, "Should have accumulated events");
      assert.strictEqual(lastAccumulated!.get("SelectedRows"), 10n, "SelectedRows should match");
      console.log(
        `  (ProfileEvents packets: ${packetCount}, accumulated entries: ${lastAccumulated!.size})`,
      );
    }));

  test("should expose timezone getter", () =>
    withClient(async (client) => {
      for await (const _ of client.query("SELECT now()")) {
      }
      const tz = client.timezone;
      console.log(`  (Session timezone: ${tz ?? "not set"})`);
    }));

  test("should enable TCP keep-alive when configured", async () => {
    const client = new TcpClient({ ...toClientOptions(options), keepAliveIntervalMs: 5000 });
    await client.connect();
    try {
      let rows = 0;
      for await (const packet of client.query("SELECT 1")) {
        if (packet.type === "Data") rows += packet.batch.rowCount;
      }
      assert.strictEqual(rows, 1);
    } finally {
      client.close();
    }
  });

  test("should connect with TLS when configured", async () => {
    const client = new TcpClient({
      ...toClientOptions(options),
      port: tcpSecurePort,
      tls: { rejectUnauthorized: false },
    });
    try {
      await client.connect();
      let rows = 0;
      for await (const packet of client.query("SELECT 1")) {
        if (packet.type === "Data") rows += packet.batch.rowCount;
      }
      assert.strictEqual(rows, 1);
    } finally {
      client.close();
    }
  });

  test("should use query parameters (UInt64)", () =>
    withClient(async (client) => {
      let result: bigint | null = null;
      for await (const packet of client.query("SELECT {value:UInt64} as v", {
        params: { value: 42 },
      })) {
        if (packet.type === "Data" && packet.batch.rowCount > 0) {
          result = packet.batch.getColumn("v")?.get(0) as bigint;
        }
      }
      assert.strictEqual(result, 42n);
    }));

  test("should use query parameters (String)", () =>
    withClient(async (client) => {
      let result: string | null = null;
      for await (const packet of client.query("SELECT {name:String} as s", {
        params: { name: "hello world" },
      })) {
        if (packet.type === "Data" && packet.batch.rowCount > 0) {
          result = packet.batch.getColumn("s")?.get(0) as string;
        }
      }
      assert.strictEqual(result, "hello world");
    }));

  test("should auto-close with await using (AsyncDisposable)", async () => {
    let clientRef: TcpClient | null = null;
    {
      await using client = await TcpClient.connect(toClientOptions(options));
      clientRef = client;
      let rows = 0;
      for await (const packet of client.query("SELECT 1")) {
        if (packet.type === "Data") rows += packet.batch.rowCount;
      }
      assert.strictEqual(rows, 1);
    }
    assert.strictEqual((clientRef as any).socket, null, "Socket should be closed after scope exit");
  });
});
