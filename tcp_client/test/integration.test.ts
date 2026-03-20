import assert from "node:assert";
import { after, before, describe, test } from "node:test";
import { batchFromRows, type ColumnDef } from "@maxjustus/chttp/native";
import { TcpClient } from "@maxjustus/chttp/tcp";
import { startClickHouse, stopClickHouse } from "../../test/setup.ts";
import {
  collectRows,
  type TcpConfig,
  withClient as withClientBase,
} from "../../test/test_utils.ts";

describe("TCP Client Integration", () => {
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

  test("should connect and run a simple SELECT query", () =>
    withClient(async (client) => {
      const stream = client.query("SELECT 1 as id, 'hello' as str");
      let rowsFound = 0;
      for await (const packet of stream) {
        if (packet.type === "Data") {
          rowsFound += packet.batch.rowCount;
        }
      }
      assert.strictEqual(rowsFound, 1);
    }));

  test("should connect and run an INSERT query", () =>
    withClient(async (client) => {
      const tableName = `test_tcp_insert_${Date.now()}`;
      await client.query(`CREATE TABLE ${tableName} (id UInt64, name String) ENGINE = Memory`);

      const batch = batchFromRows(
        [
          { name: "id", type: "UInt64" },
          { name: "name", type: "String" },
        ],
        [
          [1n, "Alice"],
          [2n, "Bob"],
        ],
      );

      for await (const _ of client.insert(`INSERT INTO ${tableName} VALUES`, batch)) {
      }

      const allRows = await collectRows(client, `SELECT * FROM ${tableName} ORDER BY id`);
      assert.strictEqual(allRows.length, 2, "Should have 2 rows");
      assert.deepStrictEqual(allRows[0], { id: 1n, name: "Alice" });
      assert.deepStrictEqual(allRows[1], { id: 2n, name: "Bob" });

      await client.query(`DROP TABLE ${tableName}`);
    }));

  test("should run a larger query from system.numbers", () =>
    withClient(async (client) => {
      const stream = client.query("SELECT * FROM system.numbers LIMIT 100");
      let count = 0;
      for await (const packet of stream) {
        if (packet.type === "Data") count += packet.batch.rowCount;
      }
      assert.strictEqual(count, 100);
    }));

  test("should insert row objects with auto-coercion", () =>
    withClient(async (client) => {
      const tableName = `test_row_objects_${Date.now()}`;
      await client.query(
        `CREATE TABLE ${tableName} (id UInt32, name String, value Float64) ENGINE = Memory`,
      );

      for await (const _ of client.insert(`INSERT INTO ${tableName} VALUES`, [
        { id: 1, name: "alice", value: 1.5 },
        { id: 2, name: "bob", value: 2.5 },
        { id: 3, name: "charlie", value: 3.5 },
      ])) {
      }

      const allRows = await collectRows(client, `SELECT * FROM ${tableName} ORDER BY id`);
      assert.strictEqual(allRows.length, 3);
      assert.strictEqual(allRows[0].id, 1);
      assert.strictEqual(allRows[0].name, "alice");
      assert.strictEqual(allRows[1].id, 2);
      assert.strictEqual(allRows[2].value, 3.5);

      await client.query(`DROP TABLE ${tableName}`);
    }));

  test("should insert row objects from generator with batching", () =>
    withClient(async (client) => {
      const tableName = `test_generator_rows_${Date.now()}`;
      await client.query(`CREATE TABLE ${tableName} (id UInt32, value String) ENGINE = Memory`);

      function* generateRows() {
        for (let i = 0; i < 250; i++) {
          yield { id: i, value: `row_${i}` };
        }
      }

      for await (const _ of client.insert(`INSERT INTO ${tableName} VALUES`, generateRows(), {
        batchSize: 100,
      })) {
      }

      const stream = client.query(`SELECT count() as cnt FROM ${tableName}`);
      let count = 0;
      for await (const packet of stream) {
        if (packet.type === "Data") {
          count = Number(packet.batch.getAt(0, 0));
        }
      }

      assert.strictEqual(count, 250);

      await client.query(`DROP TABLE ${tableName}`);
    }));

  test("should validate schema when provided", () =>
    withClient(async (client) => {
      const tableName = `test_schema_valid_${Date.now()}`;
      await client.query(`CREATE TABLE ${tableName} (id UInt32, name String) ENGINE = Memory`);

      const schema: ColumnDef[] = [
        { name: "id", type: "UInt32" },
        { name: "name", type: "String" },
      ];

      for await (const _ of client.insert(
        `INSERT INTO ${tableName} VALUES`,
        [{ id: 1, name: "test" }],
        { schema },
      )) {
      }

      const stream = client.query(`SELECT count() as cnt FROM ${tableName}`);
      let count = 0;
      for await (const packet of stream) {
        if (packet.type === "Data") {
          count = Number(packet.batch.getAt(0, 0));
        }
      }
      assert.strictEqual(count, 1);

      await client.query(`DROP TABLE ${tableName}`);
    }));

  // Schema mismatch tests intentionally use separate clients for setup/test/cleanup isolation
  test("should throw on schema mismatch - wrong type", async () => {
    const tableName = `test_schema_mismatch_${Date.now()}`;

    await withClient(async (client) => {
      await client.query(`CREATE TABLE ${tableName} (id UInt32, name String) ENGINE = Memory`);
    });

    await withClient(async (client) => {
      const wrongSchema: ColumnDef[] = [
        { name: "id", type: "UInt64" }, // Wrong type!
        { name: "name", type: "String" },
      ];

      await assert.rejects(async () => {
        for await (const _ of client.insert(
          `INSERT INTO ${tableName} VALUES`,
          [{ id: 1, name: "test" }],
          { schema: wrongSchema },
        )) {
        }
      }, /Schema mismatch.*UInt64.*UInt32/);
    });

    await withClient(async (client) => {
      await client.query(`DROP TABLE ${tableName}`);
    });
  });

  test("should throw on schema mismatch - wrong column name", async () => {
    const tableName = `test_schema_name_${Date.now()}`;

    await withClient(async (client) => {
      await client.query(`CREATE TABLE ${tableName} (id UInt32, name String) ENGINE = Memory`);
    });

    await withClient(async (client) => {
      const wrongSchema: ColumnDef[] = [
        { name: "user_id", type: "UInt32" }, // Wrong name!
        { name: "name", type: "String" },
      ];

      await assert.rejects(async () => {
        for await (const _ of client.insert(
          `INSERT INTO ${tableName} VALUES`,
          [{ id: 1, name: "test" }],
          { schema: wrongSchema },
        )) {
        }
      }, /Schema mismatch.*user_id.*id/);
    });

    await withClient(async (client) => {
      await client.query(`DROP TABLE ${tableName}`);
    });
  });

  test("should throw on schema mismatch - wrong column count", async () => {
    const tableName = `test_schema_count_${Date.now()}`;

    await withClient(async (client) => {
      await client.query(`CREATE TABLE ${tableName} (id UInt32, name String) ENGINE = Memory`);
    });

    await withClient(async (client) => {
      const wrongSchema: ColumnDef[] = [
        { name: "id", type: "UInt32" },
        // Missing 'name' column
      ];

      await assert.rejects(async () => {
        for await (const _ of client.insert(`INSERT INTO ${tableName} VALUES`, [{ id: 1 }], {
          schema: wrongSchema,
        })) {
        }
      }, /Schema mismatch.*expected 1 columns.*got 2/);
    });

    await withClient(async (client) => {
      await client.query(`DROP TABLE ${tableName}`);
    });
  });

  test("explicit column list in INSERT uses server DEFAULT for omitted columns", () =>
    withClient(async (client) => {
      const tableName = `test_defaults_${Date.now()}`;
      await client.query(`
        CREATE TABLE ${tableName} (
          id UInt32,
          name String DEFAULT 'anonymous',
          counter UInt64 DEFAULT 42,
          created DateTime DEFAULT now()
        ) ENGINE = Memory
      `);

      for await (const _ of client.insert(`INSERT INTO ${tableName} (id) VALUES`, [
        { id: 1 },
        { id: 2 },
        { id: 3 },
      ])) {
      }

      const allRows = await collectRows(client, `SELECT * FROM ${tableName} ORDER BY id`);
      assert.strictEqual(allRows.length, 3);
      assert.strictEqual(allRows[0].name, "anonymous");
      assert.strictEqual(allRows[0].counter, 42n);
      assert.ok(allRows[0].created instanceof Date, "created should be a Date");
      assert.strictEqual(allRows[1].name, "anonymous");
      assert.strictEqual(allRows[2].name, "anonymous");

      await client.query(`DROP TABLE ${tableName}`);
    }));

  test("explicit column list allows inserting subset of columns", () =>
    withClient(async (client) => {
      const tableName = `test_subset_cols_${Date.now()}`;
      await client.query(`
        CREATE TABLE ${tableName} (
          id UInt32,
          a String DEFAULT 'a_default',
          b String DEFAULT 'b_default',
          c String DEFAULT 'c_default'
        ) ENGINE = Memory
      `);

      for await (const _ of client.insert(`INSERT INTO ${tableName} (id, b) VALUES`, [
        { id: 1, b: "custom_b" },
      ])) {
      }

      const allRows = await collectRows(client, `SELECT * FROM ${tableName}`);
      assert.strictEqual(allRows.length, 1);
      assert.strictEqual(allRows[0].id, 1);
      assert.strictEqual(allRows[0].a, "a_default");
      assert.strictEqual(allRows[0].b, "custom_b");
      assert.strictEqual(allRows[0].c, "c_default");

      await client.query(`DROP TABLE ${tableName}`);
    }));

  test("Nullable column to non-nullable target: NULL becomes type default (not column DEFAULT)", () =>
    // NOTE: Native format does NOT support column DEFAULT expressions for NULL values.
    // NULLs are coerced to TYPE defaults (0, "", etc.), not column DEFAULTs.
    // See: https://github.com/ClickHouse/ClickHouse/issues/58662
    withClient(async (client) => {
      const tableName = `test_null_coerce_${Date.now()}`;
      await client.query(`
        CREATE TABLE ${tableName} (
          id UInt32,
          name String DEFAULT 'default_name',
          counter UInt64 DEFAULT 999
        ) ENGINE = Memory
      `);

      const batch = batchFromRows(
        [
          { name: "id", type: "Nullable(UInt32)" },
          { name: "name", type: "Nullable(String)" },
          { name: "counter", type: "Nullable(UInt64)" },
        ],
        [
          [1, "alice", 100n],
          [2, null, null], // NULLs become type defaults: "" and 0n
        ],
      );

      for await (const _ of client.insert(`INSERT INTO ${tableName} VALUES`, batch)) {
      }

      const allRows = await collectRows(client, `SELECT * FROM ${tableName} ORDER BY id`);
      assert.strictEqual(allRows.length, 2);
      assert.strictEqual(allRows[0].name, "alice");
      assert.strictEqual(allRows[0].counter, 100n);
      assert.strictEqual(allRows[1].name, ""); // Type default, NOT 'default_name'
      assert.strictEqual(allRows[1].counter, 0n); // Type default, NOT 999n

      await client.query(`DROP TABLE ${tableName}`);
    }));

  test("should read JSON columns with typed paths", () =>
    withClient(async (client) => {
      const tableName = `test_json_typed_paths_${Date.now()}`;
      await client.query(`
        CREATE TABLE ${tableName} (
          id UInt32,
          data JSON(currency LowCardinality(String), amount Int64)
        ) ENGINE = Memory
      `);

      await client.query(`
        INSERT INTO ${tableName} FORMAT JSONEachRow
        {"id": 1, "data": {"currency": "USD", "amount": 100}}
        {"id": 2, "data": {"currency": "EUR", "amount": 200, "extra": "dynamic"}}
      `);

      const allRows = await collectRows(client, `SELECT * FROM ${tableName} ORDER BY id`);

      assert.strictEqual(allRows.length, 2);
      assert.strictEqual(allRows[0].id, 1);
      assert.strictEqual((allRows[0].data as any).currency, "USD");
      assert.strictEqual((allRows[0].data as any).amount, 100n);
      assert.strictEqual(allRows[1].id, 2);
      assert.strictEqual((allRows[1].data as any).currency, "EUR");
      assert.strictEqual((allRows[1].data as any).amount, 200n);
      assert.strictEqual((allRows[1].data as any).extra, "dynamic");

      await client.query(`DROP TABLE ${tableName}`);
    }));

  test("row objects with Array(UInt32) column", () =>
    withClient(async (client) => {
      const tableName = `test_array_uint32_${Date.now()}`;
      await client.query(
        `CREATE TABLE ${tableName} (id UInt32, arr Array(UInt32)) ENGINE = Memory`,
      );

      for await (const _ of client.insert(`INSERT INTO ${tableName} VALUES`, [
        { id: 1, arr: [10, 20, 30] },
        { id: 2, arr: [100] },
        { id: 3, arr: [] },
      ])) {
      }

      const allRows = await collectRows(client, `SELECT * FROM ${tableName} ORDER BY id`);
      assert.strictEqual(allRows.length, 3);
      assert.deepStrictEqual(Array.from(allRows[0].arr as any), [10, 20, 30]);
      assert.deepStrictEqual(Array.from(allRows[1].arr as any), [100]);
      assert.deepStrictEqual(Array.from(allRows[2].arr as any), []);

      await client.query(`DROP TABLE ${tableName}`);
    }));

  test("row objects with Array(String) column", () =>
    withClient(async (client) => {
      const tableName = `test_array_string_${Date.now()}`;
      await client.query(
        `CREATE TABLE ${tableName} (id UInt32, tags Array(String)) ENGINE = Memory`,
      );

      for await (const _ of client.insert(`INSERT INTO ${tableName} VALUES`, [
        { id: 1, tags: ["foo", "bar", "baz"] },
        { id: 2, tags: ["single"] },
        { id: 3, tags: [] },
      ])) {
      }

      const allRows = await collectRows(client, `SELECT * FROM ${tableName} ORDER BY id`);
      assert.strictEqual(allRows.length, 3);
      assert.deepStrictEqual(allRows[0].tags, ["foo", "bar", "baz"]);
      assert.deepStrictEqual(allRows[1].tags, ["single"]);
      assert.deepStrictEqual(allRows[2].tags, []);

      await client.query(`DROP TABLE ${tableName}`);
    }));

  test("row objects with nested Array(Array(UInt32))", () =>
    withClient(async (client) => {
      const tableName = `test_nested_array_${Date.now()}`;
      await client.query(
        `CREATE TABLE ${tableName} (id UInt32, matrix Array(Array(UInt32))) ENGINE = Memory`,
      );

      for await (const _ of client.insert(`INSERT INTO ${tableName} VALUES`, [
        {
          id: 1,
          matrix: [
            [1, 2],
            [3, 4, 5],
          ],
        },
        { id: 2, matrix: [[100]] },
        { id: 3, matrix: [] },
      ])) {
      }

      const allRows = await collectRows(client, `SELECT * FROM ${tableName} ORDER BY id`);
      assert.strictEqual(allRows.length, 3);
      const matrix = allRows[0].matrix as any[];
      assert.strictEqual(matrix.length, 2);
      assert.deepStrictEqual(Array.from(matrix[0]), [1, 2]);
      assert.deepStrictEqual(Array.from(matrix[1]), [3, 4, 5]);

      await client.query(`DROP TABLE ${tableName}`);
    }));

  test("row objects with Array(Nullable(UInt32))", () =>
    // Note: ClickHouse doesn't allow Nullable(Array(...)), but does allow Array(Nullable(...))
    withClient(async (client) => {
      const tableName = `test_array_nullable_${Date.now()}`;
      await client.query(
        `CREATE TABLE ${tableName} (id UInt32, arr Array(Nullable(UInt32))) ENGINE = Memory`,
      );

      for await (const _ of client.insert(`INSERT INTO ${tableName} VALUES`, [
        { id: 1, arr: [1, null, 3] },
        { id: 2, arr: [null, null] },
        { id: 3, arr: [] },
      ])) {
      }

      const allRows = await collectRows(client, `SELECT * FROM ${tableName} ORDER BY id`);
      assert.strictEqual(allRows.length, 3);
      assert.deepStrictEqual(allRows[0].arr, [1, null, 3]);
      assert.deepStrictEqual(allRows[1].arr, [null, null]);
      assert.deepStrictEqual(allRows[2].arr, []);

      await client.query(`DROP TABLE ${tableName}`);
    }));

  test("should send query_id to server and appear in system.query_log", () =>
    withClient(async (client) => {
      const testQueryId = `test-query-id-${Date.now()}-${Math.random().toString(36).slice(2)}`;

      const stream = client.query("SELECT 1", { queryId: testQueryId });
      for await (const _ of stream) {
      }

      await client.query("SYSTEM FLUSH LOGS");

      const logStream = client.query(
        `SELECT query_id FROM system.query_log WHERE query_id = '${testQueryId}' LIMIT 1`,
      );
      let found = false;
      for await (const packet of logStream) {
        if (packet.type === "Data" && packet.batch.rowCount > 0) {
          found = true;
        }
      }

      assert.strictEqual(
        found,
        true,
        `query_id '${testQueryId}' should appear in system.query_log`,
      );
    }));
});
