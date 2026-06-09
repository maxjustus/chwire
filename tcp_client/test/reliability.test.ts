import assert from "node:assert";
import { after, before, describe, test } from "node:test";
import { batchFromCols, getCodec } from "@maxjustus/chwire/native";
import { startClickHouse, stopClickHouse } from "../../test/setup.ts";
import { toClientOptions, type TcpConfig } from "../../test/test_utils.ts";
import { ClickHouseException, TcpClient } from "@maxjustus/chwire/tcp";
import { ServerPacketId } from "../types.ts";

describe("TCP Client Reliability", () => {
  let options: TcpConfig;

  before(async () => {
    const ch = await startClickHouse();
    options = {
      host: ch.host,
      tcpPort: ch.tcpPort,
      username: ch.username,
      password: ch.password,
    };
  });

  after(async () => {
    await stopClickHouse();
  });

  // Local wrapper - keeps original TcpClient instantiation pattern
  async function withClient<T>(fn: (client: TcpClient) => Promise<T>): Promise<T> {
    const client = new TcpClient(toClientOptions(options));
    await client.connect();
    try {
      return await fn(client);
    } finally {
      client.close();
    }
  }

  async function withAbortOnPacket<T>(
    client: TcpClient,
    controller: AbortController,
    packetId: number,
    fn: () => Promise<T>,
  ): Promise<T> {
    const reader = (client as any).reader;
    assert.ok(reader, "Reader should be initialized");

    const originalReadVarint = reader.readVarint.bind(reader);
    let aborted = false;
    reader.readVarint = async () => {
      const value = await originalReadVarint();
      if (!aborted && Number(value) === packetId) {
        aborted = true;
        controller.abort();
      }
      return value;
    };

    try {
      return await fn();
    } finally {
      reader.readVarint = originalReadVarint;
    }
  }

  test("should parse exception with full details", () =>
    withClient(async (client) => {
      try {
        for await (const _ of client.query("SELECT * FROM nonexistent_table_xyz123")) {
        }
        assert.fail("Should have thrown an exception");
      } catch (err) {
        assert.ok(err instanceof ClickHouseException, "Should be ClickHouseException");
        assert.strictEqual(err.code, 60, "Should have error code 60 (UNKNOWN_TABLE)");
        assert.strictEqual(err.exceptionName, "DB::Exception", "Should have exception name");
        // Message format varies by ClickHouse version: "does not exist" or "Unknown table expression identifier"
        assert.ok(
          err.message.includes("does not exist") || err.message.includes("Unknown table"),
          `Message should mention unknown/missing table, got: ${err.message}`,
        );
        assert.ok(err.serverStackTrace.length > 0, "Should have stack trace");
      }
    }));

  test("should allow subsequent queries after exception", () =>
    withClient(async (client) => {
      // First query: trigger an exception
      try {
        for await (const _ of client.query("SELECT * FROM nonexistent_table_xyz123")) {
        }
        assert.fail("Should have thrown an exception");
      } catch (err) {
        assert.ok(
          err instanceof ClickHouseException,
          "First query should throw ClickHouseException",
        );
      }

      // Second query: should work on same connection
      let result: number | null = null;
      for await (const packet of client.query("SELECT 42 as answer")) {
        if (packet.type === "Data" && packet.batch.rowCount > 0) {
          result = Number(packet.batch.getAt(0, 0));
        }
      }
      assert.strictEqual(result, 42, "Second query should return correct result");

      // Third query: another error, connection should still recover
      try {
        for await (const _ of client.query("INVALID SQL SYNTAX HERE")) {
        }
        assert.fail("Should have thrown an exception");
      } catch (err) {
        assert.ok(
          err instanceof ClickHouseException,
          "Third query should throw ClickHouseException",
        );
      }

      // Fourth query: verify connection still works
      let finalResult: number | null = null;
      for await (const packet of client.query("SELECT 123 as value")) {
        if (packet.type === "Data" && packet.batch.rowCount > 0) {
          finalResult = Number(packet.batch.getAt(0, 0));
        }
      }
      assert.strictEqual(finalResult, 123, "Fourth query should return correct result");
    }));

  test("should ping and receive pong", () =>
    withClient(async (client) => {
      await client.ping();
      assert.ok(true);
    }));

  test("should cancel and keep connection reusable when query iteration stops early", () =>
    withClient(async (client) => {
      const startedAt = Date.now();
      let firstBatchRows = 0;

      for await (const packet of client.query(
        "SELECT number FROM numbers(1000) WHERE sleepEachRow(0.02) = 0 SETTINGS max_block_size = 1",
      )) {
        if (packet.type === "Data") {
          firstBatchRows = packet.batch.rowCount;
          break;
        }
      }

      const elapsedMs = Date.now() - startedAt;
      assert.strictEqual(firstBatchRows, 1, "Expected first batch to contain one row");
      assert.ok(
        elapsedMs < 2000,
        `Breaking query iteration should cancel quickly, took ${elapsedMs}ms`,
      );

      let result: number | null = null;
      for await (const packet of client.query("SELECT 1 as x")) {
        if (packet.type === "Data" && packet.batch.rowCount > 0) {
          result = Number(packet.batch.getAt(0, 0));
        }
      }
      assert.strictEqual(result, 1, "Connection should remain reusable after early exit");
    }));

  test("stale generator finalized after reconnect does not disturb the new connection", async () => {
    const client = new TcpClient(toClientOptions(options));
    await client.connect();
    try {
      // Suspend a query mid-stream, then kill the connection out from
      // under it (simulates server hangup while the caller is busy).
      const staleQuery = client.query("SELECT number FROM numbers(1000)");
      await staleQuery.next();
      (client as any).socket.destroy();

      // Wait for the close event to run teardown (it resets busy/socket).
      const deadline = Date.now() + 2000;
      while ((client as any).socket !== null) {
        assert.ok(Date.now() < deadline, "teardown should run on socket close");
        await new Promise((r) => setTimeout(r, 5));
      }

      // Reconnect and start a new query; finalize the stale generator while
      // the new query is mid-stream. Its finally must not send Cancel into,
      // drain packets from, or release the busy flag of the new connection.
      await client.connect();
      const newQuery = client.query("SELECT number FROM numbers(100)");
      let firstData = await newQuery.next();
      while (!firstData.done && firstData.value.type !== "Data") {
        firstData = await newQuery.next();
      }

      await staleQuery.return(undefined);
      assert.strictEqual((client as any).busy, true, "stale finalizer must not clear busy");

      let rows = 0;
      let sawEndOfStream = false;
      assert.ok(!firstData.done && firstData.value.type === "Data");
      rows += firstData.value.batch.rowCount;
      for await (const packet of newQuery) {
        if (packet.type === "Data") rows += packet.batch.rowCount;
        if (packet.type === "EndOfStream") sawEndOfStream = true;
      }
      assert.strictEqual(rows, 100, "new query should stream all rows undisturbed");
      assert.ok(sawEndOfStream, "new query should reach EndOfStream");
    } finally {
      client.close();
    }
  });

  test("should timeout query that takes too long", async () => {
    const client = new TcpClient({
      ...toClientOptions(options),
      queryTimeout: 50, // 50ms timeout
    });
    await client.connect();
    try {
      // Use sleep(1) which is 1 second - enough to trigger our 50ms timeout
      for await (const _ of client.query("SELECT sleep(1)")) {
      }
      assert.fail("Should have thrown a timeout error");
    } catch (err: any) {
      // Socket is destroyed on timeout, which can manifest as various errors
      // The client should now wrap "Premature close" into a timeout error
      assert.ok(err.message.includes("timeout"), `Should be timeout error, got: ${err.message}`);
    } finally {
      client.close();
    }
  });

  test("should cancel query via AbortSignal", () =>
    withClient(async (client) => {
      const controller = new AbortController();
      setTimeout(() => controller.abort(), 50);

      try {
        for await (const _ of client.query(
          "SELECT number FROM numbers(1000) WHERE sleepEachRow(0.02) = 0 SETTINGS max_block_size = 1",
          { signal: controller.signal },
        )) {
        }
        assert.fail("Should have thrown an abort error");
      } catch (err: any) {
        assert.strictEqual(err.name, "AbortError", `Expected AbortError, got: ${err.name}`);
        assert.ok(err.message.includes("aborted"), "Should mention aborted");
      }

      let result: number | null = null;
      for await (const packet of client.query("SELECT 7 as value")) {
        if (packet.type === "Data" && packet.batch.rowCount > 0) {
          result = Number(packet.batch.getAt(0, 0));
        }
      }
      assert.strictEqual(result, 7, "Client should still be usable after aborted query");
    }));

  test("should reject query if already aborted", () =>
    withClient(async (client) => {
      const controller = new AbortController();
      controller.abort();

      try {
        for await (const _ of client.query("SELECT 1", { signal: controller.signal })) {
        }
        assert.fail("Should have thrown an error");
      } catch (err: any) {
        assert.strictEqual(err.name, "AbortError", `Expected AbortError, got: ${err.name}`);
        assert.ok(err.message.includes("aborted"), "Should mention aborted");
      }

      let result: number | null = null;
      for await (const packet of client.query("SELECT 7 as value")) {
        if (packet.type === "Data" && packet.batch.rowCount > 0) {
          result = Number(packet.batch.getAt(0, 0));
        }
      }
      assert.strictEqual(result, 7, "Client should still be usable after pre-aborted query");
    }));

  test("should complete query when abort fires after EndOfStream packet is observed", () =>
    withClient(async (client) => {
      const controller = new AbortController();

      await withAbortOnPacket(client, controller, ServerPacketId.EndOfStream, async () => {
        let result: number | null = null;
        for await (const packet of client.query("SELECT 42 as value", {
          signal: controller.signal,
        })) {
          if (packet.type === "Data" && packet.batch.rowCount > 0) {
            result = Number(packet.batch.getAt(0, 0));
          }
        }
        assert.strictEqual(result, 42, "Query should still complete successfully");
      });

      assert.ok(controller.signal.aborted, "Abort should have been triggered");

      let followUp: number | null = null;
      for await (const packet of client.query("SELECT 8 as value")) {
        if (packet.type === "Data" && packet.batch.rowCount > 0) {
          followUp = Number(packet.batch.getAt(0, 0));
        }
      }
      assert.strictEqual(followUp, 8, "Connection should remain reusable after late query abort");
    }));

  test("should prefer server exception over abort when Exception packet is observed", () =>
    withClient(async (client) => {
      const controller = new AbortController();

      try {
        await withAbortOnPacket(client, controller, ServerPacketId.Exception, async () => {
          for await (const _ of client.query("SELECT * FROM nonexistent_table_late_abort", {
            signal: controller.signal,
          })) {
          }
        });
        assert.fail("Should have thrown ClickHouseException");
      } catch (err) {
        assert.ok(err instanceof ClickHouseException, "Server exception should win the race");
        assert.strictEqual(err.code, 60, "Expected UNKNOWN_TABLE");
      }

      assert.ok(controller.signal.aborted, "Abort should have been triggered");
    }));

  test("should handle connection timeout", async () => {
    const client = new TcpClient({
      host: "192.0.2.1", // Non-routable IP (RFC 5737 TEST-NET-1)
      port: 9000,
      connectTimeout: 100, // 100ms timeout
    });

    try {
      await client.connect();
      assert.fail("Should have thrown a timeout error");
    } catch (err: any) {
      assert.ok(
        err.message.includes("timeout") ||
          err.message.includes("ETIMEDOUT") ||
          err.code === "ETIMEDOUT",
        `Should be timeout error, got: ${err.message}`,
      );
    }
  });

  test("should cancel insert via AbortSignal", async () => {
    const client = new TcpClient(toClientOptions(options));
    await client.connect();

    const controller = new AbortController();

    try {
      // Create table for insert test
      await client.query("CREATE TABLE IF NOT EXISTS test_abort_insert (x UInt64) ENGINE = Memory");

      // Create an async generator that yields tables slowly
      async function* slowTables() {
        for (let i = 0; i < 100; i++) {
          yield batchFromCols({
            x: getCodec("UInt64").fromValues(BigInt64Array.from([BigInt(i)])),
          });
          await new Promise((r) => setTimeout(r, 10));
        }
      }

      // Cancel after 50ms
      setTimeout(() => controller.abort(), 50);

      await client.insert("INSERT INTO test_abort_insert FORMAT Native", slowTables(), {
        signal: controller.signal,
      });
      assert.fail("Should have thrown an abort error");
    } catch (err: any) {
      assert.strictEqual(err.name, "AbortError", `Expected AbortError, got: ${err.name}`);
      assert.ok(err.message.includes("aborted"), "Should mention aborted");

      let result: number | null = null;
      for await (const packet of client.query("SELECT 11 as value")) {
        if (packet.type === "Data" && packet.batch.rowCount > 0) {
          result = Number(packet.batch.getAt(0, 0));
        }
      }
      assert.strictEqual(result, 11, "Client should still be usable after aborted insert");
    } finally {
      const cleanupClient = new TcpClient(toClientOptions(options));
      await cleanupClient.connect();
      await cleanupClient.query("DROP TABLE IF EXISTS test_abort_insert");
      cleanupClient.close();
      client.close();
    }
  });

  test("should reject insert if already aborted", () =>
    withClient(async (client) => {
      const controller = new AbortController();
      controller.abort();

      try {
        const table = batchFromCols({
          x: getCodec("UInt64").fromValues(BigInt64Array.from([1n, 2n, 3n])),
        });
        await client.insert("INSERT INTO system.numbers FORMAT Native", table, {
          signal: controller.signal,
        });
        assert.fail("Should have thrown an error");
      } catch (err: any) {
        assert.strictEqual(err.name, "AbortError", `Expected AbortError, got: ${err.name}`);
        assert.ok(err.message.includes("aborted"), "Should mention aborted");
      }

      let result: number | null = null;
      for await (const packet of client.query("SELECT 9 as value")) {
        if (packet.type === "Data" && packet.batch.rowCount > 0) {
          result = Number(packet.batch.getAt(0, 0));
        }
      }
      assert.strictEqual(result, 9, "Client should still be usable after pre-aborted insert");
    }));

  test("should complete insert when abort fires after EndOfStream packet is observed", async () => {
    const client = new TcpClient(toClientOptions(options));
    await client.connect();

    const tableName = `test_insert_end_of_stream_abort_${Date.now()}`;
    const controller = new AbortController();

    try {
      await client.query(`CREATE TABLE ${tableName} (x UInt64) ENGINE = Memory`);

      const table = batchFromCols({
        x: getCodec("UInt64").fromValues(BigInt64Array.from([123n])),
      });

      await withAbortOnPacket(client, controller, ServerPacketId.EndOfStream, async () => {
        await client.insert(`INSERT INTO ${tableName} VALUES`, table, {
          signal: controller.signal,
        });
      });

      assert.ok(controller.signal.aborted, "Abort should have been triggered");

      let count = 0n;
      for await (const packet of client.query(`SELECT count() as cnt FROM ${tableName}`)) {
        if (packet.type === "Data" && packet.batch.rowCount > 0) {
          count = packet.batch.getAt(0, 0) as bigint;
        }
      }
      assert.strictEqual(count, 1n, "Insert should remain committed after late abort");
    } finally {
      const cleanupClient = new TcpClient(toClientOptions(options));
      await cleanupClient.connect();
      await cleanupClient.query(`DROP TABLE IF EXISTS ${tableName}`);
      cleanupClient.close();
      client.close();
    }
  });

  test("should reject ping during an active query", () =>
    withClient(async (client) => {
      const stream = client.query(
        "SELECT number FROM numbers(1000) WHERE sleepEachRow(0.01) = 0 SETTINGS max_block_size = 1",
      );

      try {
        while (true) {
          const next = await stream.next();
          assert.ok(!next.done, "Expected query to yield at least one packet");
          if (next.value.type === "Data") break;
        }

        await assert.rejects(() => client.ping(), /Connection busy/);
      } finally {
        await stream.return(undefined);
      }

      let result: number | null = null;
      for await (const packet of client.query("SELECT 11 as value")) {
        if (packet.type === "Data" && packet.batch.rowCount > 0) {
          result = Number(packet.batch.getAt(0, 0));
        }
      }
      assert.strictEqual(result, 11, "Connection should remain usable after rejecting ping");
    }));

  test("should cancel connect via AbortSignal", async () => {
    const controller = new AbortController();

    // Use non-routable IP so connection hangs
    const client = new TcpClient({
      host: "192.0.2.1", // Non-routable IP (RFC 5737 TEST-NET-1)
      port: 9000,
      connectTimeout: 10000, // Long timeout so abort happens first
    });

    // Abort after 50ms
    setTimeout(() => controller.abort(), 50);

    try {
      await client.connect({ signal: controller.signal });
      assert.fail("Should have thrown an abort error");
    } catch (err: any) {
      assert.ok(
        err.message.includes("aborted") || err.message.includes("abort"),
        `Should be abort error, got: ${err.message}`,
      );
    }
  });

  test("should reject connect if already aborted", async () => {
    const controller = new AbortController();
    controller.abort(); // Abort before connect starts

    const client = new TcpClient(toClientOptions(options));

    try {
      await client.connect({ signal: controller.signal });
      assert.fail("Should have thrown an error");
    } catch (err: any) {
      assert.ok(err.message.includes("aborted"), "Should mention aborted");
    }
  });
});
