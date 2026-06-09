/** Small shared helpers for the fuzz harness. */

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
