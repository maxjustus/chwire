/**
 * Integration tests: Native format against real ClickHouse
 */

import assert from "node:assert";
import { after, before, describe, it } from "node:test";
import { collectBytes, init, insert, query } from "../../client.ts";
import type { ColumnDef } from "../../native/index.ts";
import { startClickHouse, stopClickHouse } from "../setup.ts";
import { consume, decodeBatch, encodeNativeRows, toArrayRows } from "../test_utils.ts";

describe("Native format integration", { timeout: 120000 }, () => {
  let url: string;
  let auth: { username: string; password: string };
  const sessionId = `native_int_${Date.now()}`;

  before(async () => {
    await init();
    const ch = await startClickHouse();
    url = `${ch.url}/`;
    auth = { username: ch.username, password: ch.password };
  });

  after(async () => {
    await stopClickHouse();
  });

  async function roundTripTable(options: {
    table: string;
    createSql: string;
    columns: ColumnDef[];
    rows: unknown[][];
    orderBy?: string;
    settings?: string;
  }) {
    const { table, createSql, columns, rows, orderBy, settings } = options;
    await consume(query(`DROP TABLE IF EXISTS ${table}`, { url, auth, sessionId }));
    await consume(query(createSql, { url, auth, sessionId }));
    try {
      const encoded = encodeNativeRows(columns, rows);
      await insert(`INSERT INTO ${table} FORMAT Native`, encoded, { url, auth, sessionId });

      const orderClause = orderBy ? ` ORDER BY ${orderBy}` : "";
      const settingsClause = settings ? ` SETTINGS ${settings}` : "";
      const data = await collectBytes(
        query(`SELECT * FROM ${table}${orderClause} FORMAT Native${settingsClause}`, {
          url,
          auth,
          sessionId,
        }),
      );
      const decoded = await decodeBatch(data);
      return { decoded, decodedRows: toArrayRows(decoded) };
    } finally {
      await consume(query(`DROP TABLE ${table}`, { url, auth, sessionId }));
    }
  }

  it("round-trips mixed scalar and container types", async () => {
    const table = "test_native_smoke";
    const columns: ColumnDef[] = [
      { name: "id", type: "Int32" },
      { name: "i64", type: "Int64" },
      { name: "score", type: "Float64" },
      { name: "name", type: "String" },
      { name: "active", type: "UInt8" },
      { name: "opt", type: "Nullable(Int32)" },
      { name: "arr", type: "Array(Int32)" },
      { name: "m", type: "Map(String, Int32)" },
      { name: "t", type: "Tuple(Int32, String)" },
      { name: "ts", type: "DateTime64(3)" },
      { name: "uuid", type: "UUID" },
      { name: "status", type: "LowCardinality(String)" },
      { name: "v", type: "Variant(String, UInt64)" },
    ];
    const rows = [
      [
        1,
        10n,
        1.5,
        "alice",
        1,
        100,
        [1, 2, 3],
        { a: 1, b: 2 },
        [7, "x"],
        new Date("2024-01-15T10:30:00.123Z"),
        "550e8400-e29b-41d4-a716-446655440000",
        "active",
        [0, "hello"],
      ],
      [
        2,
        -10n,
        -1.5,
        "bob",
        0,
        null,
        [],
        {},
        [8, "y"],
        new Date("2024-01-15T10:30:00.456Z"),
        "f47ac10b-58cc-4372-a567-0e02b2c3d479",
        "inactive",
        [1, 42n],
      ],
    ];

    const { decoded, decodedRows } = await roundTripTable({
      table,
      createSql: `
        CREATE TABLE ${table} (
          id Int32,
          i64 Int64,
          score Float64,
          name String,
          active UInt8,
          opt Nullable(Int32),
          arr Array(Int32),
          m Map(String, Int32),
          t Tuple(Int32, String),
          ts DateTime64(3),
          uuid UUID,
          status LowCardinality(String),
          v Variant(String, UInt64)
        ) ENGINE = Memory
      `,
      columns,
      rows,
      orderBy: "id",
    });

    assert.strictEqual(decoded.rowCount, 2);
    assert.strictEqual(decodedRows[0]![0], 1);
    assert.strictEqual(decodedRows[1]![4], 0);
    assert.strictEqual(decodedRows[1]![5], null);
    assert.deepStrictEqual(Array.from(decodedRows[0]![6] as Int32Array), [1, 2, 3]);
    assert.deepStrictEqual(Array.from(decodedRows[1]![6] as Int32Array), []);

    const map0 = decodedRows[0]![7] as Map<string, number>;
    assert.strictEqual(map0.get("a"), 1);
    assert.strictEqual(map0.get("b"), 2);

    assert.deepStrictEqual(decodedRows[0]![8], [7, "x"]);
    assert.deepStrictEqual(decodedRows[1]![12], [1, 42n]);

    const ts0 = decodedRows[0]![9] as { toDate(): Date };
    assert.strictEqual(ts0.toDate().getTime(), new Date("2024-01-15T10:30:00.123Z").getTime());
    assert.strictEqual(decodedRows[1]![10], "f47ac10b-58cc-4372-a567-0e02b2c3d479");
    assert.strictEqual(decodedRows[0]![11], "active");
  });

  it("round-trips a top-level Nested column with flatten_nested=0", async () => {
    const table = `test_native_nested_off_${Date.now()}`;
    const columns: ColumnDef[] = [
      { name: "id", type: "Int32" },
      { name: "n", type: "Nested(a UInt32, b String)" },
    ];
    const rows = [
      [
        1,
        [
          { a: 1, b: "x" },
          { a: 2, b: "y" },
        ],
      ],
      [2, []],
    ];

    const settings = { flatten_nested: false } as const;
    await consume(query(`DROP TABLE IF EXISTS ${table}`, { url, auth, sessionId }));
    await consume(
      query(`CREATE TABLE ${table} (id Int32, n Nested(a UInt32, b String)) ENGINE = Memory`, {
        url,
        auth,
        sessionId,
        settings,
      }),
    );
    try {
      const encoded = encodeNativeRows(columns, rows);
      await insert(`INSERT INTO ${table} FORMAT Native`, encoded, {
        url,
        auth,
        sessionId,
        settings,
      });

      const data = await collectBytes(
        query(`SELECT * FROM ${table} ORDER BY id FORMAT Native`, { url, auth, sessionId }),
      );
      const decoded = await decodeBatch(data);
      const decodedRows = toArrayRows(decoded);

      assert.strictEqual(decoded.rowCount, 2);
      assert.deepStrictEqual(decodedRows[0]![1], [
        { a: 1, b: "x" },
        { a: 2, b: "y" },
      ]);
      assert.deepStrictEqual(decodedRows[1]![1], []);
    } finally {
      await consume(query(`DROP TABLE ${table}`, { url, auth, sessionId }));
    }
  });

  // Pins the documented non-support: under the default flatten_nested=1 the
  // table is split into n.a / n.b Array columns, so a single Native column
  // named "n" matches no physical column and the rows are silently stored as
  // empty arrays. This is a canary for that CH behavior, not an endorsement.
  it("silently stores empty rows for a top-level Nested column under flatten_nested=1", async () => {
    const table = `test_native_nested_on_${Date.now()}`;
    const columns: ColumnDef[] = [
      { name: "id", type: "Int32" },
      { name: "n", type: "Nested(a UInt32, b String)" },
    ];
    const rows = [
      [
        1,
        [
          { a: 1, b: "x" },
          { a: 2, b: "y" },
        ],
      ],
      [2, [{ a: 3, b: "z" }]],
    ];

    await consume(query(`DROP TABLE IF EXISTS ${table}`, { url, auth, sessionId }));
    await consume(
      query(`CREATE TABLE ${table} (id Int32, n Nested(a UInt32, b String)) ENGINE = Memory`, {
        url,
        auth,
        sessionId,
      }),
    );
    try {
      const encoded = encodeNativeRows(columns, rows);
      await insert(`INSERT INTO ${table} FORMAT Native`, encoded, { url, auth, sessionId });

      const data = await collectBytes(
        query(`SELECT id, n.a, n.b FROM ${table} ORDER BY id FORMAT Native`, {
          url,
          auth,
          sessionId,
        }),
      );
      const decoded = await decodeBatch(data);
      const decodedRows = toArrayRows(decoded);

      assert.strictEqual(decoded.rowCount, 2);
      for (const row of decodedRows) {
        assert.deepStrictEqual(Array.from(row[1] as ArrayLike<number>), []);
        assert.deepStrictEqual(row[2], []);
      }
    } finally {
      await consume(query(`DROP TABLE ${table}`, { url, auth, sessionId }));
    }
  });

  it("round-trips JSON and Dynamic via V3 settings", async () => {
    const table = "test_native_json_dynamic";
    const columns: ColumnDef[] = [
      { name: "id", type: "Int32" },
      { name: "meta", type: "JSON" },
      { name: "dyn", type: "Dynamic" },
    ];
    const rows = [
      [1, { user: "alice", scores: [10, 20] }, "hello"],
      [2, { user: "bob", scores: [30] }, 42],
      [3, { user: "cora" }, null],
    ];

    const { decoded, decodedRows } = await roundTripTable({
      table,
      createSql: `
        CREATE TABLE ${table} (
          id Int32,
          meta JSON,
          dyn Dynamic
        ) ENGINE = Memory
      `,
      columns,
      rows,
      orderBy: "id",
      settings: "output_format_native_use_flattened_dynamic_and_json_serialization=1",
    });

    assert.strictEqual(decoded.rowCount, 3);
    const meta0 = decodedRows[0]![1] as Record<string, unknown>;
    const meta1 = decodedRows[1]![1] as Record<string, unknown>;
    const meta2 = decodedRows[2]![1] as Record<string, unknown>;
    assert.strictEqual(meta0.user, "alice");
    assert.deepStrictEqual(meta0.scores, [10n, 20n]);
    assert.strictEqual(meta1.user, "bob");
    assert.deepStrictEqual(meta1.scores, [30n]);
    assert.strictEqual(meta2.user, "cora");
    assert.strictEqual(meta2.scores, undefined);

    assert.strictEqual(decodedRows[0]![2], "hello");
    assert.strictEqual(decodedRows[1]![2], 42n);
    assert.strictEqual(decodedRows[2]![2], null);
  });
});
