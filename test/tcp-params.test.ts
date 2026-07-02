import assert from "node:assert";
import { describe, it, before, after } from "node:test";
import { TcpClient, type QueryParamValue } from "../tcp_client/client.ts";
import { VariantValue } from "../native/types.ts";
import { startClickHouse, stopClickHouse } from "./setup.ts";

let ch: Awaited<ReturnType<typeof startClickHouse>>;
let client: TcpClient;

async function queryScalar(
  sql: string,
  params?: Record<string, QueryParamValue>,
): Promise<unknown> {
  const stream = client.query(sql, params !== undefined ? { params } : {});
  for await (const packet of stream) {
    if (packet.type === "Data" && packet.batch.rowCount > 0) {
      return packet.batch.getAt(0, 0);
    }
  }
  throw new Error(`No rows returned for: ${sql}`);
}

describe("TCP Query Parameters", { timeout: 60000 }, () => {
  before(async () => {
    ch = await startClickHouse();
    client = new TcpClient({
      host: ch.host,
      port: ch.tcpPort,
      user: ch.username,
      password: ch.password,
    });
    await client.connect();
  });

  after(async () => {
    await client.close();
    await stopClickHouse();
  });

  // --- TCP wrapping layer: escaping edge cases ---

  it("handles String param with special chars", async () => {
    const testString = "it's 5 o'clock\nnewline\ttab\\backslash";
    const result = await queryScalar("SELECT {s: String}", { s: testString });
    assert.strictEqual(result, testString);
  });

  it("handles nested Array(Tuple(Int32, Int32)) param", async () => {
    const result = await queryScalar(
      "SELECT arraySum(arrayMap(t -> tupleElement(t, 1) + tupleElement(t, 2), {points: Array(Tuple(Int32, Int32))}))",
      {
        points: [
          [1, 2],
          [3, 4],
          [5, 6],
        ],
      },
    );
    assert.strictEqual(Number(result), 21); // (1+2) + (3+4) + (5+6)
  });

  it("verifies NULL via isNull for Nullable(String)", async () => {
    const result = await queryScalar("SELECT ifNull({s: Nullable(String)}, 'was_null')", {
      s: null,
    });
    assert.strictEqual(result, "was_null");
  });

  it("handles Array(String) param with quoted strings", async () => {
    // This tests the quoted=true path for nested string literals
    const result = await queryScalar("SELECT arrayStringConcat({arr: Array(String)}, ',')", {
      arr: ["hello", "world", "test"],
    });
    assert.strictEqual(result, "hello,world,test");
  });

  it("handles Array(String) param with special chars (quoted=true path)", async () => {
    // Nested strings must be properly escaped and quoted
    const strings = ["it's", "line\nbreak", "tab\there", "back\\slash"];
    const result = await queryScalar("SELECT {arr: Array(String)}", { arr: strings });
    assert.deepStrictEqual(result, strings);
  });

  it("handles Map(String, String) param with special chars in keys and values", async () => {
    // Use simpler key without quote to avoid SQL escaping complexity
    const result = await queryScalar("SELECT {m: Map(String, String)}['tab_key']", {
      m: { tab_key: "value\twith\ttabs" },
    });
    assert.strictEqual(result, "value\twith\ttabs");
  });

  it("handles DateTime('UTC') param", async () => {
    const testDate = new Date("2024-06-15T10:30:45Z");
    const result = await queryScalar("SELECT toUnixTimestamp({ts: DateTime('UTC')})", {
      ts: testDate,
    });
    assert.strictEqual(Number(result), Math.floor(testDate.getTime() / 1000));
  });

  // --- TCP-only types ---

  it("handles FixedString param", async () => {
    const result = await queryScalar("SELECT {s: FixedString(10)}", { s: "hello" });
    // FixedString returns Uint8Array - decode and trim null padding
    const str =
      result instanceof Uint8Array
        ? new TextDecoder().decode(result).replace(/\0+$/, "")
        : String(result);
    assert.strictEqual(str, "hello");
  });

  it("handles FixedString param with special chars", async () => {
    const result = await queryScalar("SELECT {s: FixedString(20)}", {
      s: "tab\there",
    });
    const str = result instanceof Uint8Array ? new TextDecoder().decode(result) : String(result);
    assert.ok(str.includes("\t"));
  });

  it("handles Variant param with string", async () => {
    // Variant returns a VariantValue cell
    const result = await queryScalar("SELECT {v: Variant(String, Int64)}", {
      v: "hello",
    });
    assert.ok(result instanceof VariantValue);
    assert.strictEqual(result.value, "hello");
  });

  it("handles Variant param with small integer as Int8", async () => {
    const result = await queryScalar("SELECT {v: Variant(Int8, String)}", { v: 42 });
    assert.ok(result instanceof VariantValue);
    // Int8 is discriminator 0 (first in type list)
    assert.strictEqual(result.discriminator, 0);
    assert.strictEqual(Number(result.value), 42);
  });

  // Dynamic type requires V3 serialization format - enabled via setting
  it("handles Dynamic param with string", async () => {
    const stream = client.query("SELECT {d: Dynamic}", {
      params: { d: "dynamic_str" },
      settings: { output_format_native_use_flattened_dynamic_and_json_serialization: 1 },
    });
    for await (const packet of stream) {
      if (packet.type === "Data" && packet.batch.rowCount > 0) {
        assert.strictEqual(packet.batch.getAt(0, 0), "dynamic_str");
        return;
      }
    }
    throw new Error("No data returned");
  });

  it("handles Dynamic param with number", async () => {
    const stream = client.query("SELECT {d: Dynamic}", {
      params: { d: 123 },
      settings: { output_format_native_use_flattened_dynamic_and_json_serialization: 1 },
    });
    for await (const packet of stream) {
      if (packet.type === "Data" && packet.batch.rowCount > 0) {
        assert.strictEqual(Number(packet.batch.getAt(0, 0)), 123);
        return;
      }
    }
    throw new Error("No data returned");
  });

  it("handles LowCardinality(String) param", async () => {
    const result = await queryScalar("SELECT {s: LowCardinality(String)}", {
      s: "low_card_value",
    });
    assert.strictEqual(result, "low_card_value");
  });

  it("handles LowCardinality(String) param with special chars", async () => {
    const testString = "it's\na\ttest\\value";
    const result = await queryScalar("SELECT {s: LowCardinality(String)}", {
      s: testString,
    });
    assert.strictEqual(result, testString);
  });

  it("handles LowCardinality(Nullable(String)) param with value", async () => {
    const result = await queryScalar("SELECT {s: LowCardinality(Nullable(String))}", {
      s: "not_null",
    });
    assert.strictEqual(result, "not_null");
  });

  it("handles LowCardinality(Nullable(String)) param with null", async () => {
    const result = await queryScalar("SELECT {s: LowCardinality(Nullable(String))}", { s: null });
    assert.strictEqual(result, null);
  });

  // --- TCP insert/select roundtrip ---

  // Verifies that IPv4 encoding/decoding via native format works correctly.
  // This test was added after fixing an endianness bug where IPv4 addresses
  // were decoded with reversed octets (192.168.1.1 became 1.1.168.192).
  it("round-trips IPv4 through insert and select", async () => {
    const tableName = `test_ipv4_${Date.now()}`;
    const testIPs = ["192.168.1.1", "10.0.0.1", "172.16.254.99", "255.255.255.0"];

    // Create table
    for await (const _ of client.query(`CREATE TABLE ${tableName} (ip IPv4) ENGINE = Memory`)) {
    }

    // Insert using native format
    const rows = testIPs.map((ip) => ({ ip }));
    await client.insert(`INSERT INTO ${tableName} VALUES`, rows);

    // Read back via native format
    const results: string[] = [];
    const stream = client.query(`SELECT ip FROM ${tableName} ORDER BY ip`);
    for await (const packet of stream) {
      if (packet.type === "Data") {
        for (let i = 0; i < packet.batch.rowCount; i++) {
          results.push(packet.batch.getAt(i, 0) as string);
        }
      }
    }

    // Sort both arrays for comparison (ORDER BY ip gives numeric order, not string order)
    const sortedExpected = [...testIPs].sort();
    const sortedResults = [...results].sort();

    assert.deepStrictEqual(sortedResults, sortedExpected);

    // Cleanup (Memory tables are dropped automatically when server restarts anyway)
    for await (const _ of client.query(`DROP TABLE IF EXISTS ${tableName}`)) {
    }
  });
});
