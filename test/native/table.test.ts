import assert from "node:assert";
import { describe, it } from "node:test";
import { DataColumn } from "../../native/columns.ts";
import {
  BufferReader,
  BufferWriter,
  batchFromCols,
  batchFromRows,
  type ColumnDef,
  DynamicValue,
  encodeNative,
  getCodec,
  RecordBatch,
  streamDecodeNative,
  streamEncodeNative,
} from "../../native/index.ts";
import { writeUtf8Buffer, writeUtf8Encoder } from "../../native/io.ts";
import { VariantValue } from "../../native/types.ts";
import { collect, decodeBatch, encodeNativeRows, toArrayRows, toAsync } from "../test_utils.ts";

function encodeInvalidNativeBlock(type = "NotAType"): Uint8Array {
  const writer = new BufferWriter();
  writer.writeVarint(1);
  writer.writeVarint(0);
  writer.writeString("bad");
  writer.writeString(type);
  return writer.finish();
}

describe("streamEncodeNative", () => {
  it("streams tables", async () => {
    // Create tables to stream
    async function* generateTables() {
      yield batchFromCols({ id: getCodec("Int32").fromValues([1, 2]) });
      yield batchFromCols({ id: getCodec("Int32").fromValues([3, 4]) });
      yield batchFromCols({ id: getCodec("Int32").fromValues([5]) });
    }

    const chunks = await collect(streamEncodeNative(generateTables()));

    assert.strictEqual(chunks.length, 3);

    // Decode each block
    const decoded1 = decodeBatch(chunks[0]!);
    assert.deepStrictEqual(toArrayRows(decoded1), [[1], [2]]);

    const decoded2 = decodeBatch(chunks[1]!);
    assert.deepStrictEqual(toArrayRows(decoded2), [[3], [4]]);

    const decoded3 = decodeBatch(chunks[2]!);
    assert.deepStrictEqual(toArrayRows(decoded3), [[5]]);
  });
});

describe("streamDecodeNative", () => {
  it("decodes streamed blocks", async () => {
    const columns: ColumnDef[] = [{ name: "id", type: "Int32" }];

    // Create two separate blocks
    const block1 = encodeNativeRows(columns, [[1], [2]]);
    const block2 = encodeNativeRows(columns, [[3], [4]]);

    // Stream them
    const results = await collect(streamDecodeNative(toAsync([block1, block2])));

    assert.strictEqual(results.length, 2);
    assert.ok(results[0] instanceof RecordBatch);
    assert.ok(results[1] instanceof RecordBatch);
    assert.deepStrictEqual(toArrayRows(results[0]), [[1], [2]]);
    assert.deepStrictEqual(toArrayRows(results[1]), [[3], [4]]);
  });

  it("handles partial chunks", async () => {
    const columns: ColumnDef[] = [{ name: "id", type: "Int32" }];
    const block = encodeNativeRows(columns, [[1], [2], [3]]);

    // Split block into small chunks
    const chunk1 = block.subarray(0, 5);
    const chunk2 = block.subarray(5, 10);
    const chunk3 = block.subarray(10);

    const results = await collect(streamDecodeNative(toAsync([chunk1, chunk2, chunk3])));

    assert.strictEqual(results.length, 1);
    assert.ok(results[0] instanceof RecordBatch);
    assert.deepStrictEqual(toArrayRows(results[0]), [[1], [2], [3]]);
  });

  it("flushes retry-throttled partial chunks at EOF", async () => {
    const columns: ColumnDef[] = [{ name: "id", type: "Int32" }];
    const block = encodeNativeRows(columns, [[1], [2], [3]]);

    // Split into 1-byte chunks so the adaptive backoff throttles retries,
    // then verify the EOF flush path still decodes the complete block.
    const oneByteChunks = Array.from({ length: block.length }, (_, i) => block.subarray(i, i + 1));
    const results = await collect(streamDecodeNative(toAsync(oneByteChunks)));

    assert.strictEqual(results.length, 1);
    assert.deepStrictEqual(toArrayRows(results[0]!), [[1], [2], [3]]);
  });

  it("throws on invalid trailing block at EOF instead of swallowing it", async () => {
    const columns: ColumnDef[] = [{ name: "id", type: "Int32" }];
    const validBlock = encodeNativeRows(columns, [[1], [2]]);
    const writer = new BufferWriter();
    writer.write(validBlock);
    writer.write(encodeInvalidNativeBlock());

    const iter = streamDecodeNative(toAsync([writer.finish()]))[Symbol.asyncIterator]();
    const first = await iter.next();

    assert.strictEqual(first.done, false);
    assert.deepStrictEqual(toArrayRows(first.value), [[1], [2]]);
    await assert.rejects(iter.next(), /Unknown type: NotAType/);
  });

  it("names the truncation when the final block is incomplete at EOF", async () => {
    const columns: ColumnDef[] = [{ name: "id", type: "Int32" }];
    const block1 = encodeNativeRows(columns, [[1], [2]]);
    const block2 = encodeNativeRows(columns, [[3], [4]]);
    const writer = new BufferWriter();
    writer.write(block1);
    writer.write(block2.subarray(0, block2.length - 1));

    const iter = streamDecodeNative(toAsync([writer.finish()]))[Symbol.asyncIterator]();
    const first = await iter.next();

    assert.strictEqual(first.done, false);
    assert.deepStrictEqual(toArrayRows(first.value), [[1], [2]]);
    await assert.rejects(iter.next(), /Native stream ended mid-block after 1 blocks/);
  });

  it("RecordBatch iteration yields stable row objects that can be collected", async () => {
    const schema: ColumnDef[] = [
      { name: "id", type: "Int32" },
      { name: "name", type: "String" },
    ];

    const batch = batchFromRows(schema, [
      [1, "alice"],
      [2, "bob"],
      [3, "charlie"],
    ]);

    const collected = [...batch];

    // Each element should be a distinct row reference (not a single reused view)
    assert.notStrictEqual(collected[0], collected[1]);
    assert.notStrictEqual(collected[1], collected[2]);

    // Values should remain correct after collection
    assert.strictEqual(collected[0]!.id, 1);
    assert.strictEqual(collected[0]!.name, "alice");
    assert.strictEqual(collected[1]!.id, 2);
    assert.strictEqual(collected[1]!.name, "bob");
    assert.strictEqual(collected[2]!.id, 3);
    assert.strictEqual(collected[2]!.name, "charlie");

    // Materialization helpers should also be stable
    assert.deepStrictEqual(collected[0]!.toObject(), { id: 1, name: "alice" });
    assert.deepStrictEqual(collected[2]!.toArray(), [3, "charlie"]);

    // Spread operator should copy row properties correctly
    const spread = { ...collected[0]! };
    assert.deepStrictEqual(spread, { id: 1, name: "alice" });

    // Object.keys should return column names
    assert.deepStrictEqual(Object.keys(collected[0]!), ["id", "name"]);
  });
});

