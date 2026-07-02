/**
 * The codec cache must not hand out shared stateful codec instances.
 * Dynamic/JSON codecs accumulate per-block prefix state, so any composite
 * type containing them must bypass the cache — otherwise two elements of
 * the same type string share one instance and clobber each other's state.
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
  encCodec.writePrefix?.(writer, col);
  writer.write(encCodec.encode(col));

  const decCodec = getCodec(type);
  const reader = new BufferReader(writer.finish());
  decCodec.readPrefix?.(reader);
  const decoded = decCodec.decode(reader, values.length, defaultDeserializerState());
  return Array.from(decoded);
}

describe("codec cache and stateful codecs", () => {
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

  it("decodes consecutive blocks with different dynamic paths through one JSON codec", () => {
    const codec = getCodec("JSON");
    // First block establishes dynamic path "a"; the second has only "b".
    // A stale "a" entry in the codec's per-block state must not leak into
    // the second decode.
    const encodeBlock = (values: unknown[]) => {
      const col = codec.fromValues(values);
      const writer = new BufferWriter(256);
      codec.writePrefix?.(writer, col);
      writer.write(codec.encode(col));
      return writer.finish();
    };
    const decodeBlock = (bytes: Uint8Array, rows: number) => {
      const reader = new BufferReader(bytes);
      codec.readPrefix?.(reader);
      return Array.from(codec.decode(reader, rows, defaultDeserializerState()));
    };
    assert.deepStrictEqual(decodeBlock(encodeBlock([{ a: 1n }]), 1), [{ a: 1n }]);
    assert.deepStrictEqual(decodeBlock(encodeBlock([{ b: "x" }]), 1), [{ b: "x" }]);
  });

  it("round-trips Array(JSON) with dynamic paths", () => {
    const values = [[{ p: 1n }, { q: "x" }]];
    const decoded = roundTrip("Array(JSON)", values);
    assert.deepStrictEqual(decoded, values);
  });
});
