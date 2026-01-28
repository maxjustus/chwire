import assert from "node:assert";
import { describe, it, before, after } from "node:test";
import { TcpClient, type QueryParamValue } from "../tcp_client/client.ts";
import { startClickHouse, stopClickHouse } from "./setup.ts";

let ch: Awaited<ReturnType<typeof startClickHouse>>;
let client: TcpClient;

async function queryScalar(sql: string, params: Record<string, QueryParamValue>): Promise<unknown> {
  const stream = client.query(sql, { params });
  for await (const packet of stream) {
    if (packet.type === "Data" && packet.batch.rowCount > 0) {
      return packet.batch.getAt(0, 0);
    }
  }
  throw new Error(`No rows returned for: ${sql}`);
}

function randomString(length: number): string {
  const chars: string[] = [];
  for (let i = 0; i < length; i++) {
    // Mix of ASCII printable, control chars, and special chars
    const choice = Math.random();
    if (choice < 0.7) {
      // Printable ASCII
      chars.push(String.fromCharCode(32 + Math.floor(Math.random() * 95)));
    } else if (choice < 0.85) {
      // Special chars that need escaping
      chars.push(["'", '"', "\\", "\n", "\t", "\r", "\0"][Math.floor(Math.random() * 7)]);
    } else {
      // Control chars and extended ASCII
      chars.push(String.fromCharCode(Math.floor(Math.random() * 256)));
    }
  }
  return chars.join("");
}

describe("Query Parameter Fuzzing", { timeout: 120000 }, () => {
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
    client.close();
    await stopClickHouse();
  });

  it("round-trips random strings through String param", async () => {
    const iterations = 50;
    for (let i = 0; i < iterations; i++) {
      const testStr = randomString(1 + Math.floor(Math.random() * 100));
      try {
        const result = await queryScalar("SELECT {s: String}", { s: testStr });
        assert.strictEqual(result, testStr, `Failed on iteration ${i}`);
      } catch (err) {
        // Some strings may contain invalid UTF-8 sequences that ClickHouse rejects
        // That's acceptable - we just want to ensure no crashes or security issues
        if (!(err instanceof Error) || !err.message.includes("Cannot parse")) {
          throw err;
        }
      }
    }
  });

  it("round-trips random strings through Array(String) param", async () => {
    const iterations = 20;
    for (let i = 0; i < iterations; i++) {
      const arr = Array.from({ length: 1 + Math.floor(Math.random() * 5) }, () =>
        randomString(1 + Math.floor(Math.random() * 30)),
      );
      try {
        const result = await queryScalar("SELECT {arr: Array(String)}", { arr });
        assert.deepStrictEqual(result, arr, `Failed on iteration ${i}`);
      } catch (err) {
        if (!(err instanceof Error) || !err.message.includes("Cannot parse")) {
          throw err;
        }
      }
    }
  });

  it("handles SQL injection attempts in String param", async () => {
    const injections = [
      "'); DROP TABLE users; --",
      "1'; DELETE FROM users WHERE '1'='1",
      "\\'; SELECT * FROM system.tables; --",
      "' OR '1'='1",
      "'; TRUNCATE TABLE users; --",
      "1; UPDATE users SET admin=1 WHERE id=1; --",
    ];
    for (const injection of injections) {
      const result = await queryScalar("SELECT {s: String}", { s: injection });
      // The injection should be treated as a literal string, not executed
      assert.strictEqual(result, injection, `Injection not properly escaped: ${injection}`);
    }
  });

  it("handles deeply nested nulls", async () => {
    // Array of tuples with nullable elements, some null
    const data = [
      [null, 1],
      ["foo", 2],
      [null, 3],
    ];
    const result = await queryScalar("SELECT {arr: Array(Tuple(Nullable(String), Int32))}", {
      arr: data,
    });
    assert.deepStrictEqual(result, data);
  });
});