describe("RecordBatch static methods", () => {
  it("fromCols creates table from pre-built columns", async () => {
    const table = batchFromCols({
      id: getCodec("UInt32").fromValues([1, 2, 3]),
      name: getCodec("String").fromValues(["alice", "bob", "charlie"]),
    });

    assert.strictEqual(table.length, 3);
    assert.strictEqual(table.numCols, 2);
    assert.deepStrictEqual(table.columnNames, ["id", "name"]);

    // Columns should have correct types
    assert.strictEqual(table.getColumn("id")?.type, "UInt32");
    assert.strictEqual(table.getColumn("name")?.type, "String");

    const rows = toArrayRows(table);
    assert.deepStrictEqual(rows[0], [1, "alice"]);
    assert.deepStrictEqual(rows[1], [2, "bob"]);
    assert.deepStrictEqual(rows[2], [3, "charlie"]);

    // Round-trip through encode/decode
    const encoded = encodeNative(table);
    const decoded = decodeBatch(encoded);
    assert.deepStrictEqual(toArrayRows(decoded), rows);
  });

  it("fromCols accepts an empty column map", () => {
    const table = batchFromCols({});

    assert.strictEqual(table.rowCount, 0);
    assert.strictEqual(table.length, 0);
    assert.strictEqual(table.numCols, 0);
    assert.deepStrictEqual(table.columnNames, []);
  });

  it("fromCols throws when a later column is shorter than the first", () => {
    assert.throws(
      () =>
        batchFromCols({
          id: getCodec("UInt32").fromValues([1, 2]),
          name: getCodec("String").fromValues(["alice"]),
        }),
      /Column length mismatch: expected 2 rows, column name has 1/,
    );
  });

  it("fromCols throws when a later column is longer than the first", () => {
    assert.throws(
      () =>
        batchFromCols({
          id: getCodec("UInt32").fromValues([1]),
          name: getCodec("String").fromValues(["alice", "bob"]),
        }),
      /Column length mismatch: expected 1 rows, column name has 2/,
    );
  });

  it("encodeNative rejects malformed RecordBatches with inconsistent row counts", () => {
    const batch = RecordBatch.from({
      columns: [{ name: "id", type: "UInt32" }],
      columnData: [getCodec("UInt32").fromValues([1])],
      rowCount: 2,
    });

    assert.throws(
      () => encodeNative(batch),
      /Column length mismatch: expected 2 rows, column id has 1/,
    );
  });

  it("fromRows creates table from row arrays", async () => {
    const schema: ColumnDef[] = [
      { name: "id", type: "UInt32" },
      { name: "value", type: "Float64" },
    ];
    const table = batchFromRows(schema, [
      [1, 1.5],
      [2, 2.5],
      [3, 3.5],
    ]);

    assert.strictEqual(table.length, 3);
    const rows = toArrayRows(table);
    assert.deepStrictEqual(rows[0], [1, 1.5]);
    assert.deepStrictEqual(rows[2], [3, 3.5]);
  });

  it("fromRows coerces Bool values on the array row path", () => {
    const table = batchFromRows(
      [
        { name: "id", type: "UInt32" },
        { name: "active", type: "Bool" },
      ],
      [
        [1, true],
        [2, false],
        [3, "1"],
      ],
    );

    assert.deepStrictEqual(toArrayRows(table), [
      [1, 1],
      [2, 0],
      [3, 1],
    ]);
  });

  it("fromRows accepts sync generator", async () => {
    const schema: ColumnDef[] = [
      { name: "x", type: "Int32" },
      { name: "y", type: "Int32" },
    ];

    function* generateRows() {
      yield [1, 2];
      yield [3, 4];
      yield [5, 6];
    }

    const table = batchFromRows(schema, generateRows());
    assert.strictEqual(table.length, 3);
    assert.deepStrictEqual(toArrayRows(table), [
      [1, 2],
      [3, 4],
      [5, 6],
    ]);
  });

  it("fromRows accepts async generator and returns Promise", async () => {
    const schema: ColumnDef[] = [
      { name: "id", type: "UInt32" },
      { name: "name", type: "String" },
    ];

    async function* generateRows() {
      yield [1, "alice"];
      yield [2, "bob"];
    }

    const table = await batchFromRows(schema, generateRows());
    assert.strictEqual(table.length, 2);
    assert.deepStrictEqual(toArrayRows(table), [
      [1, "alice"],
      [2, "bob"],
    ]);
  });

  it("fromRows coerces string values to numbers", async () => {
    const schema: ColumnDef[] = [
      { name: "id", type: "UInt32" },
      { name: "value", type: "Int64" },
    ];
    const table = batchFromRows(schema, [
      ["123", "456"],
      ["789", "-100"],
    ]);

    assert.strictEqual(table.length, 2);
    assert.strictEqual(table.get(0).id, 123);
    assert.strictEqual(table.get(0).value, 456n);
    assert.strictEqual(table.get(1).id, 789);
    assert.strictEqual(table.get(1).value, -100n);
  });

  it("fromRows throws on overflow and invalid values", () => {
    assert.throws(() => batchFromRows([{ name: "x", type: "Int8" }], [[128]]), /Int8 out of range/);
    assert.throws(
      () => batchFromRows([{ name: "x", type: "UInt8" }], [[-1]]),
      /UInt8 out of range/,
    );
    assert.throws(() => batchFromRows([{ name: "x", type: "Int32" }], [[1.5]]), /expected integer/);
    assert.throws(
      () => batchFromRows([{ name: "x", type: "UInt64" }], [[-1n]]),
      /UInt64 out of range/,
    );
    assert.throws(() => batchFromRows([{ name: "x", type: "Int32" }], [["abc"]]), /Cannot coerce/);
  });
});

