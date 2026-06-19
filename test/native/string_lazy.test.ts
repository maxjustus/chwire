import assert from "node:assert";
import { describe, it } from "node:test";
import { getCodec, LazyStringColumn } from "../../native/index.ts";
import { BufferReader } from "../../native/io.ts";
import { defaultDeserializerState } from "../../native/codecs/base.ts";

describe("lazy String decoding", () => {
  it("defers String materialization and memoizes values", () => {
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
