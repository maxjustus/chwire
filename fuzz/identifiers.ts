/**
 * Adversarial identifier pool for fuzz-generated names (columns, Tuple
 * elements, JSON paths). The polite `c0`/`tp_3` names the harness used to
 * generate can never collide with keyword handling, quoting/escaping, or
 * exact-match filters, so bugs in those seams (the JSON SKIP filter matching
 * `skipped`, backtick escaping in type headers) stayed invisible. Every entry
 * was verified accepted by ClickHouse CREATE TABLE (26.4) as a column name,
 * Tuple element name, and JSON path segment when backtick-quoted.
 */

import type { Rng } from "../native/codecs/base.ts";

export const POISON_NAMES: readonly string[] = [
  "skip",
  "skipped",
  "SKIP",
  "SKIP REGEXP",
  "dotted.path",
  "dotted.path.deep",
  "back`tick",
  "back\\slash",
  "sp ace",
  "with'quote",
  'with"quote',
  "日本語",
  "🦆",
  "select",
  "format",
  "1digit",
];

/** Names ClickHouse accepts bare in DDL: identifier chars and not a keyword risk. */
const SAFE_BARE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

/** Words that are identifier-shaped but keywords/directives in some positions. */
const KEYWORDISH = new Set(["skip", "select", "format", "regexp"]);

/** Backtick-quote a name using ClickHouse's canonical backslash escaping. */
export function quoteIdent(name: string): string {
  return `\`${name.replace(/\\/g, "\\\\").replace(/`/g, "\\`")}\``;
}

/** Render a single identifier for DDL/SQL, quoting unless it is safely bare. */
export function renderIdent(name: string): string {
  return SAFE_BARE.test(name) && !KEYWORDISH.has(name.toLowerCase()) ? name : quoteIdent(name);
}

/** Render a dotted JSON path, quoting each segment as needed (dots ARE nesting). */
export function renderJsonPath(path: string): string {
  return path.split(".").map(renderIdent).join(".");
}

/** Whether two JSON paths collide: equal, or one is a dotted prefix of the other. */
export function pathsConflict(a: string, b: string): boolean {
  return a === b || a.startsWith(`${b}.`) || b.startsWith(`${a}.`);
}

/**
 * 1-in-4, draw a poison name that does not conflict with `used`; otherwise (or
 * when every candidate conflicts) return `fallback`. The chosen name is NOT
 * added to `used` — the caller records it, since it also tracks its own
 * fallback names.
 */
export function maybePoisonName(rng: Rng, fallback: string, used: readonly string[]): string {
  if (rng.int(0, 3) !== 0) return fallback;
  const candidate = POISON_NAMES[rng.int(0, POISON_NAMES.length - 1)]!;
  return used.some((u) => pathsConflict(u, candidate)) ? fallback : candidate;
}
