import { type Column, DataColumn } from "../columns.ts";
import { SerializationKind, Sparse } from "../constants.ts";
import type { BufferReader, BufferWriter, TypedArrayConstructor } from "../io.ts";
import {
  DEFAULT_DENSE_NODE,
  type DeserializerState,
  type SerializationNode,
} from "../serialization.ts";
import type { TypedArray } from "../types.ts";

/**
 * Sentinel value representing SQL NULL in toLiteral serialization.
 * Used to distinguish actual NULL from the string "NULL".
 */
export const SQL_NULL = Symbol.for("chwire.SQL_NULL");

/** Convert SQL_NULL symbol to "NULL" string for nested literals */
export function nullToLiteral(lit: string | typeof SQL_NULL): string {
  return lit === SQL_NULL ? "NULL" : lit;
}

export function wrapQuoted(s: string, quoted?: boolean): string {
  return quoted ? `'${s}'` : s;
}

/** Get a Uint8Array view over a TypedArray's underlying buffer, respecting byteOffset. */
export function asBytes(arr: ArrayBufferView): Uint8Array {
  return new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
}

export function parseTypeList(inner: string): string[] {
  const types: string[] = [];
  let depth = 0;
  let inQuote = false;
  let current = "";
  for (const char of inner) {
    // A backtick-quoted name (e.g. a JSON path `a.b`) may contain commas/parens
    // that must not be treated as list or type delimiters.
    if (char === "`") inQuote = !inQuote;
    if (!inQuote) {
      if (char === "(") depth++;
      else if (char === ")") depth--;
      else if (char === "," && depth === 0) {
        types.push(current.trim());
        current = "";
        continue;
      }
    }
    current += char;
  }
  if (current.trim()) types.push(current.trim());
  return types;
}

export function parseTupleElements(inner: string): { name: string | null; type: string }[] {
  return parseTypeList(inner).map(parseNamedElement);
}

/**
 * Split a "name Type" element into name and type. Names are either bare
 * identifiers that may contain dots (JSON nested paths like `a.b.c`) or, when the
 * name has characters ClickHouse must quote, a backtick-quoted string (`` `a.b` ``,
 * a doubled backtick escaping a literal one). A bare type with no name (a Tuple
 * element, a config param) returns name=null.
 */
function parseNamedElement(part: string): { name: string | null; type: string } {
  if (part.startsWith("`")) {
    let name = "";
    let i = 1;
    for (; i < part.length; i++) {
      if (part[i] === "`") {
        if (part[i + 1] === "`") {
          name += "`";
          i++;
          continue;
        }
        i++; // consume the closing backtick
        break;
      }
      name += part[i];
    }
    const type = part.slice(i).trim();
    return type ? { name, type } : { name: null, type: part };
  }
  const match = part.match(/^([a-z_][a-z0-9_]*(?:\.[a-z_][a-z0-9_]*)*)\s+(.+)$/i);
  if (match) return { name: match[1]!, type: match[2]! };
  return { name: null, type: part };
}

// Extracts the content between the outermost parentheses: "Array(Int32)" -> "Int32"
export function extractTypeArgs(type: string): string {
  return type.substring(type.indexOf("(") + 1, type.lastIndexOf(")"));
}

/**
 * Seedable pseudo-random number generator used by codec generators.
 *
 * The concrete implementation lives in the fuzz harness; only the type ships in
 * the package so codec `generate()` methods can be typed against it.
 */
export interface Rng {
  /** Float in [0, 1). */
  next(): number;
  /** Integer in [min, max] inclusive. */
  int(min: number, max: number): number;
}

/**
 * Context threaded through codec `generate()` calls.
 *
 * Carries the seeded RNG (for failure replay), a depth budget that bounds
 * recursive nesting, and a Dynamic/JSON type pool. `DynamicCodec` discovers its
 * types lazily from the wire and has no type universe at construction, so it
 * samples from `pickDynamicType()` rather than from local codecs.
 */
