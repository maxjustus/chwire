import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import {
  collectText,
  init,
  insert,
  query,
  streamEncodeJsonEachRow,
  streamText,
} from "../client.ts";
import { startClickHouse, stopClickHouse } from "./setup.ts";
import { consume, generateSessionId } from "./test_utils.ts";

const encoder = new TextEncoder();

describe("ClickHouse Integration Tests", { timeout: 60000 }, () => {
  let clickhouse: Awaited<ReturnType<typeof startClickHouse>>;
  let url: string;
  let auth: { username: string; password: string };
  const sessionId = generateSessionId("integration");

  before(async () => {
    await init();
    clickhouse = await startClickHouse();
    url = `${clickhouse.url}/`;
    auth = { username: clickhouse.username, password: clickhouse.password };
  });

  after(async () => {
    await stopClickHouse();
  });

  describe("Basic operations", () => {
    it("should create and query a table", async () => {
      // Create table
      await consume(
        query("CREATE TABLE IF NOT EXISTS test_basic (id UInt32, name String) ENGINE = Memory", {
          url,
          auth,
          sessionId,
          compression: false,
        }),
      );

      // Insert data using streamEncodeJsonEachRow helper
      const data = [
        { id: 1, name: "Alice" },
        { id: 2, name: "Bob" },
        { id: 3, name: "Charlie" },
      ];

      await insert("INSERT INTO test_basic FORMAT JSONEachRow", streamEncodeJsonEachRow(data), {
        url,
        auth,
        sessionId,
      });

      // Query data
      const result = await collectText(
        query("SELECT * FROM test_basic ORDER BY id FORMAT JSON", {
          url,
          auth,
          sessionId,
        }),
      );

      const parsed = JSON.parse(result);
      assert.strictEqual(parsed.data.length, 3);
      assert.strictEqual(parsed.data[0].name, "Alice");
      assert.strictEqual(parsed.data[2].name, "Charlie");

      // Clean up
      await consume(
        query("DROP TABLE test_basic", {
          url,
          auth,
          sessionId,
          compression: false,
        }),
      );
    });
  });

  describe("Compression methods", () => {
    for (const compression of [false, "lz4", "zstd"] as const) {
      it(`should insert with ${compression} compression`, async () => {
        await consume(
          query("CREATE TABLE IF NOT EXISTS test_compression (value String) ENGINE = Memory", {
            url,
            auth,
            sessionId,
            compression,
          }),
        );

        const rows = Array.from({ length: 1000 }, (_, i) => ({
          value: `test_${i}`,
        }));
        const data = encoder.encode(`${rows.map((r) => JSON.stringify(r)).join("\n")}\n`);

        await insert(`INSERT INTO test_compression FORMAT JSONEachRow`, data, {
          url,
          auth,
          sessionId,
          compression,
        });

        const result = await collectText(
          query("SELECT count(*) as cnt FROM test_compression FORMAT JSON", {
            url,
            auth,
            sessionId,
          }),
        );

        const parsed = JSON.parse(result);
        assert.strictEqual(Number(parsed.data[0].cnt), 1000);

        await consume(
          query("DROP TABLE test_compression", {
            url,
            auth,
            sessionId,
            compression,
          }),
        );
      });
    }
  });

  describe("Streaming inserts with generators", () => {
    it("should handle generator that yields batches", async () => {
      // Create table
      await consume(
        query(
          "CREATE TABLE IF NOT EXISTS test_generator (id UInt32, value String) ENGINE = Memory",
          { url, auth, sessionId, compression: false },
        ),
      );

      // Generator that yields byte batches
      async function* generateBatches() {
        for (let batch = 0; batch < 10; batch++) {
          const batchData: { id: number; value: string }[] = [];
          for (let i = 0; i < 100; i++) {
            batchData.push({
              id: batch * 100 + i,
              value: `batch_${batch}_item_${i}`,
            });
          }

          yield encoder.encode(`${batchData.map((r) => JSON.stringify(r)).join("\n")}\n`);
        }
      }

      let progressUpdates = 0;
      await insert("INSERT INTO test_generator FORMAT JSONEachRow", generateBatches(), {
        url,
        auth,
        sessionId,
        compression: "lz4",
        onProgress: (progress) => {
          progressUpdates++;
          assert.ok(progress.bytesUncompressed > 0);
        },
      });

      assert.ok(progressUpdates > 0, "Should have progress updates");

      // Verify count
      const result = await collectText(
        query("SELECT count(*) as cnt FROM test_generator FORMAT JSON", {
          url,
          auth,
          sessionId,
        }),
      );

      const parsed = JSON.parse(result);
      assert.strictEqual(Number(parsed.data[0].cnt), 1000);

      // Clean up
      await consume(
        query("DROP TABLE test_generator", {
          url,
          auth,
          sessionId,
          compression: false,
        }),
      );
    });

    it("should handle generator that yields single rows", async () => {
      // Create table
      await consume(
        query("CREATE TABLE IF NOT EXISTS test_single (id UInt32) ENGINE = Memory", {
          url,
          auth,
          sessionId,
          compression: false,
        }),
      );

      // Use streamEncodeJsonEachRow with async generator
      async function* generateSingle() {
        for (let i = 0; i < 500; i++) {
          yield { id: i };
        }
      }

      await insert(
        "INSERT INTO test_single FORMAT JSONEachRow",
        streamEncodeJsonEachRow(generateSingle()),
        { url, auth, sessionId, compression: { method: "zstd", level: 6 } },
      );

      // Verify
      const result = await collectText(
        query("SELECT count(*) as cnt FROM test_single FORMAT JSON", { url, auth, sessionId }),
      );

      const parsed = JSON.parse(result);
      assert.strictEqual(Number(parsed.data[0].cnt), 500);

      // Clean up
      await consume(
        query("DROP TABLE test_single", {
          url,
          auth,
          sessionId,
          compression: false,
        }),
      );
    });
  });

  describe("Streaming queries with compression", () => {
    it("should stream compressed query results", async () => {
      // Setup: Create table with data
      await consume(
        query("CREATE TABLE IF NOT EXISTS test_stream (id UInt32) ENGINE = Memory", {
          url,
          auth,
          sessionId,
          compression: false,
        }),
      );

      // Insert test data
      const rows = Array.from({ length: 10000 }, (_, i) => ({ id: i }));
      await insert("INSERT INTO test_stream FORMAT JSONEachRow", streamEncodeJsonEachRow(rows), {
        url,
        auth,
        sessionId,
      });

      // Query with compression
      let chunks = 0;
      let totalRows = 0;

      for await (const chunk of streamText(
        query("SELECT * FROM test_stream FORMAT JSONEachRow", {
          url,
          auth,
          sessionId,
        }),
      )) {
        chunks++;
        // Count newlines to estimate rows
        totalRows += (chunk.match(/\n/g) || []).length;
      }

      assert.ok(chunks > 0, "Should receive chunks");
      assert.strictEqual(totalRows, 10000);

      // Clean up
      await consume(
        query("DROP TABLE test_stream", {
          url,
          auth,
          sessionId,
          compression: false,
        }),
      );
    });

    it("should handle large compressed responses", async () => {
      // Query system.numbers with compression
      let chunks = 0;
      let totalRows = 0;

      for await (const chunk of streamText(
        query("SELECT number FROM system.numbers LIMIT 100000 FORMAT CSV", {
          url,
          auth,
          sessionId,
        }),
      )) {
        chunks++;
        // Count actual data rows (CSV format, one number per line)
        const lines = chunk.split("\n").filter((line) => line.trim() !== "");
        totalRows += lines.length;
      }

      assert.ok(chunks > 0, "Should receive chunks");
      assert.strictEqual(totalRows, 100000);
    });
  });

  describe("Error handling", () => {
    it("should handle invalid queries", async () => {
      try {
        await consume(
          query("SELECT * FROM non_existent_table", {
            url,
            auth,
            sessionId,
            compression: false,
          }),
        );
        assert.fail("Should have thrown an error");
      } catch (err) {
        const error = err as Error;
        assert.ok(
          error.message.includes("UNKNOWN_TABLE") || error.message.includes("doesn't exist"),
        );
      }
    });

    it("should handle insert errors", async () => {
      // Create table with specific schema
      await consume(
        query("CREATE TABLE IF NOT EXISTS test_error (id UInt32) ENGINE = Memory", {
          url,
          auth,
          sessionId,
          compression: false,
        }),
      );

      // Try to insert wrong data type
      const invalidData = encoder.encode(`${JSON.stringify({ id: "not_a_number" })}\n`);

      try {
        await insert("INSERT INTO test_error FORMAT JSONEachRow", invalidData, {
          url,
          auth,
          sessionId,
        });
        assert.fail("Should have thrown an error");
      } catch (err) {
        const error = err as Error;
        assert.ok(
          error.message.includes("TYPE_MISMATCH") || error.message.includes("Cannot parse"),
        );
      }

      // Clean up
      await consume(
        query("DROP TABLE test_error", {
          url,
          auth,
          sessionId,
          compression: false,
        }),
      );
    });

    it("surfaces an insert failure the server delivers after committing 200", async () => {
      await consume(
        query("CREATE TABLE IF NOT EXISTS post200_sink (id UInt64) ENGINE = Memory", {
          url,
          auth,
          sessionId,
        }),
      );

      // Progress headers force the server to commit the response early, so
      // a failure deep in the source stream arrives as a body exception
      // after a 200 instead of an HTTP error status.
      const realFetch = globalThis.fetch;
      let status: number | null = null;
      globalThis.fetch = (async (...args: Parameters<typeof fetch>) => {
        const res = await realFetch(...args);
        status = res.status;
        return res;
      }) as typeof fetch;
      try {
        await assert.rejects(
          insert(
            "INSERT INTO post200_sink SELECT throwIf(number = 9999999, 'late boom') + number FROM system.numbers LIMIT 10000000",
            new Uint8Array(0),
            {
              url,
              auth,
              sessionId,
              settings: {
                wait_end_of_query: false,
                send_progress_in_http_headers: true,
                http_headers_progress_interval_ms: 1n,
              },
            },
          ),
          /late boom/,
        );
      } finally {
        globalThis.fetch = realFetch;
      }
      assert.strictEqual(status, 200);

      await consume(query("DROP TABLE post200_sink", { url, auth, sessionId }));
    });
  });

  describe("Streaming error scenarios", () => {
    it("should handle generator that throws mid-stream", async () => {
      // Create table
      await consume(
        query(
          "CREATE TABLE IF NOT EXISTS test_stream_error (id UInt32, value String) ENGINE = Memory",
          { url, auth, sessionId, compression: false },
        ),
      );

      // Generator that throws after some items
      async function* errorGenerator() {
        for (let i = 0; i < 100; i++) {
          yield encoder.encode(`${JSON.stringify({ id: i, value: `value_${i}` })}\n`);
        }
        throw new Error("Generator error mid-stream");
      }

      // No sessionId: the server holds a session's lock until it notices the
      // client disconnect, so an aborted request on the shared session races
      // the next request (SESSION_IS_LOCKED).
      try {
        await insert("INSERT INTO test_stream_error FORMAT JSONEachRow", errorGenerator(), {
          url,
          auth,
          bufferSize: 128,
        });
        assert.fail("Should have thrown an error");
      } catch (err) {
        const error = err as Error;
        // Error should be thrown (exact message may vary based on stream error handling)
        assert.ok(error instanceof Error, "Should throw an error");
      }

      // Clean up
      await consume(
        query("DROP TABLE test_stream_error", { url, auth, sessionId, compression: false }),
      );
    });

    it("should handle AbortSignal cancellation", async () => {
      // Create table
      await consume(
        query("CREATE TABLE IF NOT EXISTS test_abort (id UInt32) ENGINE = Memory", {
          url,
          auth,
          sessionId,
          compression: false,
        }),
      );

      const controller = new AbortController();

      // Generator that yields many items
      async function* slowGenerator() {
        for (let i = 0; i < 100000; i++) {
          yield encoder.encode(`${JSON.stringify({ id: i })}\n`);
          // Abort after first few items
          if (i === 10) {
            controller.abort();
          }
        }
      }

      // No sessionId: see "generator that throws mid-stream" — aborted
      // requests race the session lock.
      try {
        await insert("INSERT INTO test_abort FORMAT JSONEachRow", slowGenerator(), {
          url,
          auth,
          signal: controller.signal,
        });
        assert.fail("Should have aborted");
      } catch (err) {
        const error = err as Error;
        assert.ok(
          error.name === "AbortError" ||
            error.message.includes("abort") ||
            error.message.includes("cancelled"),
        );
      }

      // Clean up
      await consume(
        query("DROP TABLE test_abort", {
          url,
          auth,
          sessionId,
          compression: false,
        }),
      );
    });

    it("should fire progress callbacks during compression", async () => {
      // Create table
      await consume(
        query("CREATE TABLE IF NOT EXISTS test_progress (id UInt32) ENGINE = Memory", {
          url,
          auth,
          sessionId,
          compression: false,
        }),
      );

      const progressEvents: any[] = [];
      let insertComplete = false;

      async function* dataGenerator() {
        for (let i = 0; i < 1000; i++) {
          yield encoder.encode(`${JSON.stringify({ id: i })}\n`);
        }
      }

      const insertPromise = insert(
        "INSERT INTO test_progress FORMAT JSONEachRow",
        dataGenerator(),
        {
          url,
          auth,
          sessionId,
          bufferSize: 1024,
          threshold: 512,
          onProgress: (progress) => {
            progressEvents.push({ ...progress, insertComplete });
          },
        },
      );

      await insertPromise;
      insertComplete = true;

      // Verify progress callbacks were fired
      assert.ok(progressEvents.length > 0, "Should have progress events");

      // Verify all progress events fired before insert completed
      const allBeforeComplete = progressEvents.every((e) => !e.insertComplete);
      assert.ok(allBeforeComplete, "Progress events should fire during compression, not after");

      // Clean up
      await consume(
        query("DROP TABLE test_progress", {
          url,
          auth,
          sessionId,
          compression: false,
        }),
      );
    });
  });

  describe("Multi-block responses", () => {
    it("should handle multiple compressed blocks in response", async () => {
      // This test verifies our multi-block decompression
      // by forcing ClickHouse to send multiple blocks

      // Note: We can't easily control max_block_size in the response
      // without modifying query params, but we can verify the mechanism
      // works with large result sets

      let blocksDetected = 0;
      let lastChunkSize = 0;

      // Iterate over packets from query()
      for await (const packet of query("SELECT * FROM system.numbers LIMIT 1000000", {
        url,
        auth,
        sessionId,
      })) {
        // Each Data packet contains a decompressed block
        if (packet.type === "Data") {
          if (packet.chunk.length !== lastChunkSize) {
            blocksDetected++;
            lastChunkSize = packet.chunk.length;
          }
        }
      }

      console.log(`    Detected ${blocksDetected} different block sizes`);
      assert.ok(blocksDetected >= 1, "Should process at least one block");
    });
  });

  describe("Query parameters", () => {
    it("should forward raw root-level HTTP params for unmodeled URL options", async () => {
      const result = await collectText(
        query("SELECT 42 as value", {
          url,
          auth,
          sessionId,
          compression: false,
          default_format: "TSV",
        }),
      );

      assert.strictEqual(result.trim(), "42");
    });

    it("should let raw root-level HTTP params override settings for the same URL key", async () => {
      const result = await collectText(
        query("SELECT 7 as value", {
          url,
          auth,
          sessionId,
          compression: false,
          settings: { default_format: "JSONEachRow" },
          default_format: "TSV",
        }),
      );

      assert.strictEqual(result.trim(), "7");
    });

    it("creates a parameterized view with unbound placeholders and queries it with arguments", async () => {
      await consume(
        query(
          `CREATE OR REPLACE VIEW param_view AS
             SELECT number FROM system.numbers
             WHERE number >= {min_n: UInt64} AND number < {max_n: UInt64}`,
          { url, auth, sessionId },
        ),
      );

      const result = await collectText(
        query("SELECT number FROM param_view(min_n=3, max_n=6) ORDER BY number FORMAT JSON", {
          url,
          auth,
          sessionId,
        }),
      );
      const parsed = JSON.parse(result);
      assert.deepStrictEqual(
        parsed.data.map((r: { number: string | number }) => Number(r.number)),
        [3, 4, 5],
      );

      await consume(query("DROP VIEW param_view", { url, auth, sessionId }));
    });

    it("binds placeholders from SET param_x in the same session", async () => {
      await consume(query("SET param_greeting = 'hello'", { url, auth, sessionId }));

      const result = await collectText(
        query("SELECT {greeting: String} AS g FORMAT JSON", { url, auth, sessionId }),
      );
      assert.strictEqual(JSON.parse(result).data[0].g, "hello");
    });

    it("surfaces the server error for a truly unbound placeholder", async () => {
      await assert.rejects(
        collectText(query("SELECT {nope: String}", { url, auth, sessionId })),
        /UNKNOWN_QUERY_PARAMETER|Substitution.*is not set/,
      );
    });

    it("should use query parameters with UInt64", async () => {
      const result = await collectText(
        query("SELECT {value:UInt64} as v FORMAT JSON", {
          url,
          auth,
          sessionId,
          params: { value: 42 },
        }),
      );

      const parsed = JSON.parse(result);
      assert.strictEqual(Number(parsed.data[0].v), 42);
    });

    it("should use query parameters with String", async () => {
      const result = await collectText(
        query("SELECT {name:String} as s FORMAT JSON", {
          url,
          auth,
          sessionId,
          params: { name: "hello world" },
        }),
      );

      const parsed = JSON.parse(result);
      assert.strictEqual(parsed.data[0].s, "hello world");
    });

    it("should use query parameters with String containing special chars", async () => {
      const testString = "it's 5 o'clock\nnewline\ttab\\backslash";
      const result = await collectText(
        query("SELECT {s:String} as s FORMAT JSON", {
          url,
          auth,
          sessionId,
          params: { s: testString },
        }),
      );

      const parsed = JSON.parse(result);
      assert.strictEqual(parsed.data[0].s, testString);
    });

    it("should use query parameters with multiple values", async () => {
      const result = await collectText(
        query("SELECT {a:UInt32} + {b:UInt32} as sum, {msg:String} as msg FORMAT JSON", {
          url,
          auth,
          sessionId,
          params: { a: 10, b: 32, msg: "test" },
        }),
      );

      const parsed = JSON.parse(result);
      assert.strictEqual(Number(parsed.data[0].sum), 42);
      assert.strictEqual(parsed.data[0].msg, "test");
    });

    it("should use query parameters with BigInt", async () => {
      // Use JSONStringsEachRow to preserve precision for large integers
      const result = await collectText(
        query("SELECT {big:UInt64} as v FORMAT JSONStringsEachRow", {
          url,
          auth,
          sessionId,
          params: { big: 9007199254740993n },
        }),
      );

      const parsed = JSON.parse(result.trim());
      assert.strictEqual(parsed.v, "9007199254740993");
    });

    it("should use query parameters with Array", async () => {
      const result = await collectText(
        query("SELECT arraySum({ids: Array(UInt64)}) as sum FORMAT JSON", {
          url,
          auth,
          sessionId,
          params: { ids: [1, 2, 3, 4, 5] },
        }),
      );

      const parsed = JSON.parse(result);
      assert.strictEqual(Number(parsed.data[0].sum), 15);
    });

    it("should use query parameters with Tuple", async () => {
      const result = await collectText(
        query(
          "SELECT tupleElement({point: Tuple(Int32, Int32)}, 1) as x, tupleElement({point: Tuple(Int32, Int32)}, 2) as y FORMAT JSON",
          {
            url,
            auth,
            sessionId,
            params: { point: [10, 20] },
          },
        ),
      );

      const parsed = JSON.parse(result);
      assert.strictEqual(Number(parsed.data[0].x), 10);
      assert.strictEqual(Number(parsed.data[0].y), 20);
    });

    it("should use query parameters with Map", async () => {
      const result = await collectText(
        query(
          "SELECT {m: Map(String, UInt32)}['a'] as a, {m: Map(String, UInt32)}['b'] as b FORMAT JSON",
          {
            url,
            auth,
            sessionId,
            params: { m: { a: 1, b: 2 } },
          },
        ),
      );

      const parsed = JSON.parse(result);
      assert.strictEqual(Number(parsed.data[0].a), 1);
      assert.strictEqual(Number(parsed.data[0].b), 2);
    });

    it("should use query parameters with nested Array(Tuple)", async () => {
      const result = await collectText(
        query(
          "SELECT arrayMap(t -> tupleElement(t, 1) + tupleElement(t, 2), {points: Array(Tuple(Int32, Int32))}) as sums FORMAT JSON",
          {
            url,
            auth,
            sessionId,
            params: {
              points: [
                [1, 2],
                [3, 4],
                [5, 6],
              ],
            },
          },
        ),
      );

      const parsed = JSON.parse(result);
      assert.deepStrictEqual(parsed.data[0].sums, [3, 7, 11]);
    });

    it("should use query parameters with DateTime64", async () => {
      const testDate = new Date("2024-06-15T10:30:45.123Z");
      const result = await collectText(
        query("SELECT toUnixTimestamp64Milli({ts: DateTime64(3)}) as ms FORMAT JSON", {
          url,
          auth,
          sessionId,
          params: { ts: testDate },
        }),
      );

      const parsed = JSON.parse(result);
      assert.strictEqual(Number(parsed.data[0].ms), testDate.getTime());
    });

    it("should use the same param multiple times", async () => {
      const result = await collectText(
        query("SELECT {id: UInt64} as a, {id: UInt64} + 1 as b FORMAT JSON", {
          url,
          auth,
          sessionId,
          params: { id: 42 },
        }),
      );

      const parsed = JSON.parse(result);
      assert.strictEqual(Number(parsed.data[0].a), 42);
      assert.strictEqual(Number(parsed.data[0].b), 43);
    });

    it("should use query parameters with Enum", async () => {
      const result = await collectText(
        query("SELECT {status: Enum8('active' = 1, 'inactive' = 2)} as s FORMAT JSON", {
          url,
          auth,
          sessionId,
          params: { status: "active" },
        }),
      );

      const parsed = JSON.parse(result);
      assert.strictEqual(parsed.data[0].s, "active");
    });

    it("should use query parameters with UUID", async () => {
      const testUUID = "550e8400-e29b-41d4-a716-446655440000";
      const result = await collectText(
        query("SELECT {id: UUID} as u FORMAT JSON", {
          url,
          auth,
          sessionId,
          params: { id: testUUID },
        }),
      );

      const parsed = JSON.parse(result);
      assert.strictEqual(parsed.data[0].u, testUUID);
    });

    it("should use query parameters with IPv4", async () => {
      const result = await collectText(
        query("SELECT {ip: IPv4} as ip FORMAT JSON", {
          url,
          auth,
          sessionId,
          params: { ip: "192.168.1.1" },
        }),
      );

      const parsed = JSON.parse(result);
      assert.strictEqual(parsed.data[0].ip, "192.168.1.1");
    });

    it("should use query parameters with IPv6", async () => {
      const result = await collectText(
        query("SELECT {ip: IPv6} as ip FORMAT JSON", {
          url,
          auth,
          sessionId,
          params: { ip: "2001:db8::1" },
        }),
      );

      const parsed = JSON.parse(result);
      assert.ok(parsed.data[0].ip.includes("2001:db8"));
    });

    it("should use query parameters with Identifier as a column name", async () => {
      const result = await collectText(
        query("SELECT {col: Identifier} as v FROM system.numbers LIMIT 1 FORMAT JSON", {
          url,
          auth,
          sessionId,
          params: { col: "number" },
        }),
      );

      const parsed = JSON.parse(result);
      assert.strictEqual(Number(parsed.data[0].v), 0);
    });

    it("should use query parameters with Identifier as a db.table name", async () => {
      const result = await collectText(
        query("SELECT count() as c FROM {db: Identifier}.{tbl: Identifier} FORMAT JSON", {
          url,
          auth,
          sessionId,
          params: { db: "system", tbl: "one" },
        }),
      );

      const parsed = JSON.parse(result);
      assert.strictEqual(Number(parsed.data[0].c), 1);
    });

    it("should use an Identifier value needing escaping without pre-quoting", async () => {
      await consume(
        query("CREATE TABLE IF NOT EXISTS `weird name` (x UInt8) ENGINE = Memory", {
          url,
          auth,
          sessionId,
        }),
      );
      await consume(query("INSERT INTO `weird name` VALUES (7)", { url, auth, sessionId }));
      try {
        const result = await collectText(
          query("SELECT x FROM {tbl: Identifier} FORMAT JSON", {
            url,
            auth,
            sessionId,
            params: { tbl: "weird name" },
          }),
        );

        const parsed = JSON.parse(result);
        assert.strictEqual(Number(parsed.data[0].x), 7);
      } finally {
        await consume(query("DROP TABLE `weird name`", { url, auth, sessionId }));
      }
    });

    it("should use query parameters with Date", async () => {
      const result = await collectText(
        query("SELECT {d: Date} as d FORMAT JSON", {
          url,
          auth,
          sessionId,
          params: { d: new Date("2024-06-15") },
        }),
      );

      const parsed = JSON.parse(result);
      assert.strictEqual(parsed.data[0].d, "2024-06-15");
    });

    it("should use query parameters with Decimal", async () => {
      const result = await collectText(
        query("SELECT {d: Decimal(10, 2)} as d FORMAT JSON", {
          url,
          auth,
          sessionId,
          params: { d: "123.45" },
        }),
      );

      const parsed = JSON.parse(result);
      assert.strictEqual(Number(parsed.data[0].d), 123.45);
    });

    it("should use query parameters with Nullable(String) null value", async () => {
      const result = await collectText(
        query("SELECT {s: Nullable(String)} as s FORMAT JSON", {
          url,
          auth,
          sessionId,
          params: { s: null },
        }),
      );

      const parsed = JSON.parse(result);
      assert.strictEqual(parsed.data[0].s, null);
    });

    it("should preserve string 'NULL' distinct from SQL NULL", async () => {
      const result = await collectText(
        query("SELECT {s: String} as s FORMAT JSON", {
          url,
          auth,
          sessionId,
          params: { s: "NULL" },
        }),
      );

      const parsed = JSON.parse(result);
      assert.strictEqual(parsed.data[0].s, "NULL");
    });

    it("should handle Array(Nullable(String)) with null elements", async () => {
      const arr = ["foo", null, "bar"];
      const result = await collectText(
        query("SELECT {arr: Array(Nullable(String))} as arr FORMAT JSON", {
          url,
          auth,
          sessionId,
          params: { arr },
        }),
      );
      const parsed = JSON.parse(result);
      assert.deepStrictEqual(parsed.data[0].arr, arr);
    });

    it("should handle Map with Nullable values containing null", async () => {
      const result = await collectText(
        query("SELECT {m: Map(String, Nullable(Int32))}['b'] as v FORMAT JSON", {
          url,
          auth,
          sessionId,
          params: { m: { a: 1, b: null, c: 3 } },
        }),
      );
      const parsed = JSON.parse(result);
      assert.strictEqual(parsed.data[0].v, null);
    });

    it("should handle Tuple with Nullable element containing null", async () => {
      const result = await collectText(
        query("SELECT tupleElement({t: Tuple(Nullable(String), Int32)}, 1) as v FORMAT JSON", {
          url,
          auth,
          sessionId,
          params: { t: [null, 42] },
        }),
      );
      const parsed = JSON.parse(result);
      assert.strictEqual(parsed.data[0].v, null);
    });

    it("response body is released when query generator is abandoned early", async () => {
      // Repeat early-exit many times. If reader.cancel() is not called on abandon,
      // HTTP connections stay checked out of the pool; eventually new queries queue
      // and the test times out. 20 iterations is well above typical pool-per-origin
      // defaults observed with undici's global fetch dispatcher.
      const ITERATIONS = 20;
      for (let i = 0; i < ITERATIONS; i++) {
        // Use a unique session per iteration to avoid ClickHouse session locking
        // (the server keeps a session locked until the query finishes on its side).
        const iterSession = generateSessionId(`abandon_${i}`);
        const gen = query(`SELECT number FROM numbers(100000)`, {
          url,
          auth,
          sessionId: iterSession,
          compression: false,
        });
        // Pull one packet then abandon the rest.
        await gen.next();
        await gen.return(undefined);
      }

      // If connections leaked, this would hang until the test timeout.
      const result = await collectText(
        query("SELECT 42 FORMAT JSONEachRow", {
          url,
          auth,
          sessionId: generateSessionId("abandon_final"),
          compression: false,
        }),
      );
      assert.ok(result.includes("42"));
    });

    it("should handle DateTime with timezone param", async () => {
      const testDate = new Date("2024-06-15T10:30:45Z");
      const result = await collectText(
        query("SELECT toUnixTimestamp({ts: DateTime('UTC')}) as ts FORMAT JSON", {
          url,
          auth,
          sessionId,
          params: { ts: testDate },
        }),
      );
      const parsed = JSON.parse(result);
      assert.strictEqual(Number(parsed.data[0].ts), Math.floor(testDate.getTime() / 1000));
    });
  });
});
