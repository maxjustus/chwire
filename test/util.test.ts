import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { collectable } from "../util.ts";

describe("collectable", () => {
  it("supports await for backward-compatible collection", async () => {
    async function* gen() {
      yield 1;
      yield 2;
      yield 3;
    }

    const result = await collectable(gen());
    assert.deepStrictEqual(result, [1, 2, 3]);
  });

  it("yields no further items after being awaited once", async () => {
    async function* gen() {
      yield "a";
      yield "b";
    }

    const packets = collectable(gen());
    const first = await packets;
    const second = await packets;

    assert.deepStrictEqual(first, ["a", "b"]);
    assert.deepStrictEqual(second, []);
  });

  it("yields no further items after being drained with for await", async () => {
    async function* gen() {
      yield 1;
      yield 2;
    }

    const packets = collectable(gen());
    const seen: number[] = [];
    for await (const item of packets) {
      seen.push(item);
    }

    const afterDrain = await packets;
    assert.deepStrictEqual(seen, [1, 2]);
    assert.deepStrictEqual(afterDrain, []);
  });
});
