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

    it("throws on V1 format (not yet implemented)", () => {
      const data = buildJSONBlock(0n, 5);

      assert.throws(
        () => decodeNativeBlock(data, 0, { clientVersion: 54454 }),
        /JSON: only V3 supported, got V0/,
      );
    });

    it("throws on V2 format (not yet implemented)", () => {
      const data = buildJSONBlock(2n, 5);

      assert.throws(
        () => decodeNativeBlock(data, 0, { clientVersion: 54454 }),
        /JSON: only V3 supported, got V2/,
      );
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
