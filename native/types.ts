/**
 * Shared utilities for Native format codec.
 */

export type TypedArray =
  | Int8Array
  | Uint8Array
  | Int16Array
  | Uint16Array
  | Int32Array
  | Uint32Array
  | BigInt64Array
  | BigUint64Array
  | Float32Array
  | Float64Array;

export interface ColumnDef {
  name: string;
  type: string;
}

export interface DecodeOptions {
  /** Decode Map types as Array<[K, V]> instead of Map<K, V> to preserve duplicate keys */
  mapAsArray?: boolean;
  /** Client version or protocol revision (e.g. 54454) */
  clientVersion?: number;
  /** Decode Enum types as numeric values instead of string names (default: false = strings) */
  enumAsNumber?: boolean;
}

export interface EnumMapping {
  nameToValue: Map<string, number>;
  valueToName: Map<number, string>;
}

function isAsciiWhitespace(code: number): boolean {
  // "good enough" for type strings emitted by ClickHouse (space/newlines/tabs).
  return code === 9 || code === 10 || code === 13 || code === 32;
}

// a control character is any ASCII character with code < 0x20 or 0x7f (DEL)
function isControlASCII(code: number): boolean {
  return code < 0x20 || code === 0x7f;
}

// A "nibble" is half a byte (4 bits), represented by one hex digit (0–f).
// Converts an ASCII char code to its hex value (0–15), or -1 if not a hex char.
function hexNibble(code: number): number {
  if (code >= 48 && code <= 57) return code - 48; // '0'(48)–'9'(57) → 0–9
  if (code >= 65 && code <= 70) return code - 65 + 10; // 'A'(65)–'F'(70) → 10–15
  if (code >= 97 && code <= 102) return code - 97 + 10; // 'a'(97)–'f'(102) → 10–15
  return -1;
}

// ClickHouse backslash escape sequences (same as C-style, plus \N for empty string).
// Maps the character after '\' to the resolved value.
const SIMPLE_ESCAPES: { [k: string]: string } = {
  "'": "'",
  "\\": "\\",
  n: "\n",
  r: "\r",
  t: "\t",
  b: "\b",
  f: "\f",
  0: "\0",
  v: "\v",
  a: "\x07", // BEL
  e: "\x1b", // ESC
  N: "", // \N = empty string (ClickHouse-specific)
};

// ClickHouse preserves the literal backslash for unknown escape sequences,
// EXCEPT for quote chars (\' \" \`), path separators (\/ \= \\), and
// control characters — those drop the backslash silently.
function shouldPreserveBackslash(esc: string): boolean {
  const code = esc.charCodeAt(0);
  return (
    esc !== "\\" &&
    esc !== "'" &&
    esc !== '"' &&
    esc !== "`" &&
    esc !== "/" &&
    esc !== "=" &&
    !isControlASCII(code)
  );
}

/*
 * Parse a single-quoted string with ClickHouse escape sequences.
 * Grammar: ' <char | \<escape>>* '
 * Used for parsing enum type definition names, e.g. the 'hello' in Enum8('hello' = 1).
 * Returns [parsed_value, index_after_closing_quote] or null on malformed input.
 */
function parseQuotedString(s: string, start: number): [string, number] | null {
  if (s[start] !== "'") return null;

  let i = start + 1; // cursor — always points to the next unprocessed character
  let result = "";

  while (i < s.length) {
    const ch = s[i++]; // read and advance in one step (post-increment)

    if (ch === "'") return [result, i];

    if (ch !== "\\") {
      result += ch;
      continue;
    }

    // Backslash found — consume the next char and resolve the escape sequence.
    // Priority: \xHH hex literal → SIMPLE_ESCAPES table → unknown (preserve or drop backslash)
    if (i >= s.length) return null; // trailing backslash with no escape char
    const esc = s[i++]!; // guarded above: i < s.length

    // \xHH — two hex digits encoding a single byte (e.g. \x4A → 'J')
    if (esc === "x") {
      if (i + 1 >= s.length) return null; // need two hex digits remaining
      const hi = hexNibble(s.charCodeAt(i)); // first hex digit  → upper 4 bits of the byte
      const lo = hexNibble(s.charCodeAt(i + 1)); // second hex digit → lower 4 bits of the byte
      if (hi < 0 || lo < 0) return null; // invalid hex digit
      // Combine nibbles into a byte: e.g. hi=4, lo=10 → 0x4A → 74 → 'J'
      result += String.fromCharCode((hi << 4) | lo);
      i += 2;
      continue;
    }

    const mapped = SIMPLE_ESCAPES[esc];
    if (mapped !== undefined) {
      result += mapped;
      continue;
    }

    // Unknown escape — keep the backslash for printable non-special chars (e.g. \% → \%),
    // drop it for quotes/path chars/control chars (e.g. \' → ')
    if (shouldPreserveBackslash(esc)) result += "\\";
    result += esc;
  }

  return null;
}

/**
 * Parse a ClickHouse Enum type definition string into bidirectional name↔value maps.
 * Grammar: Enum8('name1' = val1, 'name2' = val2, ...)
 *          Enum16('name1' = val1, 'name2' = val2, ...)
 * Enum8 values are Int8 (-128..127), Enum16 values are Int16 (-32768..32767).
 * Names and values must each be unique — duplicates cause a null return.
 */