describe("getCodec().fromValues()", () => {
  it("creates columns from value arrays", () => {
    const col = getCodec("Int32").fromValues([1, 2, 3]);

    assert.strictEqual(col.length, 3);
    assert.strictEqual(col.type, "Int32");
    assert.strictEqual(col.get(0), 1);
    assert.strictEqual(col.get(1), 2);
    assert.strictEqual(col.get(2), 3);
  });

  it("String fromValues copies caller-owned arrays", () => {
    const values = ["alice", "bob"];
    const col = getCodec("String").fromValues(values);
    values[0] = "mutated";

    assert.strictEqual(col.get(0), "alice");
    assert.strictEqual(col.get(1), "bob");
  });

  it("String encode coerces non-string DataColumn values", () => {
    const codec = getCodec("String");
    const encoded = codec.encode(new DataColumn("String", [1, null, { a: 2 }]));
    const reader = new BufferReader(encoded);

    assert.strictEqual(reader.readString(), "1");
    assert.strictEqual(reader.readString(), "");
    assert.strictEqual(reader.readString(), '{"a":2}');
  });

  it("works with complex types", async () => {
    // Array(Int32)
    const arrCol = getCodec("Array(Int32)").fromValues([[1, 2, 3], [4, 5], [6]]);
    assert.strictEqual(arrCol.type, "Array(Int32)");
    assert.deepStrictEqual(arrCol.get(0), [1, 2, 3]);
    assert.deepStrictEqual(arrCol.get(2), [6]);

    // Tuple(Float64, Float64)
    const tupleCol = getCodec("Tuple(Float64, Float64)").fromValues([
      [1.0, 2.0],
      [3.0, 4.0],
    ]);
    assert.strictEqual(tupleCol.type, "Tuple(Float64, Float64)");
    assert.deepStrictEqual(tupleCol.get(0), [1.0, 2.0]);

    // Named Tuple
    const namedTupleCol = getCodec("Tuple(x Float64, y Float64)").fromValues([
      { x: 1.0, y: 2.0 },
      { x: 3.0, y: 4.0 },
    ]);
    assert.deepStrictEqual(namedTupleCol.get(0), { x: 1.0, y: 2.0 });

    // Nullable(String)
    const nullableCol = getCodec("Nullable(String)").fromValues(["hello", null, "world"]);
    assert.strictEqual(nullableCol.get(0), "hello");
    assert.strictEqual(nullableCol.get(1), null);
    assert.strictEqual(nullableCol.get(2), "world");
  });

  it("columns carry their type for batchFromCols", () => {
    const pointCol = getCodec("Tuple(Float64, Float64)").fromValues([
      [1.0, 2.0],
      [3.0, 4.0],
    ]);

    const table = batchFromCols({ point: pointCol });

    // Schema derived from column type
    assert.deepStrictEqual(table.schema, [{ name: "point", type: "Tuple(Float64, Float64)" }]);
  });
});

