import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { toAsyncIterable, mapAsync, prepend, readChunks } from "../iter.ts";

async function collect<T>(gen: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const v of gen) out.push(v);
  return out;
}

describe("toAsyncIterable", () => {
  it("wraps a single non-iterable value", async () => {
    assert.deepEqual(await collect(toAsyncIterable(42)), [42]);
  });

  it("treats a string as a single value, not per-character", async () => {
    assert.deepEqual(await collect(toAsyncIterable("hello")), ["hello"]);
  });

  it("treats Uint8Array as a single value, not per-byte", async () => {
    const buf = new Uint8Array([1, 2, 3]);
    const result = await collect(toAsyncIterable(buf));
    assert.equal(result.length, 1);
    assert.deepEqual(result[0], buf);
  });

  it("iterates a sync array of 3 items", async () => {
    assert.deepEqual(await collect(toAsyncIterable([10, 20, 30])), [10, 20, 30]);
  });

  it("passes through an async generator", async () => {
    async function* gen() {
      yield 1;
      yield 2;
    }
    assert.deepEqual(await collect(toAsyncIterable(gen())), [1, 2]);
  });
});

describe("mapAsync", () => {
  it("maps values", async () => {
    async function* source() {
      yield 1;
      yield 2;
      yield 3;
    }
    assert.deepEqual(await collect(mapAsync(source(), (x) => x * 2)), [2, 4, 6]);
  });

  it("propagates thrown errors from the source", async () => {
    async function* source() {
      yield 1;
      throw new Error("boom");
    }
    await assert.rejects(() => collect(mapAsync(source(), (x) => x)), /boom/);
  });

  it("forwards early return() to the source generator", async () => {
    let finalized = false;
    async function* source() {
      try {
        yield 1;
        yield 2;
        yield 3;
      } finally {
        finalized = true;
      }
    }
    // consume only the first item then break
    for await (const _ of mapAsync(source(), (x) => x)) {
      break;
    }
    assert.equal(finalized, true, "source generator finally block must run on early exit");
  });
});

describe("prepend", () => {
  it("yields first then the rest of an async iterator", async () => {
    async function* rest() {
      yield 2;
      yield 3;
    }
    const iter = rest()[Symbol.asyncIterator]();
    assert.deepEqual(await collect(prepend(1, iter)), [1, 2, 3]);
  });

  it("works with a sync iterator as rest", async () => {
    const arr = [2, 3, 4];
    const iter = arr[Symbol.iterator]();
    assert.deepEqual(await collect(prepend(1, iter)), [1, 2, 3, 4]);
  });

  it("propagates return() to the rest iterator on early exit", async () => {
    let finalized = false;
    async function* rest() {
      try {
        yield 2;
        yield 3;
      } finally {
        finalized = true;
      }
    }
    const iter = rest()[Symbol.asyncIterator]();
    for await (const v of prepend(1, iter)) {
      if (v === 2) break; // break after first value from rest (rest has been entered)
    }
    assert.equal(finalized, true, "rest generator finally block must run on early exit");
  });
});

describe("readChunks", () => {
  function makeReader(chunks: Uint8Array[]): ReadableStreamDefaultReader<Uint8Array> {
    return new ReadableStream<Uint8Array>({
      start(controller) {
        for (const c of chunks) controller.enqueue(c);
        controller.close();
      },
    }).getReader();
  }

  it("yields all chunks until done", async () => {
    const a = new Uint8Array([1]);
    const b = new Uint8Array([2, 3]);
    const reader = makeReader([a, b]);
    assert.deepEqual(await collect(readChunks(reader)), [a, b]);
  });

  it("yields nothing for an empty stream", async () => {
    const reader = makeReader([]);
    assert.deepEqual(await collect(readChunks(reader)), []);
  });

  it("propagates reader.read() rejection", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.error(new Error("read error"));
      },
    });
    const reader = stream.getReader();
    await assert.rejects(() => collect(readChunks(reader)), /read error/);
  });

  it("does not call cancel() itself", async () => {
    const reader = makeReader([new Uint8Array([1])]);
    const origCancel = reader.cancel.bind(reader);
    let cancelCalled = false;
    reader.cancel = async (...args) => {
      cancelCalled = true;
      return origCancel(...args);
    };
    await collect(readChunks(reader));
    assert.equal(cancelCalled, false);
  });
});
