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
  let baseUrl: string;
  let auth: { username: string; password: string };
  const sessionId = `native_int_${Date.now()}`;

  before(async () => {
    await init();
    const ch = await startClickHouse();
    baseUrl = `${ch.url}/`;
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
    await consume(query(`DROP TABLE IF EXISTS ${table}`, sessionId, { baseUrl, auth }));
    await consume(query(createSql, sessionId, { baseUrl, auth }));
    try {
      const encoded = encodeNativeRows(columns, rows);
      await insert(`INSERT INTO ${table} FORMAT Native`, encoded, sessionId, { baseUrl, auth });

      const orderClause = orderBy ? ` ORDER BY ${orderBy}` : "";
      const settingsClause = settings ? ` SETTINGS ${settings}` : "";
      const data = await collectBytes(
        query(`SELECT * FROM ${table}${orderClause} FORMAT Native${settingsClause}`, sessionId, {
          baseUrl,
          auth,
        }),
      );
      const decoded = await decodeBatch(data);
      return { decoded, decodedRows: toArrayRows(decoded) };
    } finally {
      await consume(query(`DROP TABLE ${table}`, sessionId, { baseUrl, auth }));
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
    assert.strictEqual(decodedRows[0][0], 1);
    assert.strictEqual(decodedRows[1][4], 0);
    assert.strictEqual(decodedRows[1][5], null);
    assert.deepStrictEqual(Array.from(decodedRows[0][6] as Int32Array), [1, 2, 3]);
    assert.deepStrictEqual(Array.from(decodedRows[1][6] as Int32Array), []);

    const map0 = decodedRows[0][7] as Map<string, number>;
    assert.strictEqual(map0.get("a"), 1);
    assert.strictEqual(map0.get("b"), 2);

    assert.deepStrictEqual(decodedRows[0][8], [7, "x"]);
    assert.deepStrictEqual(decodedRows[1][12], [1, 42n]);

    const ts0 = decodedRows[0][9] as { toDate(): Date };
    assert.strictEqual(ts0.toDate().getTime(), new Date("2024-01-15T10:30:00.123Z").getTime());
    assert.strictEqual(decodedRows[1][10], "f47ac10b-58cc-4372-a567-0e02b2c3d479");
    assert.strictEqual(decodedRows[0][11], "active");
  });

  // --- JSON + Dynamic decode across all version formats ---
  // Use a SINGLE shared table to avoid repeated INSERT issues with Native format

  function assertJsonDynValues(decodedRows: unknown[][]) {
    const meta0 = decodedRows[0][1] as Record<string, unknown>;
    const meta1 = decodedRows[1][1] as Record<string, unknown>;
    const meta2 = decodedRows[2][1] as Record<string, unknown>;
    assert.strictEqual(meta0.user, "alice");
    assert.strictEqual(meta1.user, "bob");
    assert.strictEqual(meta2.user, "cora");
    assert.ok(meta0.scores !== undefined, "scores should be present for alice");
    assert.ok(meta1.scores !== undefined, "scores should be present for bob");
    assert.strictEqual(meta2.scores, undefined);

    assert.strictEqual(decodedRows[0][2], "hello");
    assert.ok(
      decodedRows[1][2] === 42n || decodedRows[1][2] === 42 || String(decodedRows[1][2]) === "42",
      `Expected 42, got ${decodedRows[1][2]}`,
    );
    assert.strictEqual(decodedRows[2][2], null);
  }

  describe("JSON+Dynamic version decode", () => {
    const table = "test_json_dyn_versions";

    before(async () => {
      await consume(query(`DROP TABLE IF EXISTS ${table}`, sessionId, { baseUrl, auth }));
      await consume(
        query(
          `CREATE TABLE ${table} (id Int32, meta JSON, dyn Dynamic) ENGINE = MergeTree ORDER BY id`,
          sessionId,
          { baseUrl, auth },
        ),
      );
      // Insert via JSONEachRow to avoid any Native encode version issues
      await consume(
        query(
          `INSERT INTO ${table} FORMAT JSONEachRow
          {"id": 1, "meta": {"user": "alice", "scores": [10, 20]}, "dyn": "hello"}
          {"id": 2, "meta": {"user": "bob", "scores": [30]}, "dyn": 42}
          {"id": 3, "meta": {"user": "cora"}, "dyn": null}`,
          sessionId,
          { baseUrl, auth },
        ),
      );
    });

    after(async () => {
      await consume(query(`DROP TABLE IF EXISTS ${table}`, sessionId, { baseUrl, auth }));
    });

    it("decodes via V3 (flattened setting)", async () => {
      const data = await collectBytes(
        query(
          `SELECT * FROM ${table} ORDER BY id FORMAT Native SETTINGS output_format_native_use_flattened_dynamic_and_json_serialization=1`,
          sessionId,
          { baseUrl, auth },
        ),
      );
      const decoded = await decodeBatch(data);
      assert.strictEqual(decoded.rowCount, 3);
      assertJsonDynValues(toArrayRows(decoded));
    });

    it("decodes via V1 (HTTP default, no clientVersion)", async () => {
      const data = await collectBytes(
        query(`SELECT * FROM ${table} ORDER BY id FORMAT Native`, sessionId, { baseUrl, auth }),
      );
      const decoded = await decodeBatch(data);
      assert.strictEqual(decoded.rowCount, 3);
      assertJsonDynValues(toArrayRows(decoded));
    });

    it("decodes via V2 (HTTP clientVersion=54500)", async () => {
      const data = await collectBytes(
        query(`SELECT * FROM ${table} ORDER BY id FORMAT Native`, sessionId, {
          baseUrl,
          auth,
          clientVersion: 54500,
        }),
      );
      const decoded = await decodeBatch(data, { clientVersion: 54500 });
      assert.strictEqual(decoded.rowCount, 3);
      assertJsonDynValues(toArrayRows(decoded));
    });
  });

  it("decodes complex Dynamic types via V1 (Tuple, Array, Map)", async () => {
    const sql = `SELECT
      multiIf(
        number % 5 = 0, tuple(rand64(), randomStringUTF8(5))::Dynamic,
        number % 5 = 1, [rand(), rand()]::Dynamic,
        number % 5 = 2, map('k', rand64())::Dynamic,
        number % 5 = 3, rand64()::Dynamic,
        NULL::Dynamic
      ) AS d
      FROM numbers(20) FORMAT Native`;
    const data = await collectBytes(query(sql, sessionId, { baseUrl, auth }));
    const decoded = await decodeBatch(data);
    assert.strictEqual(decoded.rowCount, 20);
    for (let i = 4; i < 20; i += 5) {
      assert.strictEqual(decoded.columnData[0].get(i), null, `row ${i} should be NULL`);
    }
    for (let i = 0; i < 20; i += 5) {
      assert.ok(decoded.columnData[0].get(i) !== null, `row ${i} should not be NULL`);
    }
  });

  it("decodes complex Dynamic types via V2 (Tuple, Array, Map)", async () => {
    const sql = `SELECT
      multiIf(
        number % 5 = 0, tuple(rand64(), randomStringUTF8(5))::Dynamic,
        number % 5 = 1, [rand(), rand()]::Dynamic,
        number % 5 = 2, map('k', rand64())::Dynamic,
        number % 5 = 3, rand64()::Dynamic,
        NULL::Dynamic
      ) AS d
      FROM numbers(20) FORMAT Native`;
    const data = await collectBytes(query(sql, sessionId, { baseUrl, auth, clientVersion: 54500 }));
    const decoded = await decodeBatch(data, { clientVersion: 54500 });
    assert.strictEqual(decoded.rowCount, 20);
    for (let i = 4; i < 20; i += 5) {
      assert.strictEqual(decoded.columnData[0].get(i), null, `row ${i} should be NULL`);
    }
    for (let i = 0; i < 20; i += 5) {
      assert.ok(decoded.columnData[0].get(i) !== null, `row ${i} should not be NULL`);
    }
  });

  it("decodes JSON with shared data overflow via V1", async () => {
    const table = "test_v1_shared_data";
    await consume(query(`DROP TABLE IF EXISTS ${table}`, sessionId, { baseUrl, auth }));
    await consume(
      query(
        `CREATE TABLE ${table} (data JSON(max_dynamic_paths=2)) ENGINE = MergeTree ORDER BY tuple()`,
        sessionId,
        { baseUrl, auth },
      ),
    );
    try {
      await consume(
        query(
          `INSERT INTO ${table} FORMAT JSONEachRow
          {"data": {"a": 1, "b": "hello", "c": 3.14, "d": true, "e": [1,2]}}
          {"data": {"a": 2, "b": "world", "c": 2.71, "f": "overflow"}}`,
          sessionId,
          { baseUrl, auth },
        ),
      );
      const data = await collectBytes(
        query(`SELECT * FROM ${table} FORMAT Native`, sessionId, { baseUrl, auth }),
      );
      const decoded = await decodeBatch(data);
      assert.strictEqual(decoded.rowCount, 2);
      const row0 = decoded.columnData[0].get(0) as Record<string, unknown>;
      const row1 = decoded.columnData[0].get(1) as Record<string, unknown>;
      assert.ok(row0.a !== undefined, "path 'a' should be present");
      assert.ok(row0.b !== undefined, "path 'b' should be present");
      assert.ok(row1.a !== undefined, "path 'a' should be present in row 1");
    } finally {
      await consume(query(`DROP TABLE ${table}`, sessionId, { baseUrl, auth }));
    }
  });

  it("cross-version: same data decoded as V1, V2, and V3", async () => {
    const table = "test_cross_version";
    await consume(query(`DROP TABLE IF EXISTS ${table}`, sessionId, { baseUrl, auth }));
    await consume(
      query(
        `CREATE TABLE ${table} (id Int32, meta JSON, dyn Dynamic) ENGINE = MergeTree ORDER BY id`,
        sessionId,
        { baseUrl, auth },
      ),
    );
    try {
      // Insert via JSONEachRow (avoids any Native encode version concerns)
      await consume(
        query(
          `INSERT INTO ${table} FORMAT JSONEachRow
          {"id": 1, "meta": {"user": "alice", "scores": [10, 20]}, "dyn": "hello"}
          {"id": 2, "meta": {"user": "bob", "scores": [30]}, "dyn": 42}
          {"id": 3, "meta": {"user": "cora"}, "dyn": null}`,
          sessionId,
          { baseUrl, auth },
        ),
      );

      // Read as V1
      const dataV1 = await collectBytes(
        query(`SELECT * FROM ${table} ORDER BY id FORMAT Native`, sessionId, { baseUrl, auth }),
      );
      const decodedV1 = await decodeBatch(dataV1);
      assert.strictEqual(decodedV1.rowCount, 3);
      assertJsonDynValues(toArrayRows(decodedV1));

      // Read as V2
      const dataV2 = await collectBytes(
        query(`SELECT * FROM ${table} ORDER BY id FORMAT Native`, sessionId, {
          baseUrl,
          auth,
          clientVersion: 54500,
        }),
      );
      const decodedV2 = await decodeBatch(dataV2, { clientVersion: 54500 });
      assert.strictEqual(decodedV2.rowCount, 3);
      assertJsonDynValues(toArrayRows(decodedV2));

      // Read as V3
      const dataV3 = await collectBytes(
        query(
          `SELECT * FROM ${table} ORDER BY id FORMAT Native SETTINGS output_format_native_use_flattened_dynamic_and_json_serialization=1`,
          sessionId,
          { baseUrl, auth },
        ),
      );
      const decodedV3 = await decodeBatch(dataV3);
      assert.strictEqual(decodedV3.rowCount, 3);
      assertJsonDynValues(toArrayRows(decodedV3));
    } finally {
      await consume(query(`DROP TABLE ${table}`, sessionId, { baseUrl, auth }));
    }
  });

  it("round-trips JSON+Dynamic via Native V3 encode+decode", async () => {
    const table = "test_native_v3_roundtrip";
    await consume(query(`DROP TABLE IF EXISTS ${table}`, sessionId, { baseUrl, auth }));
    await consume(
      query(
        `CREATE TABLE ${table} (id Int32, meta JSON, dyn Dynamic) ENGINE = MergeTree ORDER BY id`,
        sessionId,
        { baseUrl, auth },
      ),
    );
    try {
      const encoded = encodeNativeRows(
        [
          { name: "id", type: "Int32" },
          { name: "meta", type: "JSON" },
          { name: "dyn", type: "Dynamic" },
        ],
        [
          [1, { user: "alice" }, "hello"],
          [2, { user: "bob" }, 42],
          [3, { user: "cora" }, null],
        ],
      );
      await insert(`INSERT INTO ${table} FORMAT Native`, encoded, sessionId, { baseUrl, auth });

      const data = await collectBytes(
        query(
          `SELECT * FROM ${table} ORDER BY id FORMAT Native SETTINGS output_format_native_use_flattened_dynamic_and_json_serialization=1`,
          sessionId,
          { baseUrl, auth },
        ),
      );
      const decoded = await decodeBatch(data);
      assert.strictEqual(decoded.rowCount, 3);
      const rows = toArrayRows(decoded);
      const m0 = rows[0][1] as Record<string, unknown>;
      const m1 = rows[1][1] as Record<string, unknown>;
      assert.strictEqual(m0.user, "alice");
      assert.strictEqual(m1.user, "bob");
      assert.strictEqual(rows[0][2], "hello");
      assert.strictEqual(rows[2][2], null);
    } finally {
      await consume(query(`DROP TABLE ${table}`, sessionId, { baseUrl, auth }));
    }
  });
});
