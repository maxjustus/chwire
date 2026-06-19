import assert from "node:assert";
import { describe, it } from "node:test";
import { getCodec, LazyStringColumn } from "../../native/index.ts";
import { BufferReader } from "../../native/io.ts";
import { defaultDeserializerState } from "../../native/codecs/base.ts";

describe("lazy String decoding", () => {
  it("defers String materialization until access", () => {
    const codec = getCodec("String");
    const encoded = codec.encode(codec.fromValues(["alpha", "", "βeta"]));
    const col = codec.decode(
      new BufferReader(encoded, 0, { lazyStrings: true }),
      3,
      defaultDeserializerState(),
    );

    assert.ok(col instanceof LazyStringColumn);
    assert.strictEqual(col.length, 3);
    assert.strictEqual(col.get(0), "alpha");
    assert.strictEqual(col.get(1), "");
    assert.strictEqual(col.get(2), "βeta");
  });

  it("re-decodes from the borrowed wire bytes on each access by default", () => {
    const codec = getCodec("String");
    const encoded = codec.encode(codec.fromValues(["alpha"]));
    const col = codec.decode(
      new BufferReader(encoded, 0, { lazyStrings: true }),
      1,
      defaultDeserializerState(),
    ) as LazyStringColumn;

    assert.strictEqual(col.get(0), "alpha");
    col.source[col.starts[0]!] = 0x58; // overwrite 'a' with 'X' in the underlying buffer
    assert.strictEqual(col.get(0), "Xlpha"); // no cache: the mutated bytes are observed
  });

  it("caches decoded values when lazyStringMemoize is enabled", () => {
    const codec = getCodec("String");
    const encoded = codec.encode(codec.fromValues(["alpha"]));
    const col = codec.decode(
      new BufferReader(encoded, 0, { lazyStrings: true, lazyStringMemoize: true }),
      1,
      defaultDeserializerState(),
    ) as LazyStringColumn;

    assert.strictEqual(col.get(0), "alpha");
    col.source[col.starts[0]!] = 0x58; // overwrite the buffer after first read
    assert.strictEqual(col.get(0), "alpha"); // cached: later buffer mutation is ignored
  });

  it("re-encodes lazy String columns without decoding through JS strings", () => {
    const codec = getCodec("String");
    const encoded = codec.encode(codec.fromValues(["a", "two", "三"]));
    const col = codec.decode(
      new BufferReader(encoded, 0, { lazyStrings: true }),
      3,
      defaultDeserializerState(),
    );

    assert.deepStrictEqual(codec.encode(col), encoded);
  });
});
