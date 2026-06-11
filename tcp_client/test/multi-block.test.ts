import assert from "node:assert";
import { after, before, describe, test } from "node:test";
import { startClickHouse, stopClickHouse } from "../../test/setup.ts";
import { type TcpConfig, withClient as withClientBase } from "../../test/test_utils.ts";
// Import from source, not the dist package: withClient (test_utils) constructs
// the source TcpClient, so a RecordBatch from the dist factory would fail the
// source `instanceof RecordBatch` insert-dispatch check and be mis-encoded.
import { batchFromRows } from "../../native/index.ts";
import type { TcpClient } from "../index.ts";

describe("TCP Client Multi-block Integration", () => {
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

  const withClient = <T>(fn: (client: TcpClient) => Promise<T>) => withClientBase(options, fn);

  test("should handle multi-block SELECT queries", () =>
    withClient(async (client) => {
      const tableName = `test_tcp_multi_${Date.now()}`;
      const rowCount = 100000;

      await client.query(`CREATE TABLE ${tableName} (id UInt64, name String) ENGINE = Memory`);
      await client.query(
        `INSERT INTO ${tableName} SELECT number, 'row_' || toString(number) FROM numbers(${rowCount})`,
      );

      const stream = client.query(`SELECT * FROM ${tableName}`);

      let totalRows = 0;
      let blockCount = 0;
      for await (const packet of stream) {
        if (packet.type === "Data") {
          blockCount++;
          totalRows += packet.batch.rowCount;
        }
      }

      assert.strictEqual(totalRows, rowCount, "Total row count mismatch");
      assert.ok(blockCount > 1, "Should have received multiple blocks");

      await client.query(`DROP TABLE ${tableName}`);
    }));

  test("should decode a large uncompressed block split across socket chunks", () =>
    withClient(async (client) => {
      const rowCount = 2048;
      let totalRows = 0;
      let firstPayloadLength: number | undefined;
      let lastId = -1n;

      for await (const packet of client.query(
        `SELECT number AS id, repeat('x', 2048) AS payload FROM numbers(${rowCount}) ` +
          `SETTINGS max_block_size=${rowCount}, preferred_block_size_bytes=100000000`,
      )) {
        if (packet.type !== "Data") continue;
        totalRows += packet.batch.rowCount;
        if (packet.batch.rowCount > 0) {
          firstPayloadLength ??= (packet.batch.getAt(0, 1) as string).length;
          lastId = packet.batch.getAt(packet.batch.rowCount - 1, 0) as bigint;
        }
      }

      assert.strictEqual(totalRows, rowCount);
      assert.strictEqual(firstPayloadLength, 2048);
      assert.strictEqual(lastId, BigInt(rowCount - 1));
    }));

  test("should handle multi-block INSERT queries", () =>
    withClient(async (client) => {
      const tableName = `test_tcp_multi_ins_${Date.now()}`;
      await client.query(`CREATE TABLE ${tableName} (id UInt64, name String) ENGINE = Memory`);

      const blockCount = 10;
      const rowsPerBlock = 1000;

      async function* generateBlocks() {
        for (let i = 0; i < blockCount; i++) {
          const rows: [bigint, string][] = [];
          for (let j = 0; j < rowsPerBlock; j++) {
            const id = BigInt(i * rowsPerBlock + j);
            rows.push([id, `name_${id}`]);
          }
          yield batchFromRows(
            [
              { name: "id", type: "UInt64" },
              { name: "name", type: "String" },
            ],
            rows,
          );
        }
      }

      await client.insert(`INSERT INTO ${tableName} VALUES`, generateBlocks());

      const stream = client.query(`SELECT count() FROM ${tableName}`);
      let totalCount = 0n;
      for await (const packet of stream) {
        if (packet.type === "Data") {
          for (const row of packet.batch) {
            totalCount = row["count()"] as bigint;
          }
        }
      }

      assert.strictEqual(Number(totalCount), blockCount * rowsPerBlock);

      await client.query(`DROP TABLE ${tableName}`);
    }));
});
