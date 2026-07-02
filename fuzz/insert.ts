/**
 * insert() option fuzz: random bufferSize/threshold/compression/chunking
 * combinations against a mocked fetch (no ClickHouse server).
 *
 * Property under test: insert() always terminates (every await is raced
 * against a wall-clock deadline), the decoded bytes across all flushed blocks
 * equal the input bytes exactly, no flushed block exceeds bufferSize, and no
 * block is empty (an empty block means the flush loop spun without progress).
 *
 * Reproduce a failure with FUZZ_ITERATION_INDEX=<iter> tsx --test fuzz/insert.ts —
 * every option choice is derived from the per-iteration seeded RNG.
 */

import assert from "node:assert";
import { describe, it } from "node:test";
import { insert } from "../client.ts";
import { type Compression, decodeBlock } from "../compression.ts";
import type { Rng } from "../native/codecs/base.ts";
import { config, getIterationIndex, logConfig } from "./config.ts";
import { makeRng } from "./rng.ts";

logConfig("insert");

const INSERT_TIMEOUT_MS = 10_000;

const realFetch = globalThis.fetch;

/** Mock fetch that drains the request body and captures the flushed blocks. */
function mockFetch(): { chunks: Uint8Array[] } {
  const captured = { chunks: [] as Uint8Array[] };
  globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
    const body = init?.body;
    if (body instanceof ReadableStream) {
      for await (const chunk of body as unknown as AsyncIterable<Uint8Array>) {
        captured.chunks.push(chunk);
      }
    }
    return new Response("", { status: 200 });
  }) as typeof fetch;
  return captured;
}

/** Fail if the insert neither resolves nor rejects within the deadline. */
async function withDeadline<T>(promise: Promise<T>, ctx: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${ctx}: insert() did not terminate within ${INSERT_TIMEOUT_MS}ms`)),
      INSERT_TIMEOUT_MS,
    );
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

type Chunking = "single" | "one-byte" | "random" | "empty-interleaved" | "empty-input";
const CHUNKINGS: Chunking[] = ["single", "one-byte", "random", "empty-interleaved", "empty-input"];

function buildChunks(rng: Rng, chunking: Chunking): { chunks: Uint8Array[]; total: Uint8Array } {
  // Keep one-byte chunking small: it yields one chunk per byte.
  const totalLen =
    chunking === "empty-input" ? 0 : rng.int(1, chunking === "one-byte" ? 512 : 8192);
  const total = new Uint8Array(totalLen);
  for (let i = 0; i < totalLen; i++) total[i] = rng.int(0, 255);

  const chunks: Uint8Array[] = [];
  if (chunking === "single") {
    chunks.push(total);
  } else if (chunking === "one-byte") {
    for (let i = 0; i < totalLen; i++) chunks.push(total.subarray(i, i + 1));
  } else if (chunking === "random" || chunking === "empty-interleaved") {
    let off = 0;
    while (off < totalLen) {
      if (chunking === "empty-interleaved" && rng.next() < 0.3) chunks.push(new Uint8Array(0));
      const len = rng.int(1, Math.min(totalLen - off, 1024));
      chunks.push(total.subarray(off, off + len));
      off += len;
    }
    if (chunking === "empty-interleaved") chunks.push(new Uint8Array(0));
  }
  return { chunks, total };
}

function randomOptions(rng: Rng): {
  bufferSize: number;
  threshold?: number;
  compression: Compression;
} {
  const bufferSize = [1, 2, 3, 17, 256, 4096, 1 << 20][rng.int(0, 6)]!;
  const thresholds = [undefined, -1, 0, 1, Math.ceil(bufferSize / 2), bufferSize, bufferSize * 4];
  const threshold = thresholds[rng.int(0, thresholds.length - 1)];
  const compression = ([false, "lz4", "zstd"] as const)[rng.int(0, 2)];
  return threshold === undefined
    ? { bufferSize, compression }
    : { bufferSize, threshold, compression };
}

async function* toAsync(chunks: Uint8Array[]): AsyncIterable<Uint8Array> {
  for (const chunk of chunks) yield chunk;
}

describe("Insert Option Fuzz Tests", { timeout: 120000 }, () => {
  const iterationIndex = getIterationIndex();
  const iterations = iterationIndex !== null ? 1 : config.iterations;
  const startIdx = iterationIndex ?? 0;

  it("insert terminates and round-trips bytes for random option combinations", async () => {
    try {
      for (let iter = startIdx; iter < startIdx + iterations; iter++) {
        const rng = makeRng(iter);
        // Several combos per iteration to cover the option space faster.
        for (let combo = 0; combo < 20; combo++) {
          const chunking = CHUNKINGS[rng.int(0, CHUNKINGS.length - 1)]!;
          const { chunks, total } = buildChunks(rng, chunking);
          const options = randomOptions(rng);
          const ctx =
            `iter=${iter} combo=${combo} chunking=${chunking} bytes=${total.length} ` +
            `bufferSize=${options.bufferSize} threshold=${options.threshold} ` +
            `compression=${options.compression}`;

          const captured = mockFetch();
          const input = rng.next() < 0.5 ? chunks : toAsync(chunks);
          await withDeadline(insert("INSERT INTO t FORMAT RowBinary", input, options), ctx);

          const decoded: Uint8Array[] = [];
          for (const frame of captured.chunks) {
            const block = decodeBlock(frame);
            assert.ok(block.length > 0, `${ctx}: flushed an empty block`);
            assert.ok(
              block.length <= options.bufferSize,
              `${ctx}: block of ${block.length} bytes exceeds bufferSize`,
            );
            decoded.push(block);
          }
          const roundTripped = new Uint8Array(decoded.reduce((n, b) => n + b.length, 0));
          let off = 0;
          for (const block of decoded) {
            roundTripped.set(block, off);
            off += block.length;
          }
          assert.deepStrictEqual(roundTripped, total, `${ctx}: decoded bytes differ from input`);
        }
      }
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  it("insert rejects non-positive bufferSize before opening the request", async () => {
    try {
      const captured = mockFetch();
      for (const bufferSize of [0, -1, -1024]) {
        await assert.rejects(
          withDeadline(
            insert("INSERT INTO t FORMAT RowBinary", new Uint8Array([1]), { bufferSize }),
            `bufferSize=${bufferSize}`,
          ),
          /bufferSize must be a positive integer/,
        );
      }
      assert.strictEqual(captured.chunks.length, 0);
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});
