/**
 * Offline checks for the random type generator (fuzz/gen-type.ts). No server:
 * these assert genType's output is internally consistent with our own parser.
 * The live red/blue check (genType -> CREATE TABLE -> system.columns) runs in the
 * fuzz harness against a real ClickHouse.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { makeRng } from "../fuzz/rng.ts";
import { genType, genScalarType, genCompositeType } from "../fuzz/gen-type.ts";
import { getCodec } from "../native/index.ts";

/** Max parenthesis nesting depth of a type string. */
function parenDepth(type: string): number {
  let depth = 0;
  let max = 0;
  for (const ch of type) {
    if (ch === "(") max = Math.max(max, ++depth);
    else if (ch === ")") depth--;
  }
  return max;
}

const SEEDS = 5000;

describe("genType", () => {
  it("is deterministic for a given seed", () => {
    for (let s = 0; s < 200; s++) {
      assert.equal(genType(makeRng(s)), genType(makeRng(s)));
      assert.equal(genScalarType(makeRng(s)), genScalarType(makeRng(s)));
    }
  });

  it("emits types our parser can build", () => {
    for (let s = 0; s < SEEDS; s++) {
      const type = genType(makeRng(s));
      // createCodec throws on an unparseable type; that is the failure signal.
      const codec = getCodec(type);
      // The codec's canonical type must itself re-parse (parse is idempotent).
      getCodec(codec.type);
    }
  });

  it("emits scalar leaves with no container nesting", () => {
    for (let s = 0; s < SEEDS; s++) {
      const type = genScalarType(makeRng(s));
      getCodec(type);
      // A scalar leaf has at most one paren level (its own params, e.g.
      // Decimal(P, S)); it never wraps a container.
      assert.ok(parenDepth(type) <= 1, `scalar leaf nested too deep: ${type}`);
    }
  });

  it("respects the depth budget (paren depth <= depth + 2)", () => {
    // The budget bounds recursive container nesting (Array/Map-value/Tuple-elem).
    // A terminal LowCardinality(Nullable(FixedString(N))) tail adds up to 2 more
    // paren levels at one depth step, so the bound is depth + 2.
    for (let depth = 0; depth <= 6; depth++) {
      for (let s = 0; s < 500; s++) {
        const type = genType(makeRng(s), depth);
        assert.ok(
          parenDepth(type) <= depth + 2,
          `depth=${depth} produced paren depth ${parenDepth(type)}: ${type}`,
        );
      }
    }
  });

  it("genCompositeType always wraps", () => {
    for (let s = 0; s < SEEDS; s++) {
      const type = genCompositeType(makeRng(s));
      getCodec(type);
      assert.ok(parenDepth(type) >= 1, `composite without nesting: ${type}`);
    }
  });
});