export interface GenContext {
  readonly rng: Rng;
  /** Remaining nesting budget; at 0 containers emit empty/leaf values. */
  readonly depth: number;
  /**
   * Shared per-cell element budget bounding total Array/Map elements, so large or
   * deeply nested containers cannot blow up. Decremented as lengths are chosen.
   */
  readonly budget: { remaining: number };
  /** Child context with `depth - 1` (clamped at 0). */
  descend(): GenContext;
  /** Sample a ClickHouse type string for a Dynamic/JSON value. */
  pickDynamicType(): string;
}

export interface ColumnBuilder {
  push(value: unknown): void;
  pushAll(values: ArrayLike<unknown>): void;
  finish(): Column;
}

export interface Codec {
  /** ClickHouse type string this codec handles */
  readonly type: string;
  encode(col: Column, sizeHint?: number): Uint8Array;
  decode(reader: BufferReader, rows: number, state: DeserializerState): Column;
  fromValues(values: unknown[] | TypedArray): Column;
  fromRows?(rows: readonly unknown[][], columnIndex: number): Column;
  makeBuilder?(expectedRows?: number): ColumnBuilder;
  zeroValue(): unknown;
  estimateSize(rows: number): number;
  writePrefix?(writer: BufferWriter, col: Column): void;
  readPrefix?(reader: BufferReader): void;
  readKinds(reader: BufferReader): SerializationNode;
  /**
   * Serialize a single value to ClickHouse literal string syntax.
   *
   * @param value - The value to serialize
   * @param quoted - Controls string formatting:
   *   - false (default): For HTTP query params. Control chars escaped, no quotes.
   *   - true: For nested values in Array/Tuple/Map. Fully escaped and single-quoted.
   * @returns The serialized literal string, or SQL_NULL symbol for null values
   */
  toLiteral(value: unknown, quoted?: boolean): string | typeof SQL_NULL;
  /**
   * Generate a random value in the same representation `decode()` returns.
   * Used by the client-generated CH-anchored fuzzer (`fuzz/generated.ts`).
   */
  generate(ctx: GenContext): unknown;
  /**
   * Compare a generated value `a` against the value `b` decoded after a
   * ClickHouse round-trip. Near-strict equality; overridden for cases where the
   * decoded representation is not deterministic (e.g. Map ordering).
   */
  compare(a: unknown, b: unknown): boolean;
}

/**
 * Escape control characters in a string for ClickHouse.
 * Always escapes: backslash, tab, newline, carriage return
 * Optionally escapes: single quote (for string literals)
 */
export function escapeString(s: string, escapeSingleQuote = false): string {
  let result = "";
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    switch (c) {
      case 9:
        result += "\\t";
        break;
      case 10:
        result += "\\n";
        break;
      case 13:
        result += "\\r";
        break;
      case 92:
        result += "\\\\";
        break;
      case 39:
        result += escapeSingleQuote ? "\\'" : "'";
        break;
      default:
        result += s[i];
    }
  }
  return result;
}

class ValuesColumnBuilder implements ColumnBuilder {
  private values: unknown[];
  private offset = 0;
  private codec: Pick<Codec, "fromValues">;

  constructor(codec: Pick<Codec, "fromValues">, expectedRows?: number) {
    this.codec = codec;
    this.values = expectedRows === undefined ? [] : new Array(expectedRows);
  }

  push(value: unknown): void {
    this.values[this.offset++] = value;
  }

  pushAll(values: ArrayLike<unknown>): void {
    const start = this.offset;
    this.offset += values.length;
    if (this.values.length < this.offset) this.values.length = this.offset;
    for (let i = 0; i < values.length; i++) this.values[start + i] = values[i];
  }

  finish(): Column {
    if (this.values.length !== this.offset) this.values.length = this.offset;
    return this.codec.fromValues(this.values);
  }
}

export function makeDefaultColumnBuilder(
  codec: Pick<Codec, "fromValues">,
  expectedRows?: number,
): ColumnBuilder {
  return new ValuesColumnBuilder(codec, expectedRows);
}