describe("Column type property", () => {
  it("decoded columns have correct type strings", async () => {
    const schema: ColumnDef[] = [
      { name: "i", type: "Int32" },
      { name: "s", type: "String" },
      { name: "arr", type: "Array(UInt64)" },
      { name: "n", type: "Nullable(Float64)" },
    ];
    const table = batchFromRows(schema, [
      [1, "hello", [1n, 2n], 1.5],
      [2, "world", [3n], null],
    ]);

    // Columns have type property
    assert.strictEqual(table.getColumn("i")?.type, "Int32");
    assert.strictEqual(table.getColumn("s")?.type, "String");
    assert.strictEqual(table.getColumn("arr")?.type, "Array(UInt64)");
    assert.strictEqual(table.getColumn("n")?.type, "Nullable(Float64)");

    // Round-trip preserves types
    const encoded = encodeNative(table);
    const decoded = decodeBatch(encoded);
    assert.strictEqual(decoded.getColumn("i")?.type, "Int32");
    assert.strictEqual(decoded.getColumn("s")?.type, "String");
    assert.strictEqual(decoded.getColumn("arr")?.type, "Array(UInt64)");
    assert.strictEqual(decoded.getColumn("n")?.type, "Nullable(Float64)");
  });
});

describe("Complex types via fromCols", () => {
  it("Array(Int32)", async () => {
    const table = batchFromCols({
      tags: getCodec("Array(Int32)").fromValues([[1, 2], [3, 4, 5], [6]]),
    });
    assert.strictEqual(table.length, 3);
    assert.deepStrictEqual(table.getColumn("tags")?.get(0), [1, 2]);
    assert.deepStrictEqual(table.getColumn("tags")?.get(1), [3, 4, 5]);
    assert.deepStrictEqual(table.getColumn("tags")?.get(2), [6]);

    // Round-trip
    const decoded = decodeBatch(encodeNative(table));
    assert.deepStrictEqual(toArrayRows(decoded), toArrayRows(table));
  });

  it("Tuple(Float64, Float64) - positional", async () => {
    const table = batchFromCols({
      point: getCodec("Tuple(Float64, Float64)").fromValues([
        [1.0, 2.0],
        [3.0, 4.0],
      ]),
    });
    assert.deepStrictEqual(table.getColumn("point")?.get(0), [1.0, 2.0]);
    assert.deepStrictEqual(table.getColumn("point")?.get(1), [3.0, 4.0]);

    const decoded = decodeBatch(encodeNative(table));
    assert.deepStrictEqual(toArrayRows(decoded), toArrayRows(table));
  });

  it("Tuple(x Float64, y Float64) - named", async () => {
    const table = batchFromCols({
      point: getCodec("Tuple(x Float64, y Float64)").fromValues([
        { x: 1.0, y: 2.0 },
        { x: 3.0, y: 4.0 },
      ]),
    });
    assert.deepStrictEqual(table.getColumn("point")?.get(0), { x: 1.0, y: 2.0 });
    assert.deepStrictEqual(table.getColumn("point")?.get(1), { x: 3.0, y: 4.0 });

    const decoded = decodeBatch(encodeNative(table));
    assert.deepStrictEqual(toArrayRows(decoded), toArrayRows(table));
  });

  it("Map(String, Int32)", async () => {
    const table = batchFromCols({
      meta: getCodec("Map(String, Int32)").fromValues([{ a: 1, b: 2 }, new Map([["c", 3]])]),
    });
    assert.deepStrictEqual(
      table.getColumn("meta")?.get(0),
      new Map([
        ["a", 1],
        ["b", 2],
      ]),
    );
    assert.deepStrictEqual(table.getColumn("meta")?.get(1), new Map([["c", 3]]));

    const decoded = decodeBatch(encodeNative(table));
    assert.deepStrictEqual(toArrayRows(decoded), toArrayRows(table));
  });

  it("Nullable(String)", async () => {
    const table = batchFromCols({
      note: getCodec("Nullable(String)").fromValues(["hello", null, "world"]),
    });
    assert.strictEqual(table.getColumn("note")?.get(0), "hello");
    assert.strictEqual(table.getColumn("note")?.get(1), null);
    assert.strictEqual(table.getColumn("note")?.get(2), "world");

    const decoded = decodeBatch(encodeNative(table));
    assert.deepStrictEqual(toArrayRows(decoded), toArrayRows(table));
  });

  it("Variant(String, Int64, Bool) - type inferred", async () => {
    const table = batchFromCols({
      val: getCodec("Variant(String, Int64, Bool)").fromValues(["hello", 42n, true, null]),
    });
    // Arms canonicalize to ClickHouse's sorted order: Bool=0, Int64=1, String=2
    assert.deepStrictEqual(table.getColumn("val")?.get(0), new VariantValue(2, "hello"));
    assert.deepStrictEqual(table.getColumn("val")?.get(1), new VariantValue(1, 42n));
    // Bool stores as 1/0
    assert.deepStrictEqual(table.getColumn("val")?.get(2), new VariantValue(0, 1));
    assert.strictEqual(table.getColumn("val")?.get(3), null);

    const decoded = decodeBatch(encodeNative(table));
    assert.deepStrictEqual(toArrayRows(decoded), toArrayRows(table));
  });

  it("Variant(String, Int64, Bool) - explicit discriminators", async () => {
    const table = batchFromCols({
      val: getCodec("Variant(String, Int64, Bool)").fromValues([
        new VariantValue(2, "hello"),
        new VariantValue(1, 42n),
        new VariantValue(0, true),
        null,
      ]),
    });
    assert.deepStrictEqual(table.getColumn("val")?.get(0), new VariantValue(2, "hello"));
    assert.deepStrictEqual(table.getColumn("val")?.get(1), new VariantValue(1, 42n));
    assert.deepStrictEqual(table.getColumn("val")?.get(2), new VariantValue(0, 1));
    assert.strictEqual(table.getColumn("val")?.get(3), null);

    const decoded = decodeBatch(encodeNative(table));
    assert.deepStrictEqual(toArrayRows(decoded), toArrayRows(table));
  });

  it("Dynamic", async () => {
    const table = batchFromCols({
      dyn: getCodec("Dynamic").fromValues(["hello", 42, true, [1, 2, 3], null]),
    });
    assert.strictEqual(table.getColumn("dyn")?.get(0), "hello");
    assert.strictEqual(table.getColumn("dyn")?.get(1), 42n); // integers become Int64
    assert.strictEqual(table.getColumn("dyn")?.get(2), 1); // bool becomes 1/0
    assert.deepStrictEqual(table.getColumn("dyn")?.get(3), [1n, 2n, 3n]); // array of Int64
    assert.strictEqual(table.getColumn("dyn")?.get(4), null);

    const decoded = decodeBatch(encodeNative(table));
    assert.deepStrictEqual(toArrayRows(decoded), toArrayRows(table));
  });

  it("JSON", async () => {
    const table = batchFromCols({
      data: getCodec("JSON").fromValues([
        { a: 1, b: "x" },
        { a: 2, c: true },
      ]),
    });
    // JSON returns objects with dynamic values per path
    // Missing keys are omitted from the object (not set to null)
    const row0 = table.getColumn("data")?.get(0) as Record<string, unknown>;
    const row1 = table.getColumn("data")?.get(1) as Record<string, unknown>;
    assert.strictEqual(row0.a, 1n); // integers become Int64
    assert.strictEqual(row0.b, "x");
    assert.ok(!("c" in row0)); // missing keys are omitted
    assert.strictEqual(row1.a, 2n);
    assert.ok(!("b" in row1)); // missing keys are omitted
    assert.strictEqual(row1.c, 1); // bool becomes 1/0

    const decoded = decodeBatch(encodeNative(table));
    // After round-trip, compare
    const decodedRow0 = decoded.getColumn("data")?.get(0) as Record<string, unknown>;
    const decodedRow1 = decoded.getColumn("data")?.get(1) as Record<string, unknown>;
    assert.strictEqual(decodedRow0.a, 1n);
    assert.strictEqual(decodedRow0.b, "x");
    assert.strictEqual(decodedRow1.a, 2n);
    assert.strictEqual(decodedRow1.c, 1);
  });
});

