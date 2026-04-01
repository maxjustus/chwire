/**
 * Unit tests for sparse serialization decoding.
 *
 * Sparse serialization encodes columns with many default values by storing
 * only the positions of non-default values. Format:
 * - Offset stream: VarInt gaps between non-default values
 * - END_OF_GRANULE_FLAG (1n << 62n) marks last offset
 * - Value stream: Dense-encoded non-default values
 */

import assert from "node:assert";
import { describe, it } from "node:test";
import { decodeNativeBlock } from "../../native/index.ts";
import { Sparse, SerializationKind } from "../../native/constants.ts";
import { buildTestBlock } from "../test_utils.ts";

/**
 * Build a sparse-encoded Native block with UInt64 data.
 *
 * Sparse format:
 * - For each non-default: VarInt = gap (defaults before this value)
 * - After all values: VarInt with trailing defaults + END_OF_GRANULE_FLAG
 *
 * @param nonDefaults - Array of {index, value} for non-default positions
 * @param totalRows - Total row count (remaining are zeros)
 */
function buildSparseUInt64Block(
  nonDefaults: Array<{ index: number; value: bigint }>,
  totalRows: number,
): Uint8Array {
  return buildTestBlock({
    colName: "val",
    colType: "UInt64",
    rows: totalRows,
    customSerialization: (w) => w.writeU8(SerializationKind.Sparse),
    data: (w) => {
      // Sparse offset stream
      let lastIndex = -1;
      for (const { index } of nonDefaults) {
        const gap = index - lastIndex - 1;
        w.writeVarint(gap);
        lastIndex = index;
      }

      // Trailing defaults with END flag
      const trailingDefaults =
        nonDefaults.length > 0
          ? totalRows - nonDefaults[nonDefaults.length - 1].index - 1
          : totalRows;
      w.writeVarint(BigInt(trailingDefaults) | Sparse.END_OF_GRANULE_FLAG);

      // Dense-encoded values (UInt64 little-endian)
      for (const { value } of nonDefaults) {
        w.writeU64LE(value);
      }
    },
  });
}

function buildNestedSparseArrayBlock(): Uint8Array {
  return buildTestBlock({
    colName: "arr",
    colType: "Array(UInt64)",
    rows: 3,
    customSerialization: (w) => {
      w.writeU8(SerializationKind.Sparse);
      w.writeU8(SerializationKind.Sparse);
    },
    data: (w) => {
      // Row 1 is the only non-default array value.
      w.writeVarint(1);
      w.writeVarint(1n | Sparse.END_OF_GRANULE_FLAG);

      // Dense Array payload for the single non-default row: one inner value total.
      w.writeU64LE(1n);

      // Inner UInt64 payload is itself sparse with one non-default value at index 0.
      w.writeVarint(0);
      w.writeVarint(Sparse.END_OF_GRANULE_FLAG);
      w.writeU64LE(7n);
    },
  });
}

describe("sparse serialization unit tests", () => {
  it("decodes sparse column with single non-default value", () => {
    // 10 rows, only index 5 has value 42
    const data = buildSparseUInt64Block([{ index: 5, value: 42n }], 10);

    const result = decodeNativeBlock(data, 0, { clientVersion: 54454 });

    assert.strictEqual(result.rowCount, 10);
    assert.strictEqual(result.columnData.length, 1);

    const col = result.columnData[0];
    for (let i = 0; i < 10; i++) {
      if (i === 5) {
        assert.strictEqual(col.get(i), 42n, `index ${i} should be 42n`);
      } else {
        assert.strictEqual(col.get(i), 0n, `index ${i} should be 0n`);
      }
    }
  });

  it("decodes sparse column with multiple non-default values", () => {
    // 100 rows with values at indices 10, 50, 99
    const nonDefaults = [
      { index: 10, value: 100n },
      { index: 50, value: 500n },
      { index: 99, value: 999n },
    ];
    const data = buildSparseUInt64Block(nonDefaults, 100);

    const result = decodeNativeBlock(data, 0, { clientVersion: 54454 });

    assert.strictEqual(result.rowCount, 100);
    const col = result.columnData[0];

    assert.strictEqual(col.get(10), 100n);
    assert.strictEqual(col.get(50), 500n);
    assert.strictEqual(col.get(99), 999n);
    // Spot check zeros
    assert.strictEqual(col.get(0), 0n);
    assert.strictEqual(col.get(25), 0n);
    assert.strictEqual(col.get(98), 0n);
  });

  it("decodes sparse column with all default values", () => {
    // 50 rows, all zeros
    const data = buildSparseUInt64Block([], 50);

    const result = decodeNativeBlock(data, 0, { clientVersion: 54454 });

    assert.strictEqual(result.rowCount, 50);
    const col = result.columnData[0];
    for (let i = 0; i < 50; i++) {
      assert.strictEqual(col.get(i), 0n, `index ${i} should be 0n`);
    }
  });

  it("decodes sparse column with consecutive non-default values", () => {
    // 20 rows, indices 5,6,7 have values (gap=0 between them)
    const nonDefaults = [
      { index: 5, value: 1n },
      { index: 6, value: 2n },
      { index: 7, value: 3n },
    ];
    const data = buildSparseUInt64Block(nonDefaults, 20);

    const result = decodeNativeBlock(data, 0, { clientVersion: 54454 });

    assert.strictEqual(result.rowCount, 20);
    const col = result.columnData[0];

    assert.strictEqual(col.get(4), 0n);
    assert.strictEqual(col.get(5), 1n);
    assert.strictEqual(col.get(6), 2n);
    assert.strictEqual(col.get(7), 3n);
    assert.strictEqual(col.get(8), 0n);
  });

  it("decodes sparse column with value at index 0", () => {
    // 10 rows, first row has value
    const data = buildSparseUInt64Block([{ index: 0, value: 999n }], 10);

    const result = decodeNativeBlock(data, 0, { clientVersion: 54454 });

    assert.strictEqual(result.rowCount, 10);
    const col = result.columnData[0];
    assert.strictEqual(col.get(0), 999n);
    assert.strictEqual(col.get(1), 0n);
  });

  it("decodes sparse column with value at last index", () => {
    // 10 rows, last row has value
    const data = buildSparseUInt64Block([{ index: 9, value: 123n }], 10);

    const result = decodeNativeBlock(data, 0, { clientVersion: 54454 });

    assert.strictEqual(result.rowCount, 10);
    const col = result.columnData[0];
    assert.strictEqual(col.get(8), 0n);
    assert.strictEqual(col.get(9), 123n);
  });

  it("preserves nested sparse serialization when decoding sparse arrays", () => {
    const data = buildNestedSparseArrayBlock();

    const result = decodeNativeBlock(data, 0, { clientVersion: 54454 });

    assert.strictEqual(result.rowCount, 3);
    const col = result.columnData[0];
    assert.deepStrictEqual(col.get(0), []);
    assert.deepStrictEqual(col.get(1), [7n]);
    assert.deepStrictEqual(col.get(2), []);
  });
});
