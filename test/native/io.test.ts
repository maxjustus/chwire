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

describe("varint bounds", () => {
  it("readVarint rejects varints wider than 32 bits", () => {
    // 6 continuation bytes: legal LEB128 length-wise for 64-bit, not for the
    // 32-bit number path.
    const reader = new BufferReader(new Uint8Array([0x80, 0x80, 0x80, 0x80, 0x80, 0x01]));
    assert.throws(() => reader.readVarint(), /VarInt/);
  });

  it("readVarint rejects a 5th byte overflowing 32 bits", () => {
    // 5th byte 0x10 puts a bit at position 32.
    const reader = new BufferReader(new Uint8Array([0x80, 0x80, 0x80, 0x80, 0x10]));
    assert.throws(() => reader.readVarint(), /VarInt/);
  });

  it("readVarint still reads values up to 2^32-1", () => {
    const reader = new BufferReader(new Uint8Array([0xff, 0xff, 0xff, 0xff, 0x0f]));
    assert.strictEqual(reader.readVarint(), 4294967295);
  });

  it("readVarInt64 rejects varints longer than 10 bytes", () => {
    const reader = new BufferReader(new Uint8Array(11).fill(0x80));
    assert.throws(() => reader.readVarInt64(), /VarInt/);
  });

  it("writeVarint throws on negative input", () => {
    const writer = new BufferWriter(16);
    assert.throws(() => writer.writeVarint(-1), /negative/);
    assert.throws(() => writer.writeVarint(-1n), /negative/);
  });
});

describe("BufferReader", () => {
  it("ensureAvailable rejects negative lengths", () => {
    const reader = new BufferReader(new Uint8Array([1, 2, 3]));
    assert.throws(() => reader.ensureAvailable(-1), /negative/i);
  });

  it("keeps normal typed-array reads zero-copy", () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const reader = new BufferReader(bytes);

    const arr = reader.readTypedArray(Uint8Array, 4);

    assert.strictEqual(arr.buffer, bytes.buffer);
    assert.deepStrictEqual([...arr], [1, 2, 3, 4]);
  });
});