describe("Complex types via getCodec().fromValues()", () => {
  it("Array(Int32)", async () => {
    const col = getCodec("Array(Int32)").fromValues([[1, 2], [3, 4, 5], [6]]);
    assert.strictEqual(col.type, "Array(Int32)");
    assert.deepStrictEqual(col.get(0), [1, 2]);
    assert.deepStrictEqual(col.get(1), [3, 4, 5]);

    const table = batchFromCols({ tags: col });
    const decoded = decodeBatch(encodeNative(table));
    assert.deepStrictEqual(toArrayRows(decoded), toArrayRows(table));
  });

  it("Tuple(Float64, Float64) - positional", async () => {
    const col = getCodec("Tuple(Float64, Float64)").fromValues([
      [1.0, 2.0],
      [3.0, 4.0],
    ]);
    assert.strictEqual(col.type, "Tuple(Float64, Float64)");
    assert.deepStrictEqual(col.get(0), [1.0, 2.0]);

    const table = batchFromCols({ point: col });
    const decoded = decodeBatch(encodeNative(table));
    assert.deepStrictEqual(toArrayRows(decoded), toArrayRows(table));
  });

  it("Tuple(x Float64, y Float64) - named", async () => {
    const col = getCodec("Tuple(x Float64, y Float64)").fromValues([
      { x: 1.0, y: 2.0 },
      { x: 3.0, y: 4.0 },
    ]);
    assert.strictEqual(col.type, "Tuple(x Float64, y Float64)");
    assert.deepStrictEqual(col.get(0), { x: 1.0, y: 2.0 });

    const table = batchFromCols({ point: col });
    const decoded = decodeBatch(encodeNative(table));
    assert.deepStrictEqual(toArrayRows(decoded), toArrayRows(table));
  });

  it("Map(String, Int32)", async () => {
    const col = getCodec("Map(String, Int32)").fromValues([{ a: 1, b: 2 }, new Map([["c", 3]])]);
    assert.strictEqual(col.type, "Map(String, Int32)");
    assert.deepStrictEqual(
      col.get(0),
      new Map([
        ["a", 1],
        ["b", 2],
      ]),
    );
    assert.deepStrictEqual(col.get(1), new Map([["c", 3]]));

    const table = batchFromCols({ meta: col });
    const decoded = decodeBatch(encodeNative(table));
    assert.deepStrictEqual(toArrayRows(decoded), toArrayRows(table));
  });

  it("Nullable(String)", async () => {
    const col = getCodec("Nullable(String)").fromValues(["hello", null, "world"]);
    assert.strictEqual(col.type, "Nullable(String)");
    assert.strictEqual(col.get(0), "hello");
    assert.strictEqual(col.get(1), null);
    assert.strictEqual(col.get(2), "world");

    const table = batchFromCols({ note: col });
    const decoded = decodeBatch(encodeNative(table));
    assert.deepStrictEqual(toArrayRows(decoded), toArrayRows(table));
  });

  it("Variant(String, Int64, Bool) - type inferred", async () => {
    const col = getCodec("Variant(String, Int64, Bool)").fromValues(["hello", 42n, true, null]);
    assert.strictEqual(col.type, "Variant(Bool, Int64, String)");
    assert.deepStrictEqual(col.get(0), new VariantValue(2, "hello"));
    assert.deepStrictEqual(col.get(1), new VariantValue(1, 42n));
    assert.deepStrictEqual(col.get(2), new VariantValue(0, 1)); // bool becomes 1/0
    assert.strictEqual(col.get(3), null);

    const table = batchFromCols({ val: col });
    const decoded = decodeBatch(encodeNative(table));
    assert.deepStrictEqual(toArrayRows(decoded), toArrayRows(table));
  });

  it("Variant(String, Int64, Bool) - explicit discriminators", async () => {
    const col = getCodec("Variant(String, Int64, Bool)").fromValues([
      new VariantValue(2, "hello"),
      new VariantValue(1, 42n),
      new VariantValue(0, true),
      null,
    ]);
    assert.strictEqual(col.type, "Variant(Bool, Int64, String)");
    assert.deepStrictEqual(col.get(0), new VariantValue(2, "hello"));
    assert.deepStrictEqual(col.get(1), new VariantValue(1, 42n));
    assert.strictEqual(col.get(3), null);

    const table = batchFromCols({ val: col });
    const decoded = decodeBatch(encodeNative(table));
    assert.deepStrictEqual(toArrayRows(decoded), toArrayRows(table));
  });

  it("Dynamic", async () => {
    const col = getCodec("Dynamic").fromValues(["hello", 42, true, [1, 2, 3], null]);
    assert.strictEqual(col.type, "Dynamic");
    assert.strictEqual(col.get(0), "hello");
    assert.strictEqual(col.get(1), 42n); // integers become Int64
    assert.strictEqual(col.get(2), 1); // bool becomes 1/0
    assert.deepStrictEqual(col.get(3), [1n, 2n, 3n]);
    assert.strictEqual(col.get(4), null);

    const table = batchFromCols({ dyn: col });
    const decoded = decodeBatch(encodeNative(table));
    assert.deepStrictEqual(toArrayRows(decoded), toArrayRows(table));
  });

  it("JSON", async () => {
    const col = getCodec("JSON").fromValues([
      { a: 1, b: "x" },
      { a: 2, c: true },
    ]);
    assert.strictEqual(col.type, "JSON");

    const row0 = col.get(0) as Record<string, unknown>;
    const row1 = col.get(1) as Record<string, unknown>;
    assert.strictEqual(row0.a, 1n);
    assert.strictEqual(row0.b, "x");
    assert.strictEqual(row1.a, 2n);
    assert.strictEqual(row1.c, 1); // bool becomes 1/0

    const table = batchFromCols({ data: col });
    const decoded = decodeBatch(encodeNative(table));
    assert.deepStrictEqual(toArrayRows(decoded), toArrayRows(table));
  });

  it("nested: Array(Tuple(String, Int32))", async () => {
    const col = getCodec("Array(Tuple(String, Int32))").fromValues([
      [
        ["a", 1],
        ["b", 2],
      ],
      [["c", 3]],
      [],
    ]);
    assert.strictEqual(col.type, "Array(Tuple(String, Int32))");
    assert.deepStrictEqual(col.get(0), [
      ["a", 1],
      ["b", 2],
    ]);
    assert.deepStrictEqual(col.get(1), [["c", 3]]);
    assert.deepStrictEqual(col.get(2), []);

    const table = batchFromCols({ nested: col });
    const decoded = decodeBatch(encodeNative(table));
    assert.deepStrictEqual(toArrayRows(decoded), toArrayRows(table));
  });

  it("nested: Map(String, Array(Int32))", async () => {
    const col = getCodec("Map(String, Array(Int32))").fromValues([
      { x: [1, 2], y: [3, 4, 5] },
      new Map([["z", [6]]]),
    ]);
    assert.strictEqual(col.type, "Map(String, Array(Int32))");

    const table = batchFromCols({ nested: col });
    const decoded = decodeBatch(encodeNative(table));
    assert.deepStrictEqual(toArrayRows(decoded), toArrayRows(table));
  });
});

