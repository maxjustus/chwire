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
import type { Rng } from "../native/codecs/base.ts";
import { decodeBatch, toArrayRows, toAsync } from "../test/test_utils.ts";
import { config, logConfig, getIterationIndex } from "./config.ts";
import { makeRng } from "./rng.ts";
import { randomString } from "./util.ts";

logConfig("unit");

function encodeRows(columns: ColumnDef[], rows: unknown[][]): Uint8Array {
  return encodeNative(batchFromRows(columns, rows));
}

const randomBigInt64 = (rng: Rng) =>
  BigInt.asIntN(64, (BigInt(rng.int(0, 0xffffffff)) << 32n) | BigInt(rng.int(0, 0xffffffff)));

describe("Native Unit Fuzz Tests", { timeout: 60000 }, () => {
  // Stream decode with arbitrary block boundaries — server-driven block sizes
  // can't reproduce the buffer-refill paths this exercises.
  it("fuzz stream decode with random chunking", async () => {
    const types: ColumnDef[] = [
      { name: "a", type: "Int32" },
      { name: "b", type: "Int64" },
      { name: "c", type: "UInt16" },
    ];
    const gens: Array<(rng: Rng) => unknown> = [
      (rng) => rng.int(-2147483648, 2147483647),
      randomBigInt64,
      (rng) => rng.int(0, 65535),
    ];

    const iterationIndex = getIterationIndex();
    const streamIterations = Math.ceil(config.iterations / 2);
    const iterations = iterationIndex !== null ? 1 : streamIterations;
    const startIdx = iterationIndex ?? 0;

    for (let iter = startIdx; iter < startIdx + iterations; iter++) {
      if (iter >= streamIterations) continue;

      const rng = makeRng(iter);
      const rowCount = rng.int(10, 100);
      const rows: unknown[][] = [];
      for (let i = 0; i < rowCount; i++) {
        rows.push(gens.map((g) => g(rng)));
      }

      const blockSize = rng.int(5, 20);
      const blocks: Uint8Array[] = [];
      for (let i = 0; i < rows.length; i += blockSize) {
        blocks.push(encodeRows(types, rows.slice(i, i + blockSize)));
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
      const rng = makeRng(iter);
      {
        const encoded = encodeRows(types, []);
        const decoded = decodeBatch(encoded);
        assert.deepStrictEqual(decoded.columns, types);
        assert.strictEqual(decoded.rowCount, 0);
      }

      {
        const row: unknown[] = [randomBigInt64(rng), randomString(rng, 20)];
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

    const randomFloat = (rng: Rng) => (rng.next() - 0.5) * 1e10;

    const typedPathTypes = [
      { type: "String", gen: (rng: Rng) => randomString(rng, 20), nullable: false },
      { type: "Int64", gen: randomBigInt64, nullable: false },
      { type: "Int32", gen: (rng: Rng) => rng.int(-2147483648, 2147483647), nullable: false },
      { type: "Float64", gen: randomFloat, nullable: false },
      {
        type: "LowCardinality(String)",
        gen: (rng: Rng) => ["active", "inactive", "pending"][rng.int(0, 2)],
        nullable: false,
      },
      {
        type: "Array(String)",
        gen: (rng: Rng) => Array.from({ length: rng.int(0, 5) }, () => randomString(rng, 10)),
        nullable: false,
      },
      {
        type: "Nullable(String)",
        gen: (rng: Rng) => (rng.next() < 0.3 ? null : randomString(rng, 15)),
        nullable: true,
      },
      {
        type: "Nullable(Int64)",
        gen: (rng: Rng) => (rng.next() < 0.3 ? null : randomBigInt64(rng)),
        nullable: true,
      },
    ];

    for (let iter = startIdx; iter < startIdx + iterations; iter++) {
      const rng = makeRng(iter);
      const numTypedPaths = rng.int(1, 3);
      const selectedTypedPaths = Array.from({ length: numTypedPaths }, (_, i) => {
        const tp = typedPathTypes[rng.int(0, typedPathTypes.length - 1)];
        return { name: `typed_${i}`, ...tp };
      });

      const typeArgs = selectedTypedPaths.map((p) => `${p.name} ${p.type}`).join(", ");
      const jsonType = `JSON(${typeArgs})`;

      const rowCount = rng.int(1, 50);
      const rows: unknown[][] = [];
      for (let r = 0; r < rowCount; r++) {
        const obj: Record<string, unknown> = {};
        for (const tp of selectedTypedPaths) {
          if (tp.nullable) {
            if (rng.next() > 0.2) obj[tp.name] = tp.gen(rng);
          } else {
            obj[tp.name] = tp.gen(rng);
          }
        }
        const numDynamic = rng.int(0, 2);
        for (let d = 0; d < numDynamic; d++) {
          obj[`dyn_${d}`] = randomString(rng, 10);
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
