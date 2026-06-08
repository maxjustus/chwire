/**
 * Curated type-corpus round-trip test.
 *
 * The random fuzz (fuzz/generated.ts) draws a new type per iteration, so a short
 * run only exercises whatever shapes the dice land on. This test pins a fixed,
 * hand-curated set of marquee scalar/composite types (fuzz/type-corpus.ts) and
 * round-trips EVERY one through ClickHouse on every run — the AFL seed-corpus
 * idea: guarantee the tricky shapes (each Decimal byte-width seam, every wrapper
 * combination, deep nesting, geo/Nested sugar) are covered deterministically
 * instead of by chance.
 *
 * Each type is run through the same oracle the random fuzz uses
 * (fuzz/round-trip.ts): generate rows with the column codec, INSERT, SELECT
 * FORMAT Native, and assert codec.compare() against CH's re-serialized rows.
 * Failures are collected across the whole corpus so one run names every broken
 * type, not just the first. Row count is FUZZ_CORPUS_ROWS (default 256).
 */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { init, query } from "../client.ts";
import type { Compression } from "../fuzz/config.ts";
import { makeRng } from "../fuzz/rng.ts";
import { type Conn, consume, roundTripCells } from "../fuzz/round-trip.ts";
import { TYPE_CORPUS } from "../fuzz/type-corpus.ts";
import type { GenContext, Rng } from "../native/codecs/base.ts";
import { getCodec } from "../native/index.ts";
import { startClickHouse, stopClickHouse } from "./setup.ts";

const ROWS = Number(process.env.FUZZ_CORPUS_ROWS ?? 256);

/**
 * Generation depth/budget for corpus cells. The deepest corpus type nests ~4
 * levels, so 14 leaves ample headroom; the element budget bounds container sizes
 * so a single cell cannot explode. (The random fuzz uses the same bounds.)
 */
const GEN_DEPTH = 14;
const ELEMENT_BUDGET = 256;

/**
 * Minimal generation context for scalar/composite cells. The corpus contains no
 * Dynamic leaves, so pickDynamicType is never reached; it throws to make a
 * regression (a Dynamic creeping into the corpus) loud instead of silent.
 */
function makeContext(rng: Rng, depth: number, budget = { remaining: ELEMENT_BUDGET }): GenContext {
  return {
    rng,
    depth,
    budget,
    descend: () => makeContext(rng, Math.max(0, depth - 1), budget),
    pickDynamicType: () => {
      throw new Error("corpus types contain no Dynamic leaf");
    },
  };
}

/** Stable per-type seed (FNV-1a) so a failing corpus type replays identically. */
function seedForType(type: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < type.length; i++) {
    h ^= type.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

describe("type corpus round-trips", { timeout: 600000 }, () => {
  let conn: Conn;
  const sid = "type-corpus";

  before(async () => {
    await init();
    const ch = await startClickHouse();
    conn = { baseUrl: `${ch.url}/`, auth: { username: ch.username, password: ch.password } };
  });

  after(async () => {
    await stopClickHouse();
  });

  // One compression suffices: the corpus targets type coverage, and the random
  // fuzz already exercises the codec across none/lz4/zstd.
  const compression: Compression = "lz4";

  it(`round-trips all ${TYPE_CORPUS.length} curated types`, async () => {
    const failures: { type: string; error: string }[] = [];

    for (const type of TYPE_CORPUS) {
      const seed = seedForType(type);
      const codec = getCodec(type);
      const rng = makeRng(seed);
      const cells = Array.from({ length: ROWS }, () => codec.generate(makeContext(rng, GEN_DEPTH)));
      const suffix = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const table = `type_corpus_${suffix}`;
      const sessionId = `${sid}_${suffix}`;

      try {
        await roundTripCells({
          declaredType: codec.type,
          codec,
          cells,
          compression,
          conn,
          sessionId,
          insertSessionId: `${sessionId}_insert`,
          table,
          replayHint: `corpus type ${type}, seed=${seed}`,
        });
      } catch (err) {
        failures.push({ type, error: (err as Error).message });
      } finally {
        await consume(
          query(`DROP TABLE IF EXISTS ${table} SYNC`, sessionId, {
            baseUrl: conn.baseUrl,
            auth: conn.auth,
            compression: false,
          }),
        );
      }
    }

    if (failures.length > 0) {
      const detail = failures.map((f) => `  ${f.type}: ${f.error}`).join("\n");
      assert.fail(`${failures.length}/${TYPE_CORPUS.length} corpus types failed:\n${detail}`);
    }
  });
});