describe("JsonCodec.fromCols", () => {
  it("typed path from raw values", () => {
    const codec = getCodec("JSON(id UInt32, name String)");
    const col = codec.fromCols({
      id: [1, 2, 3],
      name: ["a", "b", "c"],
    });

    assert.strictEqual(col.type, "JSON(id UInt32, name String)");
    assert.strictEqual(col.length, 3);
    const row0 = col.get(0) as Record<string, unknown>;
    assert.strictEqual(row0.id, 1);
    assert.strictEqual(row0.name, "a");
  });

  it("typed path from TypedArray", () => {
    const codec = getCodec("JSON(id UInt32)");
    const col = codec.fromCols({ id: new Uint32Array([10, 20]) });

    assert.strictEqual(col.length, 2);
    assert.strictEqual((col.get(0) as Record<string, unknown>).id, 10);
    assert.strictEqual((col.get(1) as Record<string, unknown>).id, 20);
  });

  it("typed path from pre-built Column", () => {
    const innerCol = getCodec("UInt32").fromValues([7, 8, 9]);
    const codec = getCodec("JSON(id UInt32)");
    const col = codec.fromCols({ id: innerCol });

    assert.strictEqual(col.length, 3);
    assert.strictEqual((col.get(2) as Record<string, unknown>).id, 9);
  });

  it("batchFromCols infers declared type from fromCols column", () => {
    const codec = getCodec("JSON(id UInt32)");
    const col = codec.fromCols({ id: [1] });
    const batch = batchFromCols({ payload: col });

    assert.strictEqual(batch.schema[0]!.type, "JSON(id UInt32)");
  });

  it("missing typed path throws", () => {
    const codec = getCodec("JSON(id UInt32, name String)");
    assert.throws(() => codec.fromCols({ id: [1] }), /Missing typed path 'name'/);
  });

  it("path length mismatch throws", () => {
    const codec = getCodec("JSON(id UInt32, name String)");
    assert.throws(() => codec.fromCols({ id: [1, 2], name: ["a"] }), /Column length mismatch/);
  });

  it("typed path type mismatch throws", () => {
    const innerCol = getCodec("Int32").fromValues([1, 2]);
    const codec = getCodec("JSON(id UInt32)");
    assert.throws(
      () => codec.fromCols({ id: innerCol }),
      /Type mismatch for typed path 'id': expected 'UInt32', got 'Int32'/,
    );
  });

  it("dynamic path from heterogeneous array", () => {
    const codec = getCodec("JSON");
    const col = codec.fromCols({
      meta: ["hello", new DynamicValue("UInt64", 42n), null],
    });

    assert.strictEqual(col.length, 3);
    const row0 = col.get(0) as Record<string, unknown>;
    assert.strictEqual(row0.meta, "hello");
    const row2 = col.get(2) as Record<string, unknown>;
    assert.ok(!("meta" in row2));
  });

  it("TypedArray on dynamic path throws", () => {
    const codec = getCodec("JSON");
    assert.throws(
      () => codec.fromCols({ nums: new Float64Array([1, 2]) }),
      /Dynamic path 'nums' must be a plain array or a Dynamic column/,
    );
  });

  it("non-Dynamic Column on dynamic path throws", () => {
    const codec = getCodec("JSON");
    const innerCol = getCodec("String").fromValues(["a", "b"]);
    assert.throws(
      () => codec.fromCols({ name: innerCol }),
      /Dynamic path 'name' must be a plain array or a Dynamic column, got a 'String' column/,
    );
  });

  it("Dynamic Column on dynamic path is accepted without re-shredding", () => {
    const codec = getCodec("JSON");
    const dynCol = getCodec("Dynamic").fromValues(["a", 42n, null]);
    const col = codec.fromCols({ meta: dynCol });

    assert.strictEqual(col.length, 3);
    assert.strictEqual(col.getPath("meta"), dynCol);
    const batch = batchFromCols({ data: col });
    const decoded = decodeBatch(encodeNative(batch));
    assert.deepStrictEqual(toArrayRows(decoded), toArrayRows(batch));
  });

  it("non-array value on dynamic path throws", () => {
    const codec = getCodec("JSON");
    assert.throws(
      () => codec.fromCols({ s: "abc" as unknown as unknown[] }),
      /Dynamic path 's' must be a plain array or a Dynamic column/,
    );
  });

  it("dynamic path wire order: byte-order sort", () => {
    const codec = getCodec("JSON");
    const col = codec.fromCols({
      tp_2: ["a", "b"],
      tp_10: ["c", "d"],
    });
    // tp_10 sorts before tp_2 in byte order
    assert.deepStrictEqual(col.paths, ["tp_10", "tp_2"]);
  });

  it("mixed typed + dynamic paths round-trip", () => {
    const codec = getCodec("JSON(id UInt32)");
    const col = codec.fromCols({
      id: new Uint32Array([1, 2, 3]),
      tag: ["x", "y", null],
    });

    const batch = batchFromCols({ data: col });
    const decoded = decodeBatch(encodeNative(batch));
    assert.deepStrictEqual(toArrayRows(decoded), toArrayRows(batch));
  });

  it("empty input produces zero-length column", () => {
    const codec = getCodec("JSON");
    const col = codec.fromCols({});
    assert.strictEqual(col.length, 0);
    assert.strictEqual(col.type, "JSON");
  });

  it("typed path with Nullable accepts null values", () => {
    const codec = getCodec("JSON(name Nullable(String))");
    const col = codec.fromCols({ name: ["hello", null, "world"] });
    const row1 = col.get(1) as Record<string, unknown>;
    assert.ok(!("name" in row1));
  });
});

