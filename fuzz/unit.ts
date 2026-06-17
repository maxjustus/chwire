/**
 * Unit fuzz tests for Native format encoder/decoder.
 *
 * Scope is limited to behavior that the integration fuzzers (fuzz/http.ts,
 * fuzz/tcp.ts) cannot reach via ClickHouse's generateRandom + cityHash64:
 *   - Stream decoding across arbitrary block boundaries (buffer refill paths).
 *   - Empty and single-row batches.
 *   - JSON with typed paths (generateRandomStructure does not emit JSON).
 *
 * Anything covered by generateRandomStructure (scalars, Nullable, Array, Tuple,
 * Map, LowCardinality, etc.) lives in fuzz/http.ts and fuzz/tcp.ts.
 */

import assert from "node:assert";
import { describe, it } from "node:test";
import {
  batchFromRows,
  type ColumnDef,
  encodeNative,
  streamDecodeNative,
} from "../native/index.ts";
import { decodeBatch, toArrayRows } from "../test/test_utils.ts";
import { config, logConfig, getIterationIndex } from "./config.ts";
import { randomInt } from "./util.ts";

logConfig("unit");

function encodeRows(columns: ColumnDef[], rows: unknown[][]): Uint8Array {
  return encodeNative(batchFromRows(columns, rows));
}

const randomString = (maxLen = 100) => {
  const len = randomInt(0, maxLen);
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 \t\n!@#$%^&*()";
  return Array.from({ length: len }, () => chars[randomInt(0, chars.length - 1)]).join("");
};

const randomBigInt64 = () => {
  const max = (1n << 63n) - 1n;
  const min = -(1n << 63n);
  const range = max - min;
  return min + BigInt(Math.floor(Math.random() * Number(range)));
};

