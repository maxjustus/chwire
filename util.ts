/**
 * A single-consumer async generator that can also be awaited to collect items.
 * - `for await (const p of gen)` iterates items one at a time
 * - `await gen` collects all items into an array
 * - once consumed, reusing the same generator yields no further items
 */
export type CollectableAsyncGenerator<T> = AsyncGenerator<T, void, unknown> & PromiseLike<T[]>;

/** Copy bytes between arbitrary ArrayBufferViews, preserving the target view type. */
export function copyBytes<TTarget extends ArrayBufferView, TSource extends ArrayBufferView>(
  target: TTarget,
  source: TSource,
  targetByteOffset = 0,
  sourceByteLength = source.byteLength,
): TTarget {
  const available = target.byteLength - targetByteOffset;
  if (targetByteOffset < 0 || available < 0) {
    throw new RangeError(`Invalid target byte offset: ${targetByteOffset}`);
  }
  const byteLength = Math.min(source.byteLength, sourceByteLength, available);
  if (byteLength <= 0) return target;
  const dst = new Uint8Array(target.buffer, target.byteOffset + targetByteOffset, byteLength);
  const src = new Uint8Array(source.buffer, source.byteOffset, byteLength);
  dst.set(src);
  return target;
}

/** Wrap an async generator so `await gen` collects all yielded items. */
export function collectable<T>(
  gen: AsyncGenerator<T, void, unknown>,
): CollectableAsyncGenerator<T> {
  const collect = () => Array.fromAsync(gen);

  return {
    [Symbol.asyncIterator]() {
      return gen;
    },
    [Symbol.asyncDispose]: async () => {
      await gen.return(undefined as undefined);
    },
    next: () => gen.next(),
    return: (v?: undefined) => gen.return(v as undefined),
    throw: (e: unknown) => gen.throw(e),
    // biome-ignore lint/suspicious/noThenProperty: intentional PromiseLike compatibility
    then<TResult1 = T[], TResult2 = never>(
      resolve?: ((value: T[]) => TResult1 | PromiseLike<TResult1>) | null,
      reject?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ): Promise<TResult1 | TResult2> {
      return collect().then(resolve, reject);
    },
  } as CollectableAsyncGenerator<T>;
}
