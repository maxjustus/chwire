/**
 * Tests for version validation in Dynamic and JSON codecs.
 *
 * These types use readPrefix() which validates the format version.
 * Dynamic supports V1 (legacy=0, modern=1), V2, and V3 (flattened).
 * JSON currently supports V3 only (V1/V2 decode coming soon).
 */

import assert from "node:assert";
import { describe, it } from "node:test";
import { decodeNativeBlock } from "../../native/index.ts";
import { Dynamic, JSONFormat } from "../../native/constants.ts";
import { buildTestBlock } from "../test_utils.ts";

/** Build a V3 Dynamic block (flattened format). */
function buildDynamicBlockV3(rows: number): Uint8Array {
  return buildTestBlock({
    colName: "d",
    colType: "Dynamic",
    rows,
    prefix: (w) => {
      w.writeU64LE(Dynamic.VERSION_V3);
      w.writeVarint(0); // no types
    },
    data: (w) => {
      // All NULLs: discriminator = type count (0) for each row
      for (let i = 0; i < rows; i++) w.writeU8(0);
    },
  });
}

/**
 * Build a V1/V2 Dynamic block.
 * Wire format: version, [max_dyn_types for V1], num_types, type_names...,
 *              variant_version(u64), type_prefixes...
 * Data: u8 discriminators (0xFF = NULL)
 */
function buildDynamicBlockV1V2(version: bigint, rows: number): Uint8Array {
  return buildTestBlock({
    colName: "d",
    colType: "Dynamic",
    rows,
    prefix: (w) => {
      w.writeU64LE(version);
      // V1 legacy (0) and V1 modern (1) have max_dynamic_types
      if (version === Dynamic.VERSION_V1_LEGACY || version === Dynamic.VERSION_V1) {
        w.writeVarint(256); // max_dynamic_types (skipped by reader)
      }
      w.writeVarint(0); // num_types (no real types, just SharedVariant)
      // variant_version u64
      w.writeU64LE(0n);
      // No nested type prefixes (String codec has none)
    },
    data: (w) => {
      // All NULLs: 0xFF discriminators
      for (let i = 0; i < rows; i++) w.writeU8(0xff);
    },
  });
}

/** Build a Dynamic block with arbitrary version (for rejection test). */
function buildDynamicBlockRaw(version: bigint, rows: number): Uint8Array {
  return buildTestBlock({
    colName: "d",
    colType: "Dynamic",
    rows,
    prefix: (w) => {
      w.writeU64LE(version);
      w.writeVarint(0);
    },
    data: (w) => {
      for (let i = 0; i < rows; i++) w.writeU8(0);
    },
  });
}

/** Build a Native block with JSON type and specified version. */
function buildJSONBlock(version: bigint, rows: number): Uint8Array {
  return buildTestBlock({
    colName: "j",
    colType: "JSON",
    rows,
    prefix: (w) => {
      w.writeU64LE(version);
      w.writeVarint(0); // no paths
    },
    // JSON with no paths = just prefix, no data bytes per row
    data: () => {},
  });
}

