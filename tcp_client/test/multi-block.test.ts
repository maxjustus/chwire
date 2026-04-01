import assert from "node:assert";
import { after, before, describe, test } from "node:test";
import { batchFromRows } from "@maxjustus/chttp/native";
import { startClickHouse, stopClickHouse } from "../../test/setup.ts";
import { type TcpConfig, withClient as withClientBase } from "../../test/test_utils.ts";
import { TcpClient } from "@maxjustus/chttp/tcp";

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

  test("should handle multi-block INSERT queries", () =>
    withClient(async (client) => {
      const tableName = `test_tcp_multi_ins_${Date.now()}`;
      await client.query(`CREATE TABLE ${tableName} (id UInt64, name String) ENGINE = Memory`);

      const blockCount = 10;
      const rowsPerBlock = 1000;

      async function* generateBlocks() {
        for (let i = 0; i < blockCount; i++) {
          const rows = [];
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