describe("Native Unit Fuzz Tests", { timeout: 60000 }, () => {
  // Stream decode with arbitrary block boundaries — server-driven block sizes
  // can't reproduce the buffer-refill paths this exercises.
  it("fuzz stream decode with random chunking", async () => {
    const types: ColumnDef[] = [
      { name: "a", type: "Int32" },
      { name: "b", type: "Int64" },
      { name: "c", type: "UInt16" },
    ];
    const gens: Array<() => unknown> = [
      () => randomInt(-2147483648, 2147483647),
      () => randomBigInt64(),
      () => randomInt(0, 65535),
    ];

    const iterationIndex = getIterationIndex();
    const streamIterations = Math.ceil(config.iterations / 2);
    const iterations = iterationIndex !== null ? 1 : streamIterations;
    const startIdx = iterationIndex ?? 0;

    for (let iter = startIdx; iter < startIdx + iterations; iter++) {
      if (iter >= streamIterations) continue;

      const rowCount = randomInt(10, 100);
      const rows: unknown[][] = [];
      for (let i = 0; i < rowCount; i++) {
        rows.push(gens.map((g) => g()));
      }

      const blockSize = randomInt(5, 20);
      const blocks: Uint8Array[] = [];
      for (let i = 0; i < rows.length; i += blockSize) {
        blocks.push(encodeRows(types, rows.slice(i, i + blockSize)));
      }

      async function* toAsync(arr: Uint8Array[]): AsyncIterable<Uint8Array> {
        for (const item of arr) yield item;
      }

      const decodedRows: unknown[][] = [];
      let decodedColumns: ColumnDef[] = [];
      for await (const result of streamDecodeNative(toAsync(blocks))) {
        decodedColumns = result.columns;
        decodedRows.push(...toArrayRows(result));
      }

      assert.deepStrictEqual(decodedColumns, types);
      assert.deepStrictEqual(decodedRows, rows);
    }
  });

  // 0-row and 1-row batches don't naturally arise from server-side fuzzing.
  it("fuzz empty and single-row edge cases", async () => {
    const types: ColumnDef[] = [
      { name: "i", type: "Int64" },
      { name: "s", type: "String" },
    ];

    const iterationIndex = getIterationIndex();
    const iterations = iterationIndex !== null ? 1 : config.iterations;
    const startIdx = iterationIndex ?? 0;

    for (let iter = startIdx; iter < startIdx + iterations; iter++) {
      {
        const encoded = encodeRows(types, []);
        const decoded = decodeBatch(encoded);
        assert.deepStrictEqual(decoded.columns, types);
        assert.strictEqual(decoded.rowCount, 0);
      }

      {
        const row: unknown[] = [randomBigInt64(), randomString(20)];
        const encoded = encodeRows(types, [row]);
        const decoded = decodeBatch(encoded);
        assert.deepStrictEqual(decoded.columns, types);
        assert.deepStrictEqual(toArrayRows(decoded), [row]);
      }
    }
  });

  // JSON has special decode semantics (null → undefined, number → bigint coercion)
  // and generateRandomStructure does not emit JSON typed paths.
  it("fuzz JSON with typed paths", async () => {
    const iterationIndex = getIterationIndex();
    const iterations = iterationIndex !== null ? 1 : config.iterations;
    const startIdx = iterationIndex ?? 0;

    const randomFloat = () => (Math.random() - 0.5) * 1e10;

    const typedPathTypes = [
      { type: "String", gen: () => randomString(20), nullable: false },
      { type: "Int64", gen: () => randomBigInt64(), nullable: false },
      { type: "Int32", gen: () => randomInt(-2147483648, 2147483647), nullable: false },
      { type: "Float64", gen: randomFloat, nullable: false },
      {
        type: "LowCardinality(String)",
        gen: () => ["active", "inactive", "pending"][randomInt(0, 2)],
        nullable: false,
      },
      {
        type: "Array(String)",
        gen: () => Array.from({ length: randomInt(0, 5) }, () => randomString(10)),
        nullable: false,
      },
      {
        type: "Nullable(String)",
        gen: () => (Math.random() < 0.3 ? null : randomString(15)),
        nullable: true,
      },
      {
        type: "Nullable(Int64)",
        gen: () => (Math.random() < 0.3 ? null : randomBigInt64()),
        nullable: true,
      },
    ];

    for (let iter = startIdx; iter < startIdx + iterations; iter++) {
      const numTypedPaths = randomInt(1, 3);
      const selectedTypedPaths = Array.from({ length: numTypedPaths }, (_, i) => {
        const tp = typedPathTypes[randomInt(0, typedPathTypes.length - 1)];
        return { name: `typed_${i}`, ...tp };
      });

      const typeArgs = selectedTypedPaths.map((p) => `${p.name} ${p.type}`).join(", ");
      const jsonType = `JSON(${typeArgs})`;

      const rowCount = randomInt(1, 50);
      const rows: unknown[][] = [];
      for (let r = 0; r < rowCount; r++) {
        const obj: Record<string, unknown> = {};
        for (const tp of selectedTypedPaths) {
          if (tp.nullable) {
            if (Math.random() > 0.2) obj[tp.name] = tp.gen();
          } else {
            obj[tp.name] = tp.gen();
          }
        }
        const numDynamic = randomInt(0, 2);
        for (let d = 0; d < numDynamic; d++) {
          obj[`dyn_${d}`] = randomString(10);
        }
        rows.push([obj]);
      }

      const columns: ColumnDef[] = [{ name: "j", type: jsonType }];
      const encoded = encodeRows(columns, rows);
      const decoded = decodeBatch(encoded);

      assert.deepStrictEqual(decoded.columns, columns);
      assert.strictEqual(decoded.rowCount, rowCount);

      const decodedRows = toArrayRows(decoded);
      for (let r = 0; r < rowCount; r++) {
        const orig = rows[r][0] as Record<string, unknown>;
        const dec = decodedRows[r][0] as Record<string, unknown>;
        for (const key of Object.keys(orig)) {
          const origVal = orig[key];
          const decVal = dec[key];
          if (origVal === null) {
            assert.strictEqual(
              decVal,
              undefined,
              `Row ${r}, key ${key}: null should become undefined`,
            );
          } else if (Array.isArray(origVal)) {
            assert.deepStrictEqual(decVal, origVal, `Row ${r}, key ${key}: array mismatch`);
          } else if (typeof origVal === "number") {
            assert.ok(
              decVal === origVal || decVal === BigInt(Math.floor(origVal as number)),
              `Row ${r}, key ${key}: numeric mismatch ${origVal} vs ${decVal}`,
            );
          } else {
            assert.strictEqual(decVal, origVal, `Row ${r}, key ${key}: value mismatch`);
          }
        }
      }
    }
  });
});
