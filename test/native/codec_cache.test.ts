/**
 * Codecs are stateless, so the cache hands out one shared instance per type
 * string — including Dynamic/JSON and composites containing them. Shared
 * instances must round-trip cleanly across blocks and across sibling uses
 * with different per-block type/path sets.
 */

import assert from "node:assert";
import { describe, it } from "node:test";
import { getCodec } from "../../native/codecs.ts";
import { BufferReader, BufferWriter } from "../../native/io.ts";
import { defaultDeserializerState } from "../../native/codecs/base.ts";

function roundTrip(type: string, values: unknown[]): unknown[] {
  const encCodec = getCodec(type);
  const col = encCodec.fromValues(values);
  const writer = new BufferWriter(1024);
  encCodec.writePrefix(writer, col);
  writer.write(encCodec.encode(col));

  const decCodec = getCodec(type);
  const reader = new BufferReader(writer.finish());
  const state = defaultDeserializerState();
  decCodec.readPrefix(reader, state);
  const decoded = decCodec.decode(reader, values.length, state);
  return Array.from(decoded);
}

describe("codec cache", () => {
  it("freezes cached codecs so instance-state regressions throw instead of corrupting sharers", () => {
    const codec = getCodec("Array(Dynamic)") as unknown as Record<string, unknown>;
    assert.ok(Object.isFrozen(codec));
    assert.throws(() => {
      codec.types = ["Int64"];
    }, TypeError);
  });

  it("caches Dynamic/JSON composites as shared instances", () => {
    assert.strictEqual(getCodec("Array(Dynamic)"), getCodec("Array(Dynamic)"));
    assert.strictEqual(getCodec("JSON"), getCodec("JSON"));
    assert.strictEqual(
      getCodec("Tuple(Array(Dynamic), Array(Dynamic))"),
      getCodec("Tuple(Array(Dynamic), Array(Dynamic))"),
    );
  });

  it("round-trips Tuple(Array(Dynamic), Array(Dynamic)) with different inner types", () => {
    const values = [
      [
        [1n, 2n],
        ["x", "y"],
      ],
      [[3n], ["z"]],
    ];
    const decoded = roundTrip("Tuple(Array(Dynamic), Array(Dynamic))", values);
    assert.deepStrictEqual(decoded, values);
  });

  it("round-trips Map(String, Dynamic) after decoding a different Map(String, Dynamic)", () => {
    const first = roundTrip("Map(String, Dynamic)", [new Map([["a", 1n]])]);
    assert.deepStrictEqual(first, [new Map([["a", 1n]])]);
    const second = roundTrip("Map(String, Dynamic)", [new Map([["b", "str"]])]);
    assert.deepStrictEqual(second, [new Map([["b", "str"]])]);
  });

  it("round-trips Array(JSON) with dynamic paths", () => {
    const values = [[{ p: 1n }, { q: "x" }]];
    const decoded = roundTrip("Array(JSON)", values);
    assert.deepStrictEqual(decoded, values);
  });
});
