/**
 * A single Dynamic/JSON codec instance must be safe to reuse: across
 * sequential blocks, and across sibling uses within one block — the layout
 * composite codecs produce (all children's prefixes, then all children's
 * data). Sibling reuse is what a universal codec cache hands out for
 * duplicate type strings, e.g. Tuple(Dynamic, Dynamic).
 *
 * Tests marked todo pin behavior that lands with the stateless-codec
 * refactor (prefix state threaded through DeserializerState).
 */

import assert from "node:assert";
import { describe, it } from "node:test";
import { defaultDeserializerState } from "../../native/codecs/base.ts";
import { createCodec } from "../../native/codecs.ts";
import { BufferReader, BufferWriter } from "../../native/io.ts";

/** Encode one block (prefix + data) with a fresh codec, as getCodec-bypass does today. */
function encodeBlock(type: string, values: unknown[]): Uint8Array {
  const codec = createCodec(type);
  const col = codec.fromValues(values);
  const writer = new BufferWriter(1024);
  codec.writePrefix(writer, col);
  writer.write(codec.encode(col));
  return writer.finish();
}

describe("shared codec instance reuse", () => {
  it("one Dynamic instance decodes consecutive blocks with different type sets", () => {
    const shared = createCodec("Dynamic");
    const decodeBlock = (bytes: Uint8Array, rows: number) => {
      const reader = new BufferReader(bytes);
      const state = defaultDeserializerState();
      shared.readPrefix(reader, state);
      return Array.from(shared.decode(reader, rows, state));
    };
    assert.deepStrictEqual(decodeBlock(encodeBlock("Dynamic", [1n, 2n]), 2), [1n, 2n]);
    assert.deepStrictEqual(decodeBlock(encodeBlock("Dynamic", ["x", 3.5]), 2), ["x", 3.5]);
  });

  it("one Array(Dynamic) instance decodes consecutive blocks with different type sets", () => {
    const shared = createCodec("Array(Dynamic)");
    const decodeBlock = (bytes: Uint8Array, rows: number) => {
      const reader = new BufferReader(bytes);
      const state = defaultDeserializerState();
      shared.readPrefix(reader, state);
      return Array.from(shared.decode(reader, rows, state));
    };
    assert.deepStrictEqual(decodeBlock(encodeBlock("Array(Dynamic)", [[1n, 2n]]), 1), [[1n, 2n]]);
    assert.deepStrictEqual(decodeBlock(encodeBlock("Array(Dynamic)", [["x"]]), 1), [["x"]]);
  });

  it("one JSON instance decodes consecutive blocks with different path sets", () => {
    const shared = createCodec("JSON");
    const decodeBlock = (bytes: Uint8Array, rows: number) => {
      const reader = new BufferReader(bytes);
      const state = defaultDeserializerState();
      shared.readPrefix(reader, state);
      return Array.from(shared.decode(reader, rows, state));
    };
    assert.deepStrictEqual(decodeBlock(encodeBlock("JSON", [{ a: 1n }]), 1), [{ a: 1n }]);
    assert.deepStrictEqual(decodeBlock(encodeBlock("JSON", [{ b: "x" }]), 1), [{ b: "x" }]);
  });

  it("one Dynamic instance encodes two sibling columns in composite layout", () => {
    // Composite writePrefix runs for every child before any child's encode.
    const shared = createCodec("Dynamic");
    const colA = shared.fromValues([1n, 2n]);
    const colB = shared.fromValues(["x", "y"]);
    const writer = new BufferWriter(1024);
    shared.writePrefix(writer, colA);
    shared.writePrefix(writer, colB);
    writer.write(shared.encode(colA));
    writer.write(shared.encode(colB));

    const reader = new BufferReader(writer.finish());
    const decA = createCodec("Dynamic");
    const decB = createCodec("Dynamic");
    const stateA = defaultDeserializerState();
    const stateB = defaultDeserializerState();
    decA.readPrefix(reader, stateA);
    decB.readPrefix(reader, stateB);
    assert.deepStrictEqual(Array.from(decA.decode(reader, 2, stateA)), [1n, 2n]);
    assert.deepStrictEqual(Array.from(decB.decode(reader, 2, stateB)), ["x", "y"]);
  });

  it("one Dynamic instance decodes two sibling columns in composite layout", () => {
    // Wire layout a composite produces: prefixA, prefixB, dataA, dataB.
    const encA = createCodec("Dynamic");
    const encB = createCodec("Dynamic");
    const colA = encA.fromValues([1n, 2n]);
    const colB = encB.fromValues(["x", "y"]);
    const writer = new BufferWriter(1024);
    encA.writePrefix(writer, colA);
    encB.writePrefix(writer, colB);
    writer.write(encA.encode(colA));
    writer.write(encB.encode(colB));

    const shared = createCodec("Dynamic");
    const reader = new BufferReader(writer.finish());
    const stateA = defaultDeserializerState();
    const stateB = defaultDeserializerState();
    shared.readPrefix(reader, stateA);
    shared.readPrefix(reader, stateB);
    assert.deepStrictEqual(Array.from(shared.decode(reader, 2, stateA)), [1n, 2n]);
    assert.deepStrictEqual(Array.from(shared.decode(reader, 2, stateB)), ["x", "y"]);
  });

  it("one JSON instance decodes two sibling columns in composite layout", () => {
    const encA = createCodec("JSON");
    const encB = createCodec("JSON");
    const colA = encA.fromValues([{ a: 1n }]);
    const colB = encB.fromValues([{ b: "x" }]);
    const writer = new BufferWriter(1024);
    encA.writePrefix(writer, colA);
    encB.writePrefix(writer, colB);
    writer.write(encA.encode(colA));
    writer.write(encB.encode(colB));

    const shared = createCodec("JSON");
    const reader = new BufferReader(writer.finish());
    const stateA = defaultDeserializerState();
    const stateB = defaultDeserializerState();
    shared.readPrefix(reader, stateA);
    shared.readPrefix(reader, stateB);
    assert.deepStrictEqual(Array.from(shared.decode(reader, 1, stateA)), [{ a: 1n }]);
    assert.deepStrictEqual(Array.from(shared.decode(reader, 1, stateB)), [{ b: "x" }]);
  });
});

describe("readKinds is independent of prior prefix reads", () => {
  it("Dynamic readKinds consumes exactly one byte after a prefix populated two types", () => {
    const codec = createCodec("Dynamic");
    const prefixed = encodeBlock("Dynamic", [1n, "s"]);
    codec.readPrefix(new BufferReader(prefixed), defaultDeserializerState());

    // Dynamic children depend on prefix content, so they are not part of
    // the static kinds tree; the server emits a single kind byte.
    const reader = new BufferReader(new Uint8Array([0]));
    codec.readKinds(reader);
    assert.strictEqual(reader.offset, 1);
  });

  it("JSON readKinds consumes self + typed-path bytes after a prefix populated dynamic paths", () => {
    const codec = createCodec("JSON(t UInt32)");
    const encCodec = createCodec("JSON(t UInt32)");
    const col = encCodec.fromValues([{ t: 1, a: 1n, b: "x" }]);
    const writer = new BufferWriter(1024);
    encCodec.writePrefix(writer, col);
    codec.readPrefix(new BufferReader(writer.finish()), defaultDeserializerState());

    // Kinds tree covers self + typed paths only; dynamic paths depend on
    // prefix content the kinds pass has not seen yet.
    const reader = new BufferReader(new Uint8Array([0, 0]));
    codec.readKinds(reader);
    assert.strictEqual(reader.offset, 2);
  });
});