describe("bigIntAsString option", () => {
  it("batch.get() converts bigint to string when option is set", () => {
    const batch = batchFromCols({
      id: getCodec("Int64").fromValues([1n, 9223372036854775807n]),
      name: getCodec("String").fromValues(["small", "max"]),
    });

    const row1 = batch.get(1);
    assert.strictEqual(typeof row1.id, "bigint");
    assert.strictEqual(row1.id, 9223372036854775807n);

    const row2 = batch.get(1, { bigIntAsString: true });
    assert.strictEqual(typeof row2.id, "string");
    assert.strictEqual(row2.id, "9223372036854775807");
    assert.strictEqual(row2.name, "max");
  });

  it("row.toObject() converts bigint to string when option is set", () => {
    const batch = batchFromCols({
      val: getCodec("UInt64").fromValues([18446744073709551615n]),
    });
    const row = batch.get(0);

    assert.strictEqual(typeof row.toObject().val, "bigint");

    const obj = row.toObject({ bigIntAsString: true });
    assert.strictEqual(typeof obj.val, "string");
    assert.strictEqual(obj.val, "18446744073709551615");
  });

  it("row.toArray() converts bigint to string when option is set", () => {
    const batch = batchFromCols({
      a: getCodec("Int64").fromValues([123n]),
      b: getCodec("Int32").fromValues([456]),
    });
    const row = batch.get(0);

    assert.strictEqual(typeof row.toArray()[0], "bigint");

    const arr = row.toArray({ bigIntAsString: true });
    assert.strictEqual(typeof arr[0], "string");
    assert.strictEqual(arr[0], "123");
    assert.strictEqual(arr[1], 456);
  });

  it("batch.toArray() converts bigint to string when option is set", () => {
    const batch = batchFromCols({
      big: getCodec("Int128").fromValues([170141183460469231731687303715884105727n]),
    });

    assert.strictEqual(typeof batch.toArray()[0]!.big, "bigint");

    const rows = batch.toArray({ bigIntAsString: true });
    assert.strictEqual(typeof rows[0]!.big, "string");
    assert.strictEqual(rows[0]!.big, "170141183460469231731687303715884105727");
  });

  it("option set on batch.get() applies to row property access", () => {
    const batch = batchFromCols({ x: getCodec("Int64").fromValues([42n]) });
    const row = batch.get(0, { bigIntAsString: true });
    assert.strictEqual(typeof row.x, "string");
    assert.strictEqual(row.x, "42");
  });

  it("option can be overridden in toObject/toArray", () => {
    const batch = batchFromCols({ n: getCodec("UInt64").fromValues([999n]) });
    const row = batch.get(0, { bigIntAsString: true });

    assert.strictEqual(typeof row.toObject({ bigIntAsString: false }).n, "bigint");
    assert.strictEqual(typeof row.toArray({ bigIntAsString: false })[0], "bigint");
  });
});

