import assert from "node:assert";
import { describe, it } from "node:test";
import { BufferReader, BufferWriter } from "../../native/io.ts";

describe("BufferWriter", () => {
  it("finishCopy returns bytes independent from later writer reuse", () => {
    const writer = new BufferWriter(8);
    writer.writeU8(1);
    const first = writer.finishCopy();

    writer.reset();
    writer.writeU8(2);

    assert.deepStrictEqual([...first], [1]);
  });
});

describe("BufferReader", () => {
  it("keeps normal typed-array reads zero-copy", () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const reader = new BufferReader(bytes);

    const arr = reader.readTypedArray(Uint8Array, 4);

    assert.strictEqual(arr.buffer, bytes.buffer);
    assert.deepStrictEqual([...arr], [1, 2, 3, 4]);
  });
});
