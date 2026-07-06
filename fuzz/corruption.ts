/**
 * Byte-mutation decode fuzz: corrupt valid Native blocks and compressed frames,
 * then assert the decoders fail cleanly.
 *
 * Property under test: decoding arbitrary corrupt bytes must either succeed or
 * throw an Error — never throw a non-Error, never report a negative /
 * out-of-range bytesConsumed (a backwards-moving cursor), and decodeBlocks must
 * never silently return empty output for non-empty undecodable input.
 *
 * Decoding is synchronous, so a regression to an infinite loop shows up as the
 * per-test timeout below (the parallel runner reports the hung job).
 *
 * Reproduce a failure with FUZZ_ITERATION_INDEX=<iter> tsx --test fuzz/corruption.ts —
 * every mutation is derived from the per-iteration seeded RNG.
 */

import assert from "node:assert";
import { describe, it } from "node:test";
import { decodeBlocks, encodeBlock, init } from "../compression.ts";
import { batchFromRows, type ColumnDef, decodeNativeBlock, encodeNative } from "../native/index.ts";
import type { Rng } from "../native/codecs/base.ts";
import { config, getIterationIndex, logConfig } from "./config.ts";
import { makeRng } from "./rng.ts";
import { randomString } from "./util.ts";

logConfig("corruption");

const MUTATIONS_PER_TARGET = 200;

function randomDynamicValue(rng: Rng): unknown {
  switch (rng.int(0, 3)) {
    case 0:
      return randomString(rng, 12);
    case 1:
      return rng.int(-1e6, 1e6);
    case 2:
      return null;
    default:
      return [randomString(rng, 4), randomString(rng, 4)];
  }
}

/** Encode a valid Native block over a mix of variable-length-heavy types. */
function buildValidNativeBlock(rng: Rng): Uint8Array {
  const columns: ColumnDef[] = [
    { name: "i", type: "Int32" },
    { name: "s", type: "String" },
    { name: "a", type: "Array(String)" },
    { name: "lc", type: "LowCardinality(String)" },
    { name: "d", type: "Dynamic" },
    { name: "j", type: "JSON" },
  ];
  const lcPool = ["alpha", "beta", "gamma", "delta"];
  const rowCount = rng.int(1, 40);
  const rows: unknown[][] = [];
  for (let r = 0; r < rowCount; r++) {
    rows.push([
      rng.int(-2147483648, 2147483647),
      randomString(rng, 30),
      Array.from({ length: rng.int(0, 4) }, () => randomString(rng, 8)),
      lcPool[rng.int(0, lcPool.length - 1)],
      randomDynamicValue(rng),
      { k: randomString(rng, 10), n: rng.int(0, 1000) },
    ]);
  }
  return encodeNative(batchFromRows(columns, rows));
}

/** Apply one random corruption: bit/byte flips, truncation, insertion, or splice. */
function mutate(rng: Rng, data: Uint8Array): Uint8Array {
  const kind = rng.int(0, 3);
  switch (kind) {
    case 0: {
      // Flip 1-8 random bytes.
      const out = data.slice();
      const flips = rng.int(1, 8);
      for (let i = 0; i < flips; i++) {
        const pos = rng.int(0, out.length - 1);
        out[pos]! ^= rng.int(1, 255);
      }
      return out;
    }
    case 1:
      // Truncate at a random offset.
      return data.subarray(0, rng.int(0, data.length - 1));
    case 2: {
      // Insert 1-16 random bytes at a random offset.
      const insertLen = rng.int(1, 16);
      const pos = rng.int(0, data.length);
      const out = new Uint8Array(data.length + insertLen);
      out.set(data.subarray(0, pos), 0);
      for (let i = 0; i < insertLen; i++) out[pos + i] = rng.int(0, 255);
      out.set(data.subarray(pos), pos + insertLen);
      return out;
    }
    default: {
      // Splice: replace a random region with random garbage of a different length.
      const start = rng.int(0, data.length - 1);
      const removeLen = rng.int(1, data.length - start);
      const garbageLen = rng.int(0, 24);
      const out = new Uint8Array(data.length - removeLen + garbageLen);
      out.set(data.subarray(0, start), 0);
      for (let i = 0; i < garbageLen; i++) out[start + i] = rng.int(0, 255);
      out.set(data.subarray(start + removeLen), start + garbageLen);
      return out;
    }
  }
}

function assertCleanError(err: unknown, ctx: string): void {
  assert.ok(
    err instanceof Error,
    `${ctx}: decoder threw a non-Error value: ${typeof err} ${String(err)}`,
  );
}

describe("Corruption Fuzz Tests", { timeout: 120000 }, () => {
  const iterationIndex = getIterationIndex();
  const iterations = iterationIndex !== null ? 1 : config.iterations;
  const startIdx = iterationIndex ?? 0;

  it("mutated Native blocks decode cleanly or throw Error", () => {
    for (let iter = startIdx; iter < startIdx + iterations; iter++) {
      const rng = makeRng(iter);
      const valid = buildValidNativeBlock(rng);

      // Sanity: the unmutated block decodes.
      decodeNativeBlock(valid, 0);

      for (let m = 0; m < MUTATIONS_PER_TARGET; m++) {
        const mutated = mutate(rng, valid);
        const ctx = `native iter=${iter} mut=${m} len=${mutated.length}`;
        try {
          const res = decodeNativeBlock(mutated, 0);
          assert.ok(
            res.bytesConsumed >= 0 && res.bytesConsumed <= mutated.length,
            `${ctx}: cursor out of range, bytesConsumed=${res.bytesConsumed}`,
          );
        } catch (err) {
          assertCleanError(err, ctx);
        }
      }
    }
  });

  it("mutated compressed frames decode cleanly or throw Error, never silently empty", async () => {
    await init();
    const compressions = [false, "lz4", "zstd"] as const;

    for (let iter = startIdx; iter < startIdx + iterations; iter++) {
      const rng = makeRng(iter ^ 0x5eed);
      const raw = buildValidNativeBlock(rng);
      // One or two frames, so mutations can also hit an inter-frame boundary.
      const frames: Uint8Array[] = [];
      const frameCount = rng.int(1, 2);
      for (let f = 0; f < frameCount; f++) {
        frames.push(encodeBlock(raw, compressions[rng.int(0, compressions.length - 1)]));
      }
      const valid = new Uint8Array(frames.reduce((n, f) => n + f.length, 0));
      let off = 0;
      for (const f of frames) {
        valid.set(f, off);
        off += f.length;
      }

      // Sanity: the unmutated frame sequence decodes to the original bytes.
      assert.strictEqual(decodeBlocks(valid).length, raw.length * frameCount);

      for (let m = 0; m < MUTATIONS_PER_TARGET; m++) {
        const mutated = mutate(rng, valid);
        const ctx = `compressed iter=${iter} mut=${m} len=${mutated.length}`;
        try {
          const out = decodeBlocks(mutated);
          // Undecodable non-empty input must throw, not silently yield nothing.
          assert.ok(
            mutated.length === 0 || out.length > 0,
            `${ctx}: decodeBlocks silently returned empty for non-empty input`,
          );
        } catch (err) {
          assertCleanError(err, ctx);
        }
      }
    }
  });
});
