import assert from "node:assert";
import { describe, it } from "node:test";
import { BlockBuffer } from "../../native/io.ts";

function bytes(...vals: number[]): Uint8Array {
  return new Uint8Array(vals);
}

function byteValue(n: number): number {
  return n % 256;
}

describe("BlockBuffer", () => {
  it("frames blocks across chunk boundaries with consume", () => {
    const buf = new BlockBuffer(4);
    buf.append(bytes(1, 2, 3));
    buf.append(bytes(4, 5, 6, 7, 8));

    assert.strictEqual(buf.available, 8);
    assert.deepStrictEqual([...buf.view.subarray(0, 4)], [1, 2, 3, 4]);
    buf.consume(4);

    assert.strictEqual(buf.available, 4);
    assert.deepStrictEqual([...buf.view], [5, 6, 7, 8]);
    buf.consume(4);
    assert.strictEqual(buf.available, 0);
  });

  it("survives many consumes through compaction", () => {
    const buf = new BlockBuffer(16);
    let next = 0;
    let expected = 0;
    for (let round = 0; round < 1000; round++) {
      const chunk = new Uint8Array(7);
      for (let i = 0; i < chunk.length; i++) {
        chunk[i] = byteValue(next);
        next++;
      }
      buf.append(chunk);
      while (buf.available >= 5) {
        for (const actual of buf.view.subarray(0, 5)) {
          const expectedByte = byteValue(expected);
          assert.strictEqual(actual, expectedByte);
          expected++;
        }
        buf.consume(5);
      }
    }
  });

  it("startNextBlock keeps previously taken views intact", () => {
    const buf = new BlockBuffer(8);
    buf.append(bytes(10, 11, 12, 13, 20, 21));

    const block1 = buf.view.subarray(0, 4);
    buf.startNextBlock(4);

    // Later appends and consumes must not mutate the escaped view.
    buf.append(new Uint8Array(64).fill(99));
    buf.startNextBlock(buf.available);
    assert.deepStrictEqual([...block1], [10, 11, 12, 13]);
  });

  it("startNextBlock after consume accounts for the read offset", () => {
    const buf = new BlockBuffer(4);
    buf.append(bytes(1, 2, 3, 4, 5, 6));
    buf.consume(2);
    buf.startNextBlock(2);
    assert.deepStrictEqual([...buf.view], [5, 6]);
  });

  it("rejects out-of-range consume lengths", () => {
    const buf = new BlockBuffer(4);
    buf.append(bytes(1, 2));
    assert.throws(() => buf.consume(3), RangeError);
    assert.throws(() => buf.consume(-1), RangeError);
    assert.throws(() => buf.startNextBlock(3), RangeError);
  });
});
