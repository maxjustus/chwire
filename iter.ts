/**
 * Normalize a single value, sync iterable, or async iterable into an async iterable.
 *
 * NOTE: `string` and `Uint8Array` are treated as single scalar values even though
 * both implement `Symbol.iterator`. External table data is `string | Uint8Array |
 * AsyncIterable`, so yielding them whole is the correct contract.
 */
export function toAsyncIterable<T>(input: T | Iterable<T> | AsyncIterable<T>): AsyncIterable<T> {
  if (
    typeof input === "string" ||
    input instanceof Uint8Array ||
    !(Symbol.iterator in Object(input) || Symbol.asyncIterator in Object(input))
  ) {
    return (async function* () {
      yield input as T;
    })();
  }
  if (Symbol.asyncIterator in (input as object)) {
    return input as AsyncIterable<T>;
  }
  return (async function* () {
    for (const item of input as Iterable<T>) yield item;
  })();
}

/** Lazily map an async iterable. Forwards early `return()` to the source. */
export async function* mapAsync<T, U>(
  input: AsyncIterable<T>,
  fn: (item: T) => U,
): AsyncGenerator<U> {
  const iter = input[Symbol.asyncIterator]();
  try {
    while (true) {
      const { done, value } = await iter.next();
      if (done) return;
      yield fn(value);
    }
  } finally {
    await iter.return?.();
  }
}

/**
 * Push an item to the front of an async iterator.
 * Useful when we peek the first item, do some operation on it, and then
 * iterate over the entire collection including that first item.
 */
export async function* prepend<T>(
  first: T,
  rest: AsyncIterator<T> | Iterator<T>,
): AsyncGenerator<T> {
  try {
    yield first;
    while (true) {
      const { done, value } = await Promise.resolve(rest.next());
      if (done) return;
      yield value;
    }
  } finally {
    await (rest as AsyncIterator<T>).return?.();
  }
}

/**
 * Iterate a ReadableStreamDefaultReader as chunks.
 * Does NOT cancel/release on exit — callers own the reader lifecycle.
 */
export async function* readChunks(
  reader: ReadableStreamDefaultReader<Uint8Array>,
): AsyncGenerator<Uint8Array> {
  while (true) {
    const { done, value } = await reader.read();
    if (done) return;
    yield value;
  }
}