describe("version validation tests", () => {
  describe("Dynamic codec", () => {
    it("decodes V3 format successfully", () => {
      const data = buildDynamicBlockV3(5);
      const result = decodeNativeBlock(data, 0, { clientVersion: 54454 });

      assert.strictEqual(result.rowCount, 5);
      assert.strictEqual(result.columns[0].type, "Dynamic");
    });

    it("decodes V2 format successfully", () => {
      const data = buildDynamicBlockV1V2(Dynamic.VERSION_V2, 5);
      const result = decodeNativeBlock(data, 0, { clientVersion: 54454 });

      assert.strictEqual(result.rowCount, 5);
      assert.strictEqual(result.columns[0].type, "Dynamic");
    });

    it("decodes V1 legacy (version=0) format successfully", () => {
      const data = buildDynamicBlockV1V2(Dynamic.VERSION_V1_LEGACY, 5);
      const result = decodeNativeBlock(data, 0, { clientVersion: 54454 });

      assert.strictEqual(result.rowCount, 5);
      assert.strictEqual(result.columns[0].type, "Dynamic");
    });

    it("decodes V1 modern (version=1) format successfully", () => {
      const data = buildDynamicBlockV1V2(Dynamic.VERSION_V1, 3);
      const result = decodeNativeBlock(data, 0, { clientVersion: 54454 });

      assert.strictEqual(result.rowCount, 3);
      assert.strictEqual(result.columns[0].type, "Dynamic");
    });

    it("decodes V2 block with Int64 and String types", () => {
      // Build a V2 Dynamic block with 2 types: Int64, String (+ implicit SharedVariant String)
      // 3 rows: row0=42n (Int64, disc=0), row1="hello" (String, disc=1), row2=NULL (disc=0xFF)
      const data = buildTestBlock({
        colName: "d",
        colType: "Dynamic",
        rows: 3,
        prefix: (w) => {
          w.writeU64LE(Dynamic.VERSION_V2);
          w.writeVarint(2); // 2 real types
          w.writeString("Int64");
          w.writeString("String");
          // variant_version
          w.writeU64LE(0n);
          // No nested prefixes (Int64, String, SharedVariant String have none)
        },
        data: (w) => {
          // u8 discriminators: [0, 1, 0xFF]
          w.writeU8(0); // Int64
          w.writeU8(1); // String
          w.writeU8(0xff); // NULL

          // Int64 group (1 row: 42)
          const buf = new ArrayBuffer(8);
          new DataView(buf).setBigInt64(0, 42n, true);
          w.write(new Uint8Array(buf));

          // String group (1 row: "hello")
          w.writeVarint(5);
          w.write(new Uint8Array([0x68, 0x65, 0x6c, 0x6c, 0x6f]));
        },
      });

      const result = decodeNativeBlock(data, 0, { clientVersion: 54454 });
      assert.strictEqual(result.rowCount, 3);

      const col = result.columnData[0];
      // Row 0: Int64 value 42
      assert.strictEqual(col.get(0), 42n);
      // Row 1: String value "hello"
      assert.strictEqual(col.get(1), "hello");
      // Row 2: NULL
      assert.strictEqual(col.get(2), null);
    });

    it("throws on unknown version", () => {
      const data = buildDynamicBlockRaw(99n, 5);

      assert.throws(
        () => decodeNativeBlock(data, 0, { clientVersion: 54454 }),
        /Dynamic: unsupported version V99/,
      );
    });
  });

  describe("JSON codec", () => {
    it("decodes V3 format successfully", () => {
      const data = buildJSONBlock(JSONFormat.VERSION_V3, 5);
      const result = decodeNativeBlock(data, 0, { clientVersion: 54454 });

      assert.strictEqual(result.rowCount, 5);
      assert.strictEqual(result.columns[0].type, "JSON");
    });

    it("decodes V2 JSON with shared data", () => {
      // Build a V2 JSON block: 1 typed path (UInt32), 0 dynamic paths,
      // shared data with "name"="Alice" and "age"=30
      const data = buildTestBlock({
        colName: "j",
        colType: "JSON(typed_id UInt32)",
        rows: 1,
        prefix: (w) => {
          // JSON V2 prefix
          w.writeU64LE(JSONFormat.VERSION_V2);
          w.writeVarint(0); // 0 dynamic paths
          // Typed path prefix (UInt32 has none)
          // Map(String, String) prefix — no-op
        },
        data: (w) => {
          // Typed path column: typed_id UInt32 = 123
          w.writeU8(123);
          w.writeU8(0);
          w.writeU8(0);
          w.writeU8(0);

          // Shared data Map(String, String):
          // Stream 1: offsets — 1 row with 2 entries
          const offsetBuf = new ArrayBuffer(8);
          new DataView(offsetBuf).setBigUint64(0, 2n, true);
          w.write(new Uint8Array(offsetBuf));

          // Stream 2: keys
          w.writeVarint(4); // "name"
          w.write(new Uint8Array([0x6e, 0x61, 0x6d, 0x65]));
          w.writeVarint(3); // "age"
          w.write(new Uint8Array([0x61, 0x67, 0x65]));

          // Stream 3: values (binary-encoded)
          // "name" = String "Alice": type=0x15, varint(5), "Alice"
          const nameVal = new Uint8Array([0x15, 0x05, 0x41, 0x6c, 0x69, 0x63, 0x65]);
          w.writeVarint(nameVal.length);
          w.write(nameVal);
          // "age" = Int64 30: type=0x0A, 30 as i64 LE
          const ageVal = new Uint8Array([0x0a, 0x1e, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
          w.writeVarint(ageVal.length);
          w.write(ageVal);
        },
      });

      const result = decodeNativeBlock(data, 0, { clientVersion: 54454 });
      assert.strictEqual(result.rowCount, 1);

      const col = result.columnData[0];
      const row = col.get(0) as Record<string, unknown>;
      assert.strictEqual(row.typed_id, 123);
      assert.strictEqual(row.name, "Alice");
      assert.strictEqual(row.age, 30n);
    });

    it("decodes V1 JSON (version=0) with max_dynamic_paths field", () => {
      const data = buildTestBlock({
        colName: "j",
        colType: "JSON",
        rows: 1,
        prefix: (w) => {
          w.writeU64LE(JSONFormat.VERSION_V1); // version=0
          w.writeVarint(5); // max_dynamic_paths (V1 only, skipped)
          w.writeVarint(0); // 0 dynamic paths
        },
        data: (w) => {
          // Shared data: empty map (0 entries)
          const offsetBuf = new ArrayBuffer(8);
          new DataView(offsetBuf).setBigUint64(0, 0n, true);
          w.write(new Uint8Array(offsetBuf));
        },
      });

      const result = decodeNativeBlock(data, 0, { clientVersion: 54454 });
      assert.strictEqual(result.rowCount, 1);
      const row = result.columnData[0].get(0) as Record<string, unknown>;
      assert.deepStrictEqual(row, {});
    });

    it("throws on unknown version", () => {
      const data = buildJSONBlock(42n, 5);

      assert.throws(
        () => decodeNativeBlock(data, 0, { clientVersion: 54454 }),
        /JSON: only V3 supported, got V42/,
      );
    });
  });
});
