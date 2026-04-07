/**
 * A single-consumer async generator that can also be awaited to collect items.
 * - `for await (const p of gen)` iterates items one at a time
 * - `await gen` collects all items into an array
 * - once consumed, reusing the same generator yields no further items
 */
export type CollectableAsyncGenerator<T> = AsyncGenerator<T, void, unknown> & PromiseLike<T[]>;

/** Wrap an async generator so `await gen` collects all yielded items. */
export function collectable<T>(
  gen: AsyncGenerator<T, void, unknown>,
): CollectableAsyncGenerator<T> {
  const collect = async (): Promise<T[]> => {
    const items: T[] = [];
    for await (const item of gen) items.push(item);
    return items;
  };

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