export function parseEnumDefinition(type: string): EnumMapping | null {
  const is8 = type.startsWith("Enum8(");
  const is16 = type.startsWith("Enum16(");
  if (!is8 && !is16) return null;
  if (!type.endsWith(")")) return null;

  const nameToValue = new Map<string, number>();
  const valueToName = new Map<number, string>();
  const content = type.slice(is8 ? 6 : 7, -1); // strip "Enum8(" / "Enum16(" and trailing ")"
  if (content.length === 0) return null;
  const min = is8 ? -128 : -32768; // Int8 / Int16 lower bound
  const max = is8 ? 127 : 32767; // Int8 / Int16 upper bound

  let i = 0;
  const len = content.length;
  while (i < len) {
    // Skip whitespace and commas
    while (i < len && (content[i] === "," || isAsciiWhitespace(content.charCodeAt(i)))) i++;
    if (i >= len) break;

    // Parse quoted name
    const parsed = parseQuotedString(content, i);
    if (!parsed) return null;
    const [name, nextIdx] = parsed;
    i = nextIdx;

    // Skip whitespace
    while (i < len && isAsciiWhitespace(content.charCodeAt(i))) i++;

    // Expect =
    if (content[i] !== "=") return null;
    i++;

    // Skip whitespace
    while (i < len && isAsciiWhitespace(content.charCodeAt(i))) i++;

    // Read numeric value (possibly negative)
    let sign = 1;
    if (content[i] === "-") {
      sign = -1;
      i++;
    } else if (content[i] === "+") {
      i++;
    }
    // Hand-rolled decimal integer parse — we're already positioned at the first digit,
    // so this avoids a substring allocation that parseInt would need.
    let value = 0;
    let digits = 0;
    while (i < len) {
      const code = content.charCodeAt(i);
      if (code >= 48 && code <= 57) {
        // '0'–'9'
        value = value * 10 + (code - 48);
        digits++;
        i++;
      } else {
        break;
      }
    }
    if (digits === 0) return null; // no digits found after '='
    value *= sign;
    if (value < min || value > max) return null; // out of Int8/Int16 range

    // Reject duplicate names or values — ClickHouse requires both to be unique
    if (nameToValue.has(name) || valueToName.has(value)) return null;
    nameToValue.set(name, value);
    valueToName.set(value, name);
  }

  if (nameToValue.size === 0) return null;
  return { nameToValue, valueToName };
}

export const TEXT_ENCODER = new TextEncoder();
export const TEXT_DECODER = new TextDecoder();

/** JS Date range limit: ±8.64e15 milliseconds */
const MAX_DATE_MS = 8640000000000000n;

/**
 * Wraps a ClickHouse DateTime64 value as raw ticks at a given precision.
 * Precision N means the tick unit is 10^-N seconds:
 *   0 = seconds, 3 = milliseconds, 6 = microseconds, 9 = nanoseconds.
 * JS Date only supports millisecond resolution, so sub-ms values can't round-trip
 * through Date without loss — use .ticks directly for those.
 */
export class ClickHouseDateTime64 {
  public ticks: bigint;
  public precision: number;
  // Conversion factor between this precision and milliseconds (precision 3).
  // e.g. precision=6 → pow=1000 (divide ticks by 1000 to get ms)
  //      precision=0 → pow=1000 (multiply ticks by 1000 to get ms)
  private pow: bigint;

  constructor(ticks: bigint, precision: number) {
    this.ticks = ticks;
    this.precision = precision;
    this.pow = 10n ** BigInt(Math.abs(precision - 3));
  }

  /**
   * Convert to native Date object.
   * Throws if value overflows JS Date range or precision is lost (sub-millisecond components).
   */
  toDate(): Date {
    // precision >= 3 (ms or finer): divide to get ms. precision < 3 (sec or coarser): multiply.
    const ms = this.precision >= 3 ? this.ticks / this.pow : this.ticks * this.pow;
    if (ms > MAX_DATE_MS || ms < -MAX_DATE_MS) {
      throw new RangeError(
        `DateTime64 value ${ms}ms overflows JS Date range (±8.64e15ms). Use toClosestDate() to clamp.`,
      );
    }
    if (this.precision > 3 && this.ticks % this.pow !== 0n) {
      throw new Error(
        `Precision loss: DateTime64(${this.precision}) value ${this.ticks} cannot be represented as Date without losing precision. Use toClosestDate() or access .ticks directly.`,
      );
    }
    return new Date(Number(ms));
  }

  /**
   * Convert to native Date object, truncating sub-millisecond precision and clamping to JS Date range.
   * Unlike toDate(), this never throws — useful for display/logging where lossiness is acceptable.
   */
  toClosestDate(): Date {
    let ms = this.precision >= 3 ? this.ticks / this.pow : this.ticks * this.pow;
    if (ms > MAX_DATE_MS) ms = MAX_DATE_MS;
    if (ms < -MAX_DATE_MS) ms = -MAX_DATE_MS;
    return new Date(Number(ms));
  }

  toJSON(): string {
    return this.toClosestDate().toJSON();
  }

  toString(): string {
    return this.toClosestDate().toString();
  }
}

/**
 * Explicit-typed value for a Dynamic column, e.g. `new DynamicValue("Float64", 3)`.
 * Bypasses guessType so a value is stored as a specific ClickHouse type (Int8 vs
 * Int64, Float64 vs Int64) instead of one inferred from its JS runtime form.
 */
export class DynamicValue {
  readonly type: string;
  readonly value: unknown;

  constructor(type: string, value: unknown) {
    this.type = type;
    this.value = value;
  }
}
