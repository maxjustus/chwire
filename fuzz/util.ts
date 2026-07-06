/** Small shared helpers for the fuzz harness. */

import type { Rng } from "../native/codecs/base.ts";

/** Random element of a non-empty array. */
export const pick = <T>(rng: Rng, arr: readonly T[]): T => arr[rng.int(0, arr.length - 1)]!;

export function randomString(rng: Rng, maxLen: number): string {
  const len = rng.int(0, maxLen);
  let s = "";
  for (let i = 0; i < len; i++) {
    // Mix ASCII with the occasional multi-byte code point.
    s +=
      rng.next() < 0.9
        ? String.fromCharCode(rng.int(32, 126))
        : String.fromCodePoint(rng.int(0x80, 0x2fff));
  }
  return s;
}

/** Drain an async stream, discarding every item (DDL / DROP that returns nothing). */
export async function consume<T>(input: AsyncIterable<T>): Promise<void> {
  for await (const _ of input) {
    // discard
  }
}

/** Undo ClickHouse's TabSeparated escaping of single quotes (`\'` -> `'`). */
export function unTsvEscape(s: string): string {
  return s.replace(/\\'/g, "'");
}

/** Escape a string for use inside a single-quoted ClickHouse SQL literal (`'` -> `''`). */
export function sqlQuote(s: string): string {
  return s.replace(/'/g, "''");
}

/**
 * Unique-enough suffix for a throwaway table or session name. Includes the
 * iteration index when given so a name maps back to its iteration.
 */
export function uniqueSuffix(iter?: number): string {
  const iterPart = iter === undefined ? "" : `${iter}_`;
  return `${Date.now()}_${iterPart}${Math.random().toString(36).slice(2)}`;
}