export function columnFromRows(
  codec: Pick<Codec, "fromValues">,
  rows: readonly unknown[][],
  columnIndex: number,
): Column {
  const values = new Array(rows.length);
  for (let i = 0; i < rows.length; i++) values[i] = rows[i]![columnIndex];
  return codec.fromValues(values);
}

export function defaultDeserializerState(): DeserializerState {
  return {
    serNode: DEFAULT_DENSE_NODE,
    sparseRuntime: new Map(),
  };
}

/**
 * Create child deserializer state for nested type at given index.
 * Falls back to dense serialization if child node doesn't exist
 * (older ClickHouse versions or incomplete tree).
 */
export function childState(state: DeserializerState, index: number): DeserializerState {
  return {
    ...state,
    serNode: state.serNode.children[index] ?? DEFAULT_DENSE_NODE,
  };
}

/**
 * Read serialization kinds for wrapper codec with 1 child.
 * Used by Array, Nullable, LowCardinality.
 */
export function readKinds1(reader: BufferReader, child: Codec): SerializationNode {
  const kind = reader.readU8();
  return { kind, children: [child.readKinds(reader)] };
}

/**
 * Read serialization kinds for wrapper codec with 2 children.
 * Used by Map (key + value).
 */
export function readKinds2(reader: BufferReader, childA: Codec, childB: Codec): SerializationNode {
  const kind = reader.readU8();
  return { kind, children: [childA.readKinds(reader), childB.readKinds(reader)] };
}

/**
 * Read serialization kinds for wrapper codec with N children.
 * Used by Tuple, Variant, Dynamic, JSON.
 */
export function readKindsMany(reader: BufferReader, children: readonly Codec[]): SerializationNode {
  const kind = reader.readU8();
  const nodes = new Array(children.length);
  for (let i = 0; i < children.length; i++) {
    nodes[i] = children[i]!.readKinds(reader);
  }
  return { kind, children: nodes };
}

/**
 * Read sparse-encoded column data and materialize to dense array.
 * Only called from BaseCodec.decode() when serNode.kind is Sparse.
 */
function readSparse(
  codec: BaseCodec,
  reader: BufferReader,
  rows: number,
  state: DeserializerState,
): Column {
  const node = state.serNode;
  const [initialTrailing, hasValueAfter] = state.sparseRuntime.get(node) || [0, false];

  let trailingDefaultCount = initialTrailing;
  let hasValueAfterTrailing = hasValueAfter;

  const indices: number[] = [];
  let totalRows = trailingDefaultCount;
  let readOffset = 0; // We don't support partial read requests yet, so readOffset is always 0
  let skippedValuesRows = 0;
  let isFirstValue = true;

  if (hasValueAfterTrailing) {
    if (trailingDefaultCount >= readOffset) {
      indices.push(trailingDefaultCount - readOffset);
      readOffset = 0;
      isFirstValue = false;
    } else {
      skippedValuesRows += 1;
      readOffset -= trailingDefaultCount + 1;
    }
    trailingDefaultCount = 0;
    totalRows += 1;
  }

  // Read offset stream: VarInts encode gaps between non-default values
  // Each VarInt = defaults before next non-default. END flag marks last entry.
  while (true) {
    let offsetValue = BigInt(reader.readVarInt64());
    const end = (offsetValue & Sparse.END_OF_GRANULE_FLAG) !== 0n;
    if (end) {
      offsetValue &= ~Sparse.END_OF_GRANULE_FLAG;
    }

    const defaultsBeforeValue = Number(offsetValue);
    const nextTotalRows = totalRows + defaultsBeforeValue;

    if (nextTotalRows >= rows) {
      trailingDefaultCount = nextTotalRows - rows;
      hasValueAfterTrailing = !end;
      break;
    }

    if (end) {
      hasValueAfterTrailing = false;
      trailingDefaultCount = defaultsBeforeValue;
      break;
    }

    const startOfGroup = !isFirstValue && indices.length > 0 ? indices[indices.length - 1]! + 1 : 0;
    if (defaultsBeforeValue >= readOffset) {
      indices.push(startOfGroup + defaultsBeforeValue - readOffset);
      readOffset = 0;
      isFirstValue = false;
    } else {
      skippedValuesRows += 1;
      readOffset -= defaultsBeforeValue + 1;
    }

    trailingDefaultCount = 0;
    totalRows = nextTotalRows + 1;
  }

  state.sparseRuntime.set(node, [trailingDefaultCount, hasValueAfterTrailing]);

  const zero = codec.zeroValue();
  const decodeFn = (r: BufferReader, n: number) => codec.decodeDense(r, n, state);

  if (skippedValuesRows > 0) {
    decodeFn(reader, skippedValuesRows);
  }

  if (indices.length === 0) {
    return codec.fromValues(new Array(rows).fill(zero));
  }

  const values = decodeFn(reader, indices.length);

  // Fast path: TypedArray-backed columns (NumericCodec, EpochCodec, BigIntCodec)
  // Avoids boxing/unboxing through get()/fromValues() by copying directly.
  if (values instanceof DataColumn && ArrayBuffer.isView(values.data)) {
    const src = values.data as TypedArray;
    const Ctor = src.constructor as TypedArrayConstructor<TypedArray>;
    const dest = new Ctor(rows);
    for (let i = 0; i < indices.length; i++) {
      const idx = indices[i]!;
      if (idx < rows) {
        dest[idx] = src[i]!;
      }
    }
    return new DataColumn(codec.type, dest);
  }

  const resultValues = new Array(rows).fill(zero);

  for (let i = 0; i < indices.length; i++) {
    const idx = indices[i]!;
    if (idx < rows) {
      resultValues[idx] = values.get(i);
    }
  }

  return codec.fromValues(resultValues);
}