describe("RecordBatch.isRecordBatch", () => {
  it("recognizes a real RecordBatch", () => {
    const batch = batchFromCols({ x: getCodec("Int64").fromValues([1n]) });
    assert.strictEqual(RecordBatch.isRecordBatch(batch), true);
    assert.strictEqual(batch instanceof RecordBatch, true);
  });

  it("rejects non-RecordBatch values", () => {
    for (const v of [null, undefined, 42, "batch", {}, [], new Map()]) {
      assert.strictEqual(RecordBatch.isRecordBatch(v), false);
    }
  });

  it("isRecordBatch recognizes an instance from a separate module copy", () => {
    // Simulate a RecordBatch built by a different copy of this module (ESM vs
    // CJS, or source vs bundled dist): a distinct object that carries the same
    // global-registry brand symbol. instanceof would fail; isRecordBatch must not.
    const foreign = { [Symbol.for("chwire.RecordBatch")]: true } as unknown;
    assert.strictEqual(foreign instanceof RecordBatch, false);
    assert.strictEqual(RecordBatch.isRecordBatch(foreign), true);
  });
});

describe("writeUtf8 implementations", () => {
  const cases = [
    { label: "ASCII", str: "hello world" },
    { label: "multibyte", str: "éèêë" },
    { label: "emoji", str: "test 🚀 rocket" },
    { label: "long ASCII", str: "a".repeat(200) },
    { label: "long multibyte", str: "ü".repeat(200) },
    { label: "empty", str: "" },
  ];

  for (const { label, str } of cases) {
    it(`Buffer and Encoder agree on ${label} strings`, () => {
      const maxLen = str.length * 3;
      const bufA = new Uint8Array(maxLen);
      const bufB = new Uint8Array(maxLen);
      const lenA = writeUtf8Buffer(str, bufA, 0, maxLen);
      const lenB = writeUtf8Encoder(str, bufB, 0, maxLen);
      assert.strictEqual(lenA, lenB, `byte lengths differ for "${label}"`);
      assert.deepStrictEqual(bufA.subarray(0, lenA), bufB.subarray(0, lenB));
    });
  }

  it("works at non-zero offset", () => {
    const str = "café";
    const maxLen = str.length * 3;
    const offset = 10;
    const bufA = new Uint8Array(offset + maxLen);
    const bufB = new Uint8Array(offset + maxLen);
    const lenA = writeUtf8Buffer(str, bufA, offset, maxLen);
    const lenB = writeUtf8Encoder(str, bufB, offset, maxLen);
    assert.strictEqual(lenA, lenB);
    assert.deepStrictEqual(
      bufA.subarray(offset, offset + lenA),
      bufB.subarray(offset, offset + lenB),
    );
  });

  it("round-trips through BufferWriter.writeString + BufferReader.readString", () => {
    const strings = ["hello", "élève", "a".repeat(200), "🚀💻🌟"];
    const writer = new BufferWriter();
    for (const s of strings) writer.writeString(s);
    const buf = writer.finish();
    const reader = new BufferReader(buf);
    for (const s of strings) {
      assert.strictEqual(reader.readString(), s);
    }
  });
});