/**
 * Base class for codecs that support sparse serialization.
 * Centralizes the sparse check pattern - subclasses implement decodeDense().
 */
/**
 * Structural deep-equal used by the default `compare`. Uses `Object.is` for
 * primitives (correct for NaN and -0), recurses arrays, and falls back to
 * own-enumerable-key comparison for plain objects. `Uint8Array` and `Date` are
 * compared element/time-wise.
 */
export function deepCompare(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") return false;

  if (a instanceof Uint8Array && b instanceof Uint8Array) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();

  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!deepCompare(a[i], b[i])) return false;
    return true;
  }

  const ao = a as Record<string, unknown>;
  const bo = b as Record<string, unknown>;
  const aKeys = Object.keys(ao);
  const bKeys = Object.keys(bo);
  if (aKeys.length !== bKeys.length) return false;
  for (const key of aKeys) {
    if (!Object.hasOwn(bo, key)) return false;
    if (!deepCompare(ao[key], bo[key])) return false;
  }
  return true;
}

export abstract class BaseCodec implements Codec {
  abstract readonly type: string;
  abstract encode(col: Column, sizeHint?: number): Uint8Array;
  abstract fromValues(values: unknown[] | TypedArray): Column;
  abstract zeroValue(): unknown;
  abstract estimateSize(rows: number): number;
  abstract decodeDense(reader: BufferReader, rows: number, state: DeserializerState): Column;
  abstract serializeLiteral(value: unknown, quoted?: boolean): string;
  abstract generate(ctx: GenContext): unknown;

  toLiteral(value: unknown, quoted?: boolean): string | typeof SQL_NULL {
    if (value == null) value = this.zeroValue();
    return this.serializeLiteral(value, quoted);
  }

  compare(a: unknown, b: unknown): boolean {
    return deepCompare(a, b);
  }

  fromRows(rows: readonly unknown[][], columnIndex: number): Column {
    return columnFromRows(this, rows, columnIndex);
  }

  makeBuilder(expectedRows?: number): ColumnBuilder {
    return makeDefaultColumnBuilder(this, expectedRows);
  }

  decode(reader: BufferReader, rows: number, state: DeserializerState): Column {
    if (state.serNode.kind === SerializationKind.Sparse) {
      return readSparse(this, reader, rows, state);
    }
    return this.decodeDense(reader, rows, state);
  }

  readKinds(reader: BufferReader): SerializationNode {
    const kind = reader.readU8();
    return { kind, children: [] };
  }
}
