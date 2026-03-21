/**
 * Codec classes for Native format encoding/decoding.
 * Each codec handles a specific ClickHouse type.
 */

import {
  ArrayColumn,
  type Column,
  countAndIndexDiscriminators,
  DataColumn,
  type DiscriminatorArray,
  DynamicColumn,
  EnumColumn,
  JsonColumn,
  MapColumn,
  NullableColumn,
  TupleColumn,
  VariantColumn,
} from "./columns.ts";
import {
  Dynamic,
  IPv6 as IPv6Const,
  JSONFormat,
  LowCardinality as LC,
  SerializationKind,
  Sparse,
  Time,
  UUID as UUIDConst,
  Variant,
} from "./constants.ts";
import { type BufferReader, BufferWriter, type TypedArrayConstructor } from "./io.ts";
import {
  DEFAULT_DENSE_NODE,
  type DeserializerState,
  type SerializationNode,
} from "./serialization.ts";
import { decodeBinaryValue } from "./binary_type.ts";
import {
  BYTE_TO_HEX,
  bytesToIpv6,
  ClickHouseDateTime64,
  decimalByteSize,
  type EnumMapping,
  extractDecimalScale,
  formatScaledBigInt,
  HEX_LUT,
  ipv6ToBytes,
  parseDecimalToScaledBigInt,
  parseEnumDefinition,
  parseTupleElements,
  parseTypeList,
  readBigInt128,
  readBigInt256,
  TEXT_DECODER,
  TEXT_ENCODER,
  type TypedArray,
  writeBigInt128,
  writeBigInt256,
} from "./types.ts";
import {
  coerceToString,
  INT128_MAX,
  INT128_MIN,
  INT256_MAX,
  INT256_MIN,
  INT32_MAX,
  INT32_MIN,
  INT64_MAX,
  INT64_MIN,
  IPV4_REGEX,
  isArrayLike,
  toBigIntInRange,
  toBool,
  toInt16,
  toInt32,
  toInt64,
  toInt8,
  toNumber,
  toUInt16,
  toUInt32,
  toUInt64,
  toUInt8,
  toValidDate,
  toValidDecimal,
  toValidIPv4,
  toValidIPv6,
  toValidUUID,
  UINT128_MAX,
  UINT16_MAX,
  UINT32_MAX,
  UINT256_MAX,
} from "./coercion.ts";

/**
 * Sentinel value representing SQL NULL in toLiteral serialization.
 * Used to distinguish actual NULL from the string "NULL".
 */
export const SQL_NULL = Symbol.for("chttp.SQL_NULL");

/** Convert SQL_NULL symbol to "NULL" string for nested literals */
function nullToLiteral(lit: string | typeof SQL_NULL): string {
  return lit === SQL_NULL ? "NULL" : lit;
}

function wrapQuoted(s: string, quoted?: boolean): string {
  return quoted ? `'${s}'` : s;
}

/** Get a Uint8Array view over a TypedArray's underlying buffer, respecting byteOffset. */
function asBytes(arr: ArrayBufferView): Uint8Array {
  return new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
}

// Re-export for public API
export {
  toBigInt,
  toInt16,
  toInt32,
  toInt64,
  toInt8,
  toNumber,
  toUInt16,
  toUInt32,
  toUInt64,
  toUInt8,
} from "./coercion.ts";

interface NumericLikeCodec extends Codec {
  readonly Ctor: TypedArrayConstructor<any>;
  readonly converter?: (v: unknown) => number | bigint;
}

function isNumericLikeCodec(codec: Codec): codec is NumericLikeCodec {
  return typeof (codec as any)?.Ctor === "function";
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
function childState(state: DeserializerState, index: number): DeserializerState {
  return {
    ...state,
    serNode: state.serNode.children[index] ?? DEFAULT_DENSE_NODE,
  };
}

/**
 * Read serialization kinds for wrapper codec with 1 child.
 * Used by Array, Nullable, LowCardinality.
 */
function readKinds1(reader: BufferReader, child: Codec): SerializationNode {
  const kind = reader.readU8();
  return { kind, children: [child.readKinds(reader)] };
}

/**
 * Read serialization kinds for wrapper codec with 2 children.
 * Used by Map (key + value).
 */
function readKinds2(reader: BufferReader, childA: Codec, childB: Codec): SerializationNode {
  const kind = reader.readU8();
  return { kind, children: [childA.readKinds(reader), childB.readKinds(reader)] };
}

/**
 * Read serialization kinds for wrapper codec with N children.
 * Used by Tuple, Variant, Dynamic, JSON.
 */
function readKindsMany(reader: BufferReader, children: readonly Codec[]): SerializationNode {
  const kind = reader.readU8();
  const nodes = new Array(children.length);
  for (let i = 0; i < children.length; i++) {
    nodes[i] = children[i].readKinds(reader);
  }
  return { kind, children: nodes };
}

// Alias for brevity
const { MS_PER_DAY, MS_PER_SECOND } = Time;

export interface Codec {
  /** ClickHouse type string this codec handles */
  readonly type: string;
  encode(col: Column, sizeHint?: number): Uint8Array;
  decode(reader: BufferReader, rows: number, state: DeserializerState): Column;
  fromValues(values: unknown[] | TypedArray): Column;
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
}

/**
 * Escape control characters in a string for ClickHouse.
 * Always escapes: backslash, tab, newline, carriage return
 * Optionally escapes: single quote (for string literals)
 */
function escapeString(s: string, escapeSingleQuote = false): string {
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

    // Check if we've exceeded the requested rows
    if (nextTotalRows >= rows) {
      trailingDefaultCount = nextTotalRows - rows;
      hasValueAfterTrailing = !end;
      break;
    }

    // END flag with remaining defaults
    if (end) {
      hasValueAfterTrailing = false;
      trailingDefaultCount = defaultsBeforeValue;
      break;
    }

    // This VarInt represents a non-default value at position (startOfGroup + defaultsBeforeValue)
    const startOfGroup = !isFirstValue && indices.length > 0 ? indices[indices.length - 1] + 1 : 0;
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
  const decodeFn = (r: BufferReader, n: number) =>
    codec.decodeDense(r, n, defaultDeserializerState());

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
    const dest = new Ctor(rows); // Zero-filled by default
    for (let i = 0; i < indices.length; i++) {
      const idx = indices[i];
      if (idx < rows) {
        dest[idx] = src[i];
      }
    }
    return new DataColumn(codec.type, dest);
  }

  // Generic path: materialize via get() for complex types
  const resultValues = new Array(rows);
  for (let i = 0; i < rows; i++) resultValues[i] = zero;

  for (let i = 0; i < indices.length; i++) {
    const idx = indices[i];
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
export abstract class BaseCodec implements Codec {
  abstract readonly type: string;
  abstract encode(col: Column, sizeHint?: number): Uint8Array;
  abstract fromValues(values: unknown[] | TypedArray): Column;
  abstract zeroValue(): unknown;
  abstract estimateSize(rows: number): number;
  abstract decodeDense(reader: BufferReader, rows: number, state: DeserializerState): Column;
  abstract serializeLiteral(value: unknown, quoted?: boolean): string;

  toLiteral(value: unknown, quoted?: boolean): string | typeof SQL_NULL {
    if (value == null) value = this.zeroValue();
    return this.serializeLiteral(value, quoted);
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

class NumericCodec<T extends TypedArray> extends BaseCodec {
  readonly type: string;
  readonly Ctor: TypedArrayConstructor<T>;
  readonly converter?: (v: unknown) => number | bigint;
  constructor(
    type: string,
    Ctor: TypedArrayConstructor<T>,
    converter?: (v: unknown) => number | bigint,
  ) {
    super();
    this.type = type;
    this.Ctor = Ctor;
    this.converter = converter;
  }

  encode(col: Column): Uint8Array {
    // Fast path: DataColumn wrapping a TypedArray - zero-copy
    if (
      col instanceof DataColumn &&
      ArrayBuffer.isView(col.data) &&
      !(col.data instanceof DataView)
    ) {
      const data = col.data as TypedArray;
      return asBytes(data);
    }
    // Fallback: virtual columns (Nullable, Variant, etc.) - materialize via get()
    const len = col.length;
    const arr = new this.Ctor(len);
    for (let i = 0; i < len; i++) {
      const v = col.get(i);
      arr[i] = (this.converter ? this.converter(v) : v) as any;
    }
    return asBytes(arr);
  }

  decodeDense(reader: BufferReader, rows: number, _state: DeserializerState): Column {
    return new DataColumn(this.type, reader.readTypedArray(this.Ctor, rows));
  }

  fromValues(values: unknown[] | TypedArray): DataColumn<T> {
    // Zero-copy if already the correct TypedArray type
    if (values instanceof this.Ctor) {
      return new DataColumn(this.type, values);
    }
    const arr = new this.Ctor(values.length);
    const convert = this.converter;
    for (let i = 0; i < values.length; i++) {
      const v = (values as unknown[])[i];
      arr[i] = (convert ? convert(v) : v) as any;
    }
    return new DataColumn(this.type, arr);
  }

  zeroValue() {
    return 0;
  }
  estimateSize(rows: number) {
    return rows * this.Ctor.BYTES_PER_ELEMENT;
  }
  serializeLiteral(value: unknown): string {
    if (this.type === "Bool") return toBool(value) ? "true" : "false";
    const v = this.converter ? this.converter(value) : value;
    return String(v);
  }
}

class EnumCodec extends BaseCodec {
  readonly type: string;
  private Ctor: typeof Int8Array | typeof Int16Array;
  private mapping: EnumMapping;
  private min: number;
  private max: number;
  private defaultValue: number;

  constructor(type: string) {
    super();
    this.type = type;
    this.Ctor = type.startsWith("Enum8") ? Int8Array : Int16Array;
    this.min = this.Ctor === Int8Array ? -128 : -32768;
    this.max = this.Ctor === Int8Array ? 127 : 32767;
    const parsed = parseEnumDefinition(type);
    if (!parsed) throw new Error(`Failed to parse enum definition: ${type}`);
    this.mapping = parsed;
    // Default to minimum valid enum value. ClickHouse Native protocol silently
    // converts invalid values (like 0 for enums that don't define it) to the
    // minimum valid value, so we match that behavior for null/undefined.
    let minValue: number | null = null;
    for (const v of this.mapping.valueToName.keys()) {
      if (minValue === null || v < minValue) minValue = v;
    }
    if (minValue === null) throw new Error(`Enum has no values: ${type}`);
    this.defaultValue = minValue;
  }

  private toEnumValue(val: unknown): number {
    if (val === undefined || val === null) return this.defaultValue;
    if (typeof val === "string") {
      const num = this.mapping.nameToValue.get(val);
      if (num === undefined) throw new Error(`Invalid enum value: ${val}`);
      return num;
    }
    let num: number;
    if (typeof val === "number") {
      num = val;
    } else if (typeof val === "bigint") {
      if (val < BigInt(this.min) || val > BigInt(this.max))
        throw new Error(`Enum value out of range: ${val}`);
      num = Number(val);
    } else {
      throw new Error(`Invalid enum value: ${val}`);
    }

    if (!Number.isInteger(num)) throw new Error(`Invalid enum value: ${val}`);
    if (num < this.min || num > this.max) throw new Error(`Enum value out of range: ${val}`);
    if (!this.mapping.valueToName.has(num)) throw new Error(`Invalid enum value: ${val}`);
    return num;
  }

  encode(col: Column): Uint8Array {
    // Fast path: underlying typed array matches - zero-copy
    const underlying =
      col instanceof EnumColumn ? col.data : col instanceof DataColumn ? col.data : null;
    if (underlying instanceof this.Ctor) {
      return asBytes(underlying);
    }
    const len = col.length;
    const arr = new this.Ctor(len);
    for (let i = 0; i < len; i++) {
      arr[i] = this.toEnumValue(col.get(i));
    }
    return asBytes(arr);
  }

  decodeDense(reader: BufferReader, rows: number, _state: DeserializerState): Column {
    const arr =
      this.Ctor === Int8Array
        ? reader.readTypedArray(Int8Array, rows)
        : reader.readTypedArray(Int16Array, rows);
    return new EnumColumn(
      this.type,
      arr,
      this.mapping.valueToName,
      reader.options?.enumAsNumber ?? false,
    );
  }

  fromValues(values: unknown[]): EnumColumn {
    const arr = new this.Ctor(values.length);
    for (let i = 0; i < values.length; i++) arr[i] = this.toEnumValue(values[i]);
    return new EnumColumn(this.type, arr, this.mapping.valueToName, false);
  }

  zeroValue(): number {
    return this.defaultValue;
  }

  estimateSize(rows: number): number {
    return rows * this.Ctor.BYTES_PER_ELEMENT;
  }
  serializeLiteral(value: unknown, quoted?: boolean): string {
    let name: string;
    if (typeof value === "string") {
      if (!this.mapping.nameToValue.has(value)) {
        throw new Error(`Invalid enum value "${value}" for ${this.type}`);
      }
      name = value;
    } else {
      name = this.mapping.valueToName.get(this.toEnumValue(value))!;
    }
    if (quoted) return `'${escapeString(name, true)}'`;
    return escapeString(name);
  }
}

class StringCodec extends BaseCodec {
  readonly type = "String";

  encode(col: Column, sizeHint?: number): Uint8Array {
    const len = col.length;
    const writer = new BufferWriter(sizeHint ?? this.estimateSize(len));
    for (let i = 0; i < len; i++) {
      writer.writeString(coerceToString(col.get(i)));
    }
    return writer.finish();
  }

  decodeDense(reader: BufferReader, rows: number, _state: DeserializerState): Column {
    const values: string[] = new Array(rows);
    for (let i = 0; i < rows; i++) values[i] = reader.readString();
    return new DataColumn(this.type, values);
  }

  fromValues(values: unknown[]): Column {
    return new DataColumn(this.type, values.map(coerceToString));
  }

  zeroValue() {
    return "";
  }
  estimateSize(rows: number) {
    return rows * 33;
  }
  serializeLiteral(value: unknown, quoted?: boolean): string {
    const str = coerceToString(value);
    if (quoted) return `'${escapeString(str, true)}'`;
    return escapeString(str);
  }
}

class UUIDCodec extends BaseCodec {
  readonly type = "UUID";

  encode(col: Column): Uint8Array {
    const len = col.length;
    const buf = new Uint8Array(len * UUIDConst.BYTE_SIZE);

    for (let i = 0; i < len; i++) {
      const u = toValidUUID(col.get(i));
      const clean = u.replace(/-/g, "");

      // CH stores as: [low_64_reversed] [high_64_reversed]
      const off = i * 16;
      for (let j = 0; j < 8; j++) {
        const p = (7 - j) * 2;
        buf[off + j] = (HEX_LUT[clean.charCodeAt(p)] << 4) | HEX_LUT[clean.charCodeAt(p + 1)];
      }
      for (let j = 0; j < 8; j++) {
        const p = (15 - j) * 2;
        buf[off + 8 + j] = (HEX_LUT[clean.charCodeAt(p)] << 4) | HEX_LUT[clean.charCodeAt(p + 1)];
      }
    }
    return buf;
  }

  decodeDense(reader: BufferReader, rows: number, _state: DeserializerState): Column {
    reader.ensureAvailable(rows * UUIDConst.BYTE_SIZE);
    const values: string[] = new Array(rows);
    for (let i = 0; i < rows; i++) {
      const b = reader.buffer.subarray(reader.offset, reader.offset + 16);
      reader.offset += 16;

      // Reverse byte halves and format directly via lookup table
      values[i] =
        BYTE_TO_HEX[b[7]] +
        BYTE_TO_HEX[b[6]] +
        BYTE_TO_HEX[b[5]] +
        BYTE_TO_HEX[b[4]] +
        "-" +
        BYTE_TO_HEX[b[3]] +
        BYTE_TO_HEX[b[2]] +
        "-" +
        BYTE_TO_HEX[b[1]] +
        BYTE_TO_HEX[b[0]] +
        "-" +
        BYTE_TO_HEX[b[15]] +
        BYTE_TO_HEX[b[14]] +
        "-" +
        BYTE_TO_HEX[b[13]] +
        BYTE_TO_HEX[b[12]] +
        BYTE_TO_HEX[b[11]] +
        BYTE_TO_HEX[b[10]] +
        BYTE_TO_HEX[b[9]] +
        BYTE_TO_HEX[b[8]];
    }
    return new DataColumn(this.type, values);
  }

  fromValues(values: unknown[]): Column {
    return new DataColumn(this.type, values.map(toValidUUID));
  }

  zeroValue() {
    return "00000000-0000-0000-0000-000000000000";
  }
  estimateSize(rows: number) {
    return rows * UUIDConst.BYTE_SIZE;
  }
  serializeLiteral(value: unknown, quoted?: boolean): string {
    return wrapQuoted(toValidUUID(value), quoted);
  }
}

class FixedStringCodec extends BaseCodec {
  readonly type: string;
  readonly len: number;
  constructor(len: number) {
    super();
    this.len = len;
    this.type = `FixedString(${len})`;
  }

  encode(col: Column): Uint8Array {
    const count = col.length;
    const len = this.len;
    const type = this.type;
    const buf = new Uint8Array(count * len);
    for (let i = 0; i < count; i++) {
      const v = col.get(i);
      if (v instanceof Uint8Array) {
        if (v.length !== len) {
          throw new TypeError(`${type} requires ${len} bytes, got ${v.length}`);
        }
        buf.set(v, i * len);
      } else if (typeof v === "string") {
        const bytes = TEXT_ENCODER.encode(v);
        if (bytes.length > len) {
          throw new TypeError(`${type} requires ${len} bytes, got ${bytes.length}`);
        }
        buf.set(bytes, i * len);
      } else if (v == null) {
      } else {
        throw new TypeError(`Cannot coerce ${typeof v} to ${type}`);
      }
    }
    return buf;
  }

  decodeDense(reader: BufferReader, rows: number, _state: DeserializerState): Column {
    reader.ensureAvailable(rows * this.len);
    const values: Uint8Array[] = new Array(rows);
    for (let i = 0; i < rows; i++) {
      values[i] = reader.buffer.slice(reader.offset, reader.offset + this.len);
      reader.offset += this.len;
    }
    return new DataColumn(this.type, values);
  }

  fromValues(values: unknown[]): Column {
    const len = this.len;
    const type = this.type;
    const result: Uint8Array[] = new Array(values.length);
    for (let i = 0; i < values.length; i++) {
      const v = values[i];
      if (v instanceof Uint8Array) {
        if (v.length !== len) {
          throw new TypeError(`${type} requires ${len} bytes, got ${v.length}`);
        }
        result[i] = v;
      } else if (typeof v === "string") {
        const encoded = TEXT_ENCODER.encode(v);
        if (encoded.length > len) {
          throw new TypeError(`${type} requires ${len} bytes, got ${encoded.length}`);
        }
        const buf = new Uint8Array(len);
        buf.set(encoded);
        result[i] = buf;
      } else if (v == null) {
        result[i] = new Uint8Array(len);
      } else {
        throw new TypeError(`Cannot coerce ${typeof v} to ${type}`);
      }
    }
    return new DataColumn(type, result);
  }

  zeroValue() {
    return new Uint8Array(this.len);
  }
  estimateSize(rows: number) {
    return rows * this.len;
  }
  serializeLiteral(value: unknown, quoted?: boolean): string {
    let str: string;
    if (value instanceof Uint8Array) {
      let end = value.length;
      while (end > 0 && value[end - 1] === 0) end--;
      str = TEXT_DECODER.decode(value.subarray(0, end));
    } else {
      str = coerceToString(value);
    }
    if (quoted) return `'${escapeString(str, true)}'`;
    return escapeString(str);
  }
}

class BigIntCodec extends BaseCodec {
  readonly type: string;
  private byteSize: 16 | 32;
  private signed: boolean;
  private min: bigint;
  private max: bigint;

  constructor(type: string, byteSize: 16 | 32, signed: boolean) {
    super();
    this.type = type;
    this.byteSize = byteSize;
    this.signed = signed;
    if (byteSize === 16) {
      this.min = signed ? INT128_MIN : 0n;
      this.max = signed ? INT128_MAX : UINT128_MAX;
    } else {
      this.min = signed ? INT256_MIN : 0n;
      this.max = signed ? INT256_MAX : UINT256_MAX;
    }
  }

  private coerce(v: unknown): bigint {
    return toBigIntInRange(v, this.type, this.min, this.max);
  }

  encode(col: Column): Uint8Array {
    const len = col.length;
    const buf = new Uint8Array(len * this.byteSize);
    const view = new DataView(buf.buffer);
    const writer = this.byteSize === 16 ? writeBigInt128 : writeBigInt256;
    for (let i = 0; i < len; i++) {
      writer(view, i * this.byteSize, this.coerce(col.get(i)), this.signed);
    }
    return buf;
  }

  decodeDense(reader: BufferReader, rows: number, _state: DeserializerState): Column {
    reader.ensureAvailable(rows * this.byteSize);
    const values: bigint[] = new Array(rows);
    const readFn = this.byteSize === 16 ? readBigInt128 : readBigInt256;
    for (let i = 0; i < rows; i++) {
      values[i] = readFn(reader.view, reader.offset, this.signed);
      reader.offset += this.byteSize;
    }
    return new DataColumn(this.type, values);
  }

  fromValues(values: unknown[]): Column {
    return new DataColumn(
      this.type,
      values.map((v) => this.coerce(v)),
    );
  }

  zeroValue() {
    return 0n;
  }
  estimateSize(rows: number) {
    return rows * this.byteSize;
  }
  serializeLiteral(value: unknown): string {
    return String(this.coerce(value));
  }
}

class DecimalCodec extends BaseCodec {
  readonly type: string;
  private byteSize: 4 | 8 | 16 | 32;
  private scale: number;
  private min: bigint;
  private max: bigint;

  constructor(type: string) {
    super();
    this.type = type;
    this.byteSize = decimalByteSize(type);
    this.scale = extractDecimalScale(type);
    if (this.byteSize === 4) {
      this.min = BigInt(INT32_MIN);
      this.max = BigInt(INT32_MAX);
    } else if (this.byteSize === 8) {
      this.min = INT64_MIN;
      this.max = INT64_MAX;
    } else if (this.byteSize === 16) {
      this.min = INT128_MIN;
      this.max = INT128_MAX;
    } else {
      this.min = INT256_MIN;
      this.max = INT256_MAX;
    }
  }

  encode(col: Column): Uint8Array {
    const len = col.length;
    const buf = new Uint8Array(len * this.byteSize);
    const view = new DataView(buf.buffer);

    for (let i = 0; i < len; i++) {
      const v = col.get(i);
      let scaled: bigint;
      if (typeof v === "bigint") {
        scaled = v;
      } else {
        scaled = parseDecimalToScaledBigInt(toValidDecimal(v), this.scale);
      }

      if (scaled < this.min || scaled > this.max) {
        throw new RangeError(
          `${this.type} out of range: ${scaled} not in [${this.min}, ${this.max}]`,
        );
      }

      const off = i * this.byteSize;
      if (this.byteSize === 4) {
        view.setInt32(off, Number(scaled), true);
      } else if (this.byteSize === 8) {
        view.setBigInt64(off, scaled, true);
      } else if (this.byteSize === 16) {
        writeBigInt128(view, off, scaled, true);
      } else {
        writeBigInt256(view, off, scaled, true);
      }
    }
    return buf;
  }

  decodeDense(reader: BufferReader, rows: number, _state: DeserializerState): Column {
    reader.ensureAvailable(rows * this.byteSize);
    const values: string[] = new Array(rows);
    for (let i = 0; i < rows; i++) {
      let scaled: bigint;
      if (this.byteSize === 4) {
        scaled = BigInt(reader.view.getInt32(reader.offset, true));
      } else if (this.byteSize === 8) {
        scaled = reader.view.getBigInt64(reader.offset, true);
      } else if (this.byteSize === 16) {
        scaled = readBigInt128(reader.view, reader.offset, true);
      } else {
        scaled = readBigInt256(reader.view, reader.offset, true);
      }
      reader.offset += this.byteSize;
      values[i] = formatScaledBigInt(scaled, this.scale);
    }
    return new DataColumn(this.type, values);
  }

  fromValues(values: unknown[]): Column {
    const scale = this.scale;
    return new DataColumn(
      this.type,
      values.map((v) => (typeof v === "bigint" ? formatScaledBigInt(v, scale) : toValidDecimal(v))),
    );
  }

  zeroValue() {
    return formatScaledBigInt(0n, this.scale);
  }
  estimateSize(rows: number) {
    return rows * this.byteSize;
  }
  serializeLiteral(value: unknown): string {
    if (typeof value === "bigint") return formatScaledBigInt(value, this.scale);
    return toValidDecimal(value);
  }
}

class DateTime64Codec extends BaseCodec {
  readonly type: string;
  private precision: number;
  private msScale: bigint; // 10^|precision-3|: converts between ms and ticks
  private fullScale: bigint; // 10^precision: converts between seconds and ticks
  constructor(type: string, precision: number) {
    super();
    this.type = type;
    this.precision = precision;
    this.msScale = 10n ** BigInt(Math.abs(precision - 3));
    this.fullScale = 10n ** BigInt(precision);
  }

  private coerceToTicks(v: unknown): bigint {
    const precision = this.precision;
    const scale = this.msScale;
    if (v instanceof ClickHouseDateTime64) {
      if (v.precision !== precision) {
        throw new TypeError(
          `${this.type} precision mismatch: expected ${precision}, got ${v.precision}`,
        );
      }
      return toBigIntInRange(v.ticks, this.type, INT64_MIN, INT64_MAX);
    }
    if (typeof v === "bigint") {
      return toBigIntInRange(v, this.type, INT64_MIN, INT64_MAX);
    }
    if (v instanceof Date) {
      const msNum = v.getTime();
      if (!Number.isFinite(msNum)) {
        throw new TypeError(`Cannot coerce "${v}" to ${this.type}`);
      }
      const ms = BigInt(msNum);
      const ticks = precision >= 3 ? ms * scale : ms / scale;
      return toBigIntInRange(ticks, this.type, INT64_MIN, INT64_MAX);
    }
    if (typeof v === "number") {
      if (!Number.isFinite(v)) {
        throw new TypeError(`Cannot coerce number "${v}" to ${this.type}`);
      }
      const msNum = Math.trunc(v);
      if (!Number.isSafeInteger(msNum)) {
        throw new RangeError(
          `${this.type} cannot safely represent number "${v}". Use bigint, Date, or string.`,
        );
      }
      const ms = BigInt(msNum);
      const ticks = precision >= 3 ? ms * scale : ms / scale;
      return toBigIntInRange(ticks, this.type, INT64_MIN, INT64_MAX);
    }
    if (typeof v === "string") {
      const d = toValidDate(v, this.type);
      const ms = BigInt(d.getTime());
      const ticks = precision >= 3 ? ms * scale : ms / scale;
      return toBigIntInRange(ticks, this.type, INT64_MIN, INT64_MAX);
    }
    if (v == null) return 0n;
    throw new TypeError(`Cannot coerce ${typeof v} to ${this.type}`);
  }

  encode(col: Column): Uint8Array {
    const len = col.length;
    const arr = new BigInt64Array(len);
    for (let i = 0; i < len; i++) {
      arr[i] = this.coerceToTicks(col.get(i));
    }
    return asBytes(arr);
  }

  decodeDense(reader: BufferReader, rows: number, _state: DeserializerState): Column {
    const arr = reader.readTypedArray(BigInt64Array, rows);
    const values: ClickHouseDateTime64[] = new Array(rows);
    for (let i = 0; i < rows; i++) {
      values[i] = new ClickHouseDateTime64(arr[i], this.precision);
    }
    return new DataColumn(this.type, values);
  }

  fromValues(values: unknown[]): Column {
    const precision = this.precision;
    const result: ClickHouseDateTime64[] = new Array(values.length);
    for (let i = 0; i < values.length; i++) {
      const v = values[i];
      if (v instanceof ClickHouseDateTime64 && v.precision === precision) {
        toBigIntInRange(v.ticks, this.type, INT64_MIN, INT64_MAX);
        result[i] = v;
      } else {
        result[i] = new ClickHouseDateTime64(this.coerceToTicks(v), precision);
      }
    }
    return new DataColumn(this.type, result);
  }

  zeroValue() {
    return new Date(0);
  }
  estimateSize(rows: number) {
    return rows * 8;
  }
  private formatTicks(ticks: bigint): string {
    const seconds = ticks / this.fullScale;
    const frac = ticks % this.fullScale;
    if (frac === 0n) return String(seconds);
    const fracStr = String(frac < 0n ? -frac : frac).padStart(this.precision, "0");
    return `${seconds}.${fracStr}`;
  }

  serializeLiteral(value: unknown): string {
    if (value instanceof ClickHouseDateTime64) {
      return this.formatTicks(value.ticks);
    }
    if (value instanceof Date) {
      const ms = BigInt(value.getTime());
      const ticks = this.precision >= 3 ? ms * this.msScale : ms / this.msScale;
      return this.formatTicks(ticks);
    }
    return String(value);
  }
}

// handles Date, Date32, DateTime (ms since epoch / multiplier)
class EpochCodec<T extends Uint16Array | Int32Array | Uint32Array> extends BaseCodec {
  readonly type: string;
  private Ctor: TypedArrayConstructor<T>;
  private multiplier: number;

  constructor(type: string, Ctor: TypedArrayConstructor<T>, multiplier: number) {
    super();
    this.type = type;
    this.Ctor = Ctor;
    this.multiplier = multiplier;
  }

  encode(col: Column): Uint8Array {
    const len = col.length;
    const arr = new this.Ctor(len);
    const type = this.type;
    const multiplier = this.multiplier;
    const [minUnits, maxUnits] =
      type === "Date"
        ? [0, UINT16_MAX]
        : type === "DateTime"
          ? [0, UINT32_MAX]
          : [INT32_MIN, INT32_MAX];
    for (let i = 0; i < len; i++) {
      const v = col.get(i);
      const ms =
        v instanceof Date
          ? v.getTime()
          : typeof v === "number"
            ? v
            : typeof v === "string"
              ? toValidDate(v, type).getTime()
              : v == null
                ? 0
                : (() => {
                    throw new TypeError(`Cannot coerce ${typeof v} to ${type}`);
                  })();

      if (!Number.isFinite(ms)) {
        throw new TypeError(`Cannot coerce "${v}" to ${type}`);
      }

      const units = Math.floor(ms / multiplier);
      if (units < minUnits || units > maxUnits) {
        throw new RangeError(`${type} out of range: ${v}`);
      }

      arr[i] = units as any;
    }
    return asBytes(arr);
  }

  decodeDense(reader: BufferReader, rows: number, _state: DeserializerState): Column {
    const arr = reader.readTypedArray(this.Ctor, rows);
    const values: Date[] = new Array(rows);
    for (let i = 0; i < rows; i++) {
      values[i] = new Date((arr[i] as number) * this.multiplier);
    }
    return new DataColumn(this.type, values);
  }

  fromValues(values: unknown[]): Column {
    const type = this.type;
    const result: Date[] = new Array(values.length);
    for (let i = 0; i < values.length; i++) {
      const v = values[i];
      if (v instanceof Date) {
        result[i] = v;
      } else if (typeof v === "number") {
        result[i] = new Date(v);
      } else if (typeof v === "string") {
        result[i] = toValidDate(v, type);
      } else if (v == null) {
        result[i] = new Date(0);
      } else {
        throw new TypeError(`Cannot coerce ${typeof v} to ${type}`);
      }
    }
    return new DataColumn(type, result);
  }

  zeroValue() {
    return new Date(0);
  }
  estimateSize(rows: number) {
    return rows * this.Ctor.BYTES_PER_ELEMENT;
  }
  serializeLiteral(value: unknown): string {
    let d: Date;
    if (value instanceof Date) {
      d = value;
    } else if (typeof value === "number") {
      d = new Date(value);
    } else if (typeof value === "string") {
      // If already a date string, return as-is
      return value;
    } else {
      throw new TypeError(`Cannot serialize ${typeof value} to ${this.type}`);
    }
    // Format as ISO date string (YYYY-MM-DD or YYYY-MM-DD HH:MM:SS)
    if (this.type === "Date" || this.type === "Date32") {
      return d.toISOString().slice(0, 10);
    }
    // DateTime: YYYY-MM-DD HH:MM:SS
    return d.toISOString().slice(0, 19).replace("T", " ");
  }
}

class IPv4Codec extends BaseCodec {
  readonly type = "IPv4";

  encode(col: Column): Uint8Array {
    const len = col.length;
    const arr = new Uint32Array(len);
    for (let i = 0; i < len; i++) {
      const v = toValidIPv4(col.get(i));
      const m = IPV4_REGEX.exec(v);
      if (!m) throw new TypeError(`Invalid IPv4 address: "${v}"`);
      const parts = [
        parseInt(m[1], 10),
        parseInt(m[2], 10),
        parseInt(m[3], 10),
        parseInt(m[4], 10),
      ];
      // ClickHouse stores IPv4 as big-endian UInt32 (network order): first octet in high bits
      arr[i] = ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
    }
    return asBytes(arr);
  }

  decodeDense(reader: BufferReader, rows: number, _state: DeserializerState): Column {
    const arr = reader.readTypedArray(Uint32Array, rows);
    const values: string[] = new Array(rows);
    for (let i = 0; i < rows; i++) {
      const v = arr[i];
      // ClickHouse stores IPv4 in native format as little-endian UInt32.
      // The numeric value represents the IP in big-endian order (first octet in high bits).
      values[i] = `${(v >> 24) & 0xff}.${(v >> 16) & 0xff}.${(v >> 8) & 0xff}.${v & 0xff}`;
    }
    return new DataColumn(this.type, values);
  }

  fromValues(values: unknown[]): Column {
    return new DataColumn(this.type, values.map(toValidIPv4));
  }

  zeroValue() {
    return "0.0.0.0";
  }
  estimateSize(rows: number) {
    return rows * 4;
  }
  serializeLiteral(value: unknown, quoted?: boolean): string {
    return wrapQuoted(toValidIPv4(value), quoted);
  }
}

class IPv6Codec extends BaseCodec {
  readonly type = "IPv6";

  encode(col: Column): Uint8Array {
    const len = col.length;
    const result = new Uint8Array(len * IPv6Const.BYTE_SIZE);
    for (let i = 0; i < len; i++) {
      const v = toValidIPv6(col.get(i));
      const bytes = ipv6ToBytes(v);
      result.set(bytes, i * 16);
    }
    return result;
  }

  decodeDense(reader: BufferReader, rows: number, _state: DeserializerState): Column {
    const values: string[] = new Array(rows);
    for (let i = 0; i < rows; i++) {
      const bytes = reader.readBytes(IPv6Const.BYTE_SIZE);
      values[i] = bytesToIpv6(bytes);
    }
    return new DataColumn(this.type, values);
  }

  fromValues(values: unknown[]): Column {
    return new DataColumn(this.type, values.map(toValidIPv6));
  }

  zeroValue() {
    return "::";
  }
  estimateSize(rows: number) {
    return rows * IPv6Const.BYTE_SIZE;
  }
  serializeLiteral(value: unknown, quoted?: boolean): string {
    return wrapQuoted(toValidIPv6(value), quoted);
  }
}

// When used as a column in Map/Tuple, inner codec's prefix needs to be handled
class ArrayCodec extends BaseCodec {
  readonly type: string;
  private inner: Codec;

  constructor(type: string, inner: Codec) {
    super();
    this.type = type;
    this.inner = inner;
  }

  writePrefix(writer: BufferWriter, col: Column) {
    const arr = col as ArrayColumn;
    this.inner.writePrefix?.(writer, arr.inner);
  }

  readPrefix(reader: BufferReader) {
    this.inner.readPrefix?.(reader);
  }

  encode(col: Column, sizeHint?: number): Uint8Array {
    const arr = col as ArrayColumn;
    const hint = sizeHint ?? this.estimateSize(col.length);
    const writer = new BufferWriter(hint);

    // Write offsets
    writer.write(asBytes(arr.offsets));

    // Write inner data with estimated size
    const innerHint = this.inner.estimateSize(arr.inner.length);
    writer.write(this.inner.encode(arr.inner, innerHint));

    return writer.finish();
  }

  decodeDense(reader: BufferReader, rows: number, state: DeserializerState): Column {
    const offsets = reader.readTypedArray(BigUint64Array, rows);
    const totalCount = rows > 0 ? Number(offsets[rows - 1]) : 0;
    const inner = this.inner.decode(reader, totalCount, childState(state, 0));
    return new ArrayColumn(this.type, offsets, inner);
  }

  fromValues(values: unknown[]): ArrayColumn {
    const offsets = new BigUint64Array(values.length);

    // Compute per-row lengths and validate non-null values are arrays (regular or TypedArray)
    const lengths = new Array<number>(values.length);
    let totalCount = 0;
    for (let i = 0; i < values.length; i++) {
      const v = values[i];
      if (v == null) {
        lengths[i] = 0;
        continue;
      }
      if (!isArrayLike(v)) {
        throw new TypeError(`Expected array for ${this.type}, got ${typeof v}`);
      }
      const len = (v as ArrayLike<unknown>).length;
      lengths[i] = len;
      totalCount += len;
    }

    // Fast path for numeric inner types: build TypedArray directly
    // Use a type guard rather than casting to an internal codec class.
    if (isNumericLikeCodec(this.inner)) {
      const inner = this.inner;
      const allInner = new inner.Ctor(totalCount);
      const convert = inner.converter;
      let offset = 0n;
      let idx = 0;
      // `as never` needed: TS can't unify number|bigint with generic TypedArray element types
      for (let i = 0; i < values.length; i++) {
        const v = values[i];
        if (v == null) {
          offsets[i] = offset;
          continue;
        }
        const arr = v as ArrayLike<unknown>;
        for (let j = 0; j < arr.length; j++)
          allInner[idx++] = (convert ? convert(arr[j]) : arr[j]) as never;
        offset += BigInt(lengths[i]);
        offsets[i] = offset;
      }
      return new ArrayColumn(this.type, offsets, new DataColumn(this.inner.type, allInner));
    }

    // Generic path for non-numeric types (isArrayLike already validated in pre-scan)
    const allInner: unknown[] = [];
    let offset = 0n;
    for (let i = 0; i < values.length; i++) {
      const v = values[i];
      if (v == null) {
        offsets[i] = offset;
        continue;
      }
      const arr = v as ArrayLike<unknown> & Iterable<unknown>;
      for (const item of arr) allInner.push(item);
      offset += BigInt(arr.length);
      offsets[i] = offset;
    }
    return new ArrayColumn(this.type, offsets, this.inner.fromValues(allInner));
  }

  zeroValue() {
    return [];
  }
  // 8 bytes per offset + assume average 5 elements per row
  estimateSize(rows: number) {
    return rows * 8 + this.inner.estimateSize(rows * 5);
  }

  readKinds(reader: BufferReader): SerializationNode {
    return readKinds1(reader, this.inner);
  }
  serializeLiteral(value: unknown): string {
    if (!isArrayLike(value)) {
      throw new TypeError(`Expected array for ${this.type}, got ${typeof value}`);
    }
    const arr = value as ArrayLike<unknown> & Iterable<unknown>;
    const elements: string[] = [];
    for (const item of arr) {
      elements.push(nullToLiteral(this.inner.toLiteral(item, true)));
    }
    return `[${elements.join(", ")}]`;
  }
}

// Delegates prefix handling to inner codec
class NullableCodec extends BaseCodec {
  readonly type: string;
  private inner: Codec;

  constructor(type: string, inner: Codec) {
    super();
    this.type = type;
    this.inner = inner;
  }

  /** Expose inner codec for LowCardinality wrapping */
  getInnerCodec(): Codec {
    return this.inner;
  }

  writePrefix(writer: BufferWriter, col: Column) {
    const nc = col as NullableColumn;
    this.inner.writePrefix?.(writer, nc.inner);
  }

  readPrefix(reader: BufferReader) {
    this.inner.readPrefix?.(reader);
  }

  encode(col: Column, sizeHint?: number): Uint8Array {
    const nc = col as NullableColumn;
    const hint = sizeHint ?? this.estimateSize(col.length);
    const writer = new BufferWriter(hint);
    writer.write(nc.nullFlags);
    const innerHint = this.inner.estimateSize(nc.inner.length);
    writer.write(this.inner.encode(nc.inner, innerHint));
    return writer.finish();
  }

  decodeDense(reader: BufferReader, rows: number, state: DeserializerState): Column {
    const nullFlags = reader.readTypedArray(Uint8Array, rows);
    const inner = this.inner.decode(reader, rows, childState(state, 0));
    return new NullableColumn(this.type, nullFlags, inner);
  }

  fromValues(values: unknown[]): NullableColumn {
    const nullFlags = new Uint8Array(values.length);
    const innerValues: unknown[] = new Array(values.length);
    const zeroVal = this.inner.zeroValue();
    for (let i = 0; i < values.length; i++) {
      if (values[i] === null || values[i] === undefined) {
        nullFlags[i] = 1;
        innerValues[i] = zeroVal;
      } else {
        innerValues[i] = values[i];
      }
    }
    return new NullableColumn(this.type, nullFlags, this.inner.fromValues(innerValues));
  }

  zeroValue() {
    return null;
  }
  // null flags (1 byte each) + inner data
  estimateSize(rows: number) {
    return rows + this.inner.estimateSize(rows);
  }

  readKinds(reader: BufferReader): SerializationNode {
    return readKinds1(reader, this.inner);
  }
  toLiteral(value: unknown, quoted?: boolean): string | typeof SQL_NULL {
    if (value == null) return SQL_NULL;
    return this.inner.toLiteral(value, quoted);
  }
  // Unreachable: toLiteral() is overridden above.
  serializeLiteral(): string {
    return "";
  }
}

// LowCardinality stores a dictionary of unique values and indices into that dictionary.
// When wrapping Nullable(T), the dictionary stores T values (not Nullable(T)) and index 0
// is reserved for NULL. This avoids storing null flags per dictionary entry - nullness is
// encoded in the index itself.
class LowCardinalityCodec extends BaseCodec {
  readonly type: string;
  private inner: Codec;
  private dictCodec: Codec; // Codec to use for dictionary (may differ from inner for Nullable)

  constructor(type: string, inner: Codec) {
    super();
    this.type = type;
    this.inner = inner;
    // For Nullable inner types, dictionary stores unwrapped type (nulls use index 0)
    this.dictCodec = inner instanceof NullableCodec ? inner.getInnerCodec() : inner;
  }

  writePrefix(writer: BufferWriter) {
    writer.writeU64LE(LC.VERSION);
  }

  readPrefix(reader: BufferReader) {
    reader.offset += 8;
  }

  encode(col: Column, sizeHint?: number): Uint8Array {
    // LowCardinality encode builds dictionary from column values
    // This is row-oriented by nature - we need to scan values to find uniques
    const len = col.length;
    if (len === 0) return new Uint8Array(0);

    const hint = sizeHint ?? this.estimateSize(len);
    const writer = new BufferWriter(hint);
    const isNullable = this.inner instanceof NullableCodec;

    const dict = new Map<unknown, number>();
    const dictValues: unknown[] = [];
    const indices: number[] = [];

    // For Nullable types, index 0 is reserved for null
    if (isNullable) {
      dict.set(null, 0);
      dictValues.push(null); // Placeholder for null
    }

    for (let i = 0; i < len; i++) {
      const v = col.get(i);
      if (isNullable && v === null) {
        indices.push(0);
      } else {
        const k = this.getDictKey(v);
        if (!dict.has(k)) {
          dict.set(k, dictValues.length);
          dictValues.push(v);
        }
        indices.push(dict.get(k)!);
      }
    }

    let indexType: bigint = LC.INDEX_U8;
    let IndexArray: any = Uint8Array;
    if (dictValues.length > LC.INDEX_U8_MAX) {
      indexType = LC.INDEX_U16;
      IndexArray = Uint16Array;
    }
    if (dictValues.length > LC.INDEX_U16_MAX) {
      indexType = LC.INDEX_U32;
      IndexArray = Uint32Array;
    }

    // Flag + IndexType in lower 8 bits
    writer.writeU64LE(LC.FLAG_ADDITIONAL_KEYS | indexType);

    // Build dictionary column from unique values
    writer.writeU64LE(BigInt(dictValues.length));
    const dictHint = this.dictCodec.estimateSize(dictValues.length);
    writer.write(this.dictCodec.encode(this.dictCodec.fromValues(dictValues), dictHint));
    writer.writeU64LE(BigInt(col.length));
    writer.write(new Uint8Array(new IndexArray(indices).buffer));

    return writer.finish();
  }

  decodeDense(reader: BufferReader, rows: number, _state: DeserializerState): Column {
    if (rows === 0) return new DataColumn(this.type, []);

    const flags = reader.readU64LE();
    const indexType = Number(flags & LC.INDEX_TYPE_MASK);
    const isNullable = this.inner instanceof NullableCodec;

    const dictSize = Number(reader.readU64LE());

    // Dictionary values are never sparse
    const dict = this.dictCodec.decode(reader, dictSize, defaultDeserializerState());

    const count = Number(reader.readU64LE());

    let indices: TypedArray;
    if (indexType === Number(LC.INDEX_U8)) indices = reader.readTypedArray(Uint8Array, count);
    else if (indexType === Number(LC.INDEX_U16))
      indices = reader.readTypedArray(Uint16Array, count);
    else if (indexType === Number(LC.INDEX_U32))
      indices = reader.readTypedArray(Uint32Array, count);
    else indices = reader.readTypedArray(BigUint64Array, count);

    // Expand dictionary to full column
    const values: unknown[] = new Array(count);
    for (let i = 0; i < count; i++) {
      const idx = Number(indices[i]);
      if (isNullable && idx === 0) {
        values[i] = null;
      } else if (idx >= dictSize) {
        throw new Error(`LowCardinality index ${idx} out of bounds (dictionary size: ${dictSize})`);
      } else {
        values[i] = dict.get(idx);
      }
    }
    return new DataColumn(this.type, values);
  }

  fromValues(values: unknown[]): Column {
    // LowCardinality is just storage optimization - pass through to inner
    return this.inner.fromValues(values);
  }

  zeroValue() {
    return this.inner.zeroValue();
  }

  // key for low cardinality dictionary map
  getDictKey(v: unknown): unknown {
    if (v === null || typeof v !== "object") return v;
    if (v instanceof Date) return v.getTime();
    if (v instanceof Uint8Array) {
      // FixedString - use hex encoding for stable key generation
      let s = "\0B:"; // prefix to distinguish from regular strings
      for (let i = 0; i < v.length; i++) {
        const byte = v[i];
        s += (byte >> 4).toString(16) + (byte & 0xf).toString(16);
      }
      return s;
    }
    // Stable stringification with sorted keys for objects
    if (typeof v === "object") {
      const keys = Object.keys(v as object).sort();
      return `\0O:${keys.map((k) => `${k}:${this.getDictKey((v as any)[k])}`).join(",")}`;
    }
    return v;
  }

  // Dictionary + indices (assume u16 indices, max 65536 unique values)
  estimateSize(rows: number) {
    const dictSize = Math.min(rows, 65536);
    return 8 + 8 + this.dictCodec.estimateSize(dictSize) + 8 + rows * 2;
  }

  readKinds(reader: BufferReader): SerializationNode {
    return readKinds1(reader, this.inner);
  }
  toLiteral(value: unknown, quoted?: boolean): string | typeof SQL_NULL {
    // LowCardinality is transparent - delegate to inner codec
    return this.inner.toLiteral(value, quoted);
  }
  // Unreachable: toLiteral() is overridden above.
  serializeLiteral(): string {
    return "";
  }
}

// Map is serialized as Array(Tuple(K, V))
// Prefixes are written at top level, not inside the data.
class MapCodec extends BaseCodec {
  readonly type: string;
  private keyCodec: Codec;
  private valCodec: Codec;

  constructor(type: string, keyCodec: Codec, valCodec: Codec) {
    super();
    this.type = type;
    this.keyCodec = keyCodec;
    this.valCodec = valCodec;
  }

  writePrefix(writer: BufferWriter, col: Column) {
    const map = col as MapColumn;
    this.keyCodec.writePrefix?.(writer, map.keys);
    this.valCodec.writePrefix?.(writer, map.values);
  }

  readPrefix(reader: BufferReader) {
    this.keyCodec.readPrefix?.(reader);
    this.valCodec.readPrefix?.(reader);
  }

  encode(col: Column, sizeHint?: number): Uint8Array {
    const map = col as MapColumn;
    const hint = sizeHint ?? this.estimateSize(col.length);
    const writer = new BufferWriter(hint);
    writer.write(asBytes(map.offsets));
    const keyHint = this.keyCodec.estimateSize(map.keys.length);
    const valHint = this.valCodec.estimateSize(map.values.length);
    writer.write(this.keyCodec.encode(map.keys, keyHint));
    writer.write(this.valCodec.encode(map.values, valHint));
    return writer.finish();
  }

  decodeDense(reader: BufferReader, rows: number, state: DeserializerState): Column {
    const offsets = reader.readTypedArray(BigUint64Array, rows);
    const total = rows > 0 ? Number(offsets[rows - 1]) : 0;
    const keys = this.keyCodec.decode(reader, total, childState(state, 0));
    const vals = this.valCodec.decode(reader, total, childState(state, 1));
    return new MapColumn(this.type, offsets, keys, vals, reader.options?.mapAsArray ?? false);
  }

  fromValues(values: unknown[]): MapColumn {
    const keys: unknown[] = [];
    const vals: unknown[] = [];
    const offsets = new BigUint64Array(values.length);
    let offset = 0n;
    for (let i = 0; i < values.length; i++) {
      const m = values[i];
      if (m == null) {
        offsets[i] = offset;
        continue;
      }
      if (m instanceof Map) {
        for (const [k, v] of m) {
          keys.push(k);
          vals.push(v);
        }
        offset += BigInt(m.size);
      } else if (Array.isArray(m)) {
        for (let j = 0; j < m.length; j++) {
          const pair = m[j];
          if (!Array.isArray(pair) || pair.length !== 2) {
            throw new TypeError(
              `Invalid Map entry at index ${j}: expected [key, value] pair, got ${typeof pair}`,
            );
          }
          keys.push(pair[0]);
          vals.push(pair[1]);
        }
        offset += BigInt(m.length);
      } else if (typeof m === "object" && m !== null) {
        const entries = Object.entries(m);
        for (const [k, v] of entries) {
          keys.push(k);
          vals.push(v);
        }
        offset += BigInt(entries.length);
      } else {
        throw new TypeError(
          `Expected Map, Array, or object for ${this.type}, got ${m === null ? "null" : typeof m}`,
        );
      }
      offsets[i] = offset;
    }
    return new MapColumn(
      this.type,
      offsets,
      this.keyCodec.fromValues(keys),
      this.valCodec.fromValues(vals),
    );
  }

  zeroValue() {
    return new Map();
  }
  // 8 bytes per offset + assume average 3 entries per row
  estimateSize(rows: number) {
    const avgEntries = rows * 3;
    return (
      rows * 8 + this.keyCodec.estimateSize(avgEntries) + this.valCodec.estimateSize(avgEntries)
    );
  }

  readKinds(reader: BufferReader): SerializationNode {
    return readKinds2(reader, this.keyCodec, this.valCodec);
  }
  serializeLiteral(value: unknown): string {
    let entries: [unknown, unknown][];
    if (value instanceof Map) {
      entries = Array.from(value.entries());
    } else if (Array.isArray(value)) {
      entries = value as [unknown, unknown][];
    } else {
      entries = Object.entries(value as object);
    }
    const parts: string[] = [];
    for (const [k, v] of entries) {
      const kLit = nullToLiteral(this.keyCodec.toLiteral(k, true));
      const vLit = nullToLiteral(this.valCodec.toLiteral(v, true));
      parts.push(`${kLit}: ${vLit}`);
    }
    return `{${parts.join(", ")}}`;
  }
}

class TupleCodec extends BaseCodec {
  readonly type: string;
  private elements: { name: string | null; codec: Codec }[];
  private isNamed: boolean;

  constructor(type: string, elements: { name: string | null; codec: Codec }[], isNamed: boolean) {
    super();
    this.type = type;
    this.elements = elements;
    this.isNamed = isNamed;
  }

  writePrefix(writer: BufferWriter, col: Column) {
    const tuple = col as TupleColumn;
    for (let i = 0; i < this.elements.length; i++) {
      this.elements[i].codec.writePrefix?.(writer, tuple.columns[i]);
    }
  }

  readPrefix(reader: BufferReader) {
    for (const e of this.elements) {
      e.codec.readPrefix?.(reader);
    }
  }

  encode(col: Column, sizeHint?: number): Uint8Array {
    const tuple = col as TupleColumn;
    const hint = sizeHint ?? this.estimateSize(col.length);
    const writer = new BufferWriter(hint);
    for (let i = 0; i < this.elements.length; i++) {
      const elemHint = this.elements[i].codec.estimateSize(tuple.columns[i].length);
      writer.write(this.elements[i].codec.encode(tuple.columns[i], elemHint));
    }
    return writer.finish();
  }

  decodeDense(reader: BufferReader, rows: number, state: DeserializerState): Column {
    const cols = this.elements.map((e, i) => e.codec.decode(reader, rows, childState(state, i)));
    return new TupleColumn(
      this.type,
      this.elements.map((e) => ({ name: e.name })),
      cols,
      this.isNamed,
    );
  }

  fromValues(values: unknown[]): TupleColumn {
    // Validate all values have the expected shape
    for (let i = 0; i < values.length; i++) {
      const tuple = values[i];
      if (tuple == null) continue;
      if (this.isNamed && typeof tuple !== "object") {
        throw new TypeError(`Expected object for named tuple ${this.type}, got ${typeof tuple}`);
      }
      if (!this.isNamed && !Array.isArray(tuple)) {
        throw new TypeError(`Expected array for tuple ${this.type}, got ${typeof tuple}`);
      }
    }

    const columns: Column[] = [];
    for (let ei = 0; ei < this.elements.length; ei++) {
      const elem = this.elements[ei];
      const elemValues: unknown[] = new Array(values.length);
      for (let i = 0; i < values.length; i++) {
        const tuple = values[i] as any;
        elemValues[i] = tuple == null ? undefined : this.isNamed ? tuple[elem.name!] : tuple[ei];
      }
      columns.push(elem.codec.fromValues(elemValues));
    }
    return new TupleColumn(
      this.type,
      this.elements.map((e) => ({ name: e.name })),
      columns,
      this.isNamed,
    );
  }

  zeroValue() {
    return [];
  }
  // Sum of all element sizes
  estimateSize(rows: number) {
    return this.elements.reduce((sum, e) => sum + e.codec.estimateSize(rows), 0);
  }

  readKinds(reader: BufferReader): SerializationNode {
    return readKindsMany(
      reader,
      this.elements.map((e) => e.codec),
    );
  }
  serializeLiteral(value: unknown): string {
    if (!this.isNamed && !Array.isArray(value)) {
      throw new TypeError(`Expected array for tuple ${this.type}, got ${typeof value}`);
    }
    const parts: string[] = [];
    if (Array.isArray(value)) {
      for (let i = 0; i < this.elements.length; i++) {
        parts.push(nullToLiteral(this.elements[i].codec.toLiteral(value[i], true)));
      }
    } else if (typeof value === "object") {
      for (const elem of this.elements) {
        const v = (value as Record<string, unknown>)[elem.name!];
        parts.push(nullToLiteral(elem.codec.toLiteral(v, true)));
      }
    } else {
      throw new TypeError(`Expected array or object for ${this.type}, got ${typeof value}`);
    }
    return `(${parts.join(", ")})`;
  }
}

/**
 * Decode groups from reader based on discriminator counts. used by VariantCodec and DynamicCodec
 */
function decodeGroups(
  reader: BufferReader,
  codecs: Codec[],
  counts: Map<number, number>,
  state: DeserializerState,
): Map<number, Column> {
  const groups = new Map<number, Column>();
  for (let i = 0; i < codecs.length; i++) {
    if (counts.has(i)) {
      groups.set(i, codecs[i].decode(reader, counts.get(i)!, childState(state, i)));
    }
  }
  return groups;
}

/**
 * VariantCodec handles Variant(T1, T2, ...) types.
 *
 * Does NOT extend BaseCodec because:
 * - Variant has its own null representation (discriminator=255)
 * - Sparse serialization applies to children, not variant itself
 * - Discriminators are always dense-encoded
 *
 * Children (variant groups) may be sparse-encoded individually.
 */
class VariantCodec implements Codec {
  readonly type: string;
  private typeStrings: string[];
  private codecs: Codec[];
  constructor(type: string, typeStrings: string[], codecs: Codec[]) {
    this.type = type;
    this.typeStrings = typeStrings;
    this.codecs = codecs;
  }

  writePrefix(writer: BufferWriter) {
    writer.writeU64LE(Variant.MODE_BASIC);
  }

  readPrefix(reader: BufferReader) {
    reader.offset += 8; // Skip encoding mode flag
  }

  encode(col: Column, sizeHint?: number): Uint8Array {
    const variant = col as VariantColumn;
    const hint = sizeHint ?? this.estimateSize(col.length);
    const writer = new BufferWriter(hint);
    writer.write(variant.discriminators);
    for (let i = 0; i < this.codecs.length; i++) {
      const group = variant.groups.get(i);
      if (group) {
        const groupHint = this.codecs[i].estimateSize(group.length);
        writer.write(this.codecs[i].encode(group, groupHint));
      }
    }
    return writer.finish();
  }

  decode(reader: BufferReader, rows: number, state: DeserializerState): VariantColumn {
    const discriminators = reader.readTypedArray(Uint8Array, rows);
    const { counts, indices } = countAndIndexDiscriminators(
      discriminators,
      Variant.NULL_DISCRIMINATOR,
    );
    const groups = decodeGroups(reader, this.codecs, counts, state);
    return new VariantColumn(this.type, discriminators, groups, indices);
  }

  fromValues(values: unknown[]): VariantColumn {
    const discriminators = new Uint8Array(values.length);
    const variantValues: unknown[][] = this.codecs.map(() => []);

    for (let i = 0; i < values.length; i++) {
      const v = values[i];
      if (v == null) {
        discriminators[i] = Variant.NULL_DISCRIMINATOR;
      } else if (Array.isArray(v) && v.length === 2 && typeof v[0] === "number") {
        const disc = v[0] as number;
        if (disc < 0 || disc >= this.codecs.length) {
          throw new Error(
            `Invalid Variant discriminator ${disc}, expected 0-${this.codecs.length - 1}`,
          );
        }
        discriminators[i] = disc;
        variantValues[disc].push(v[1]);
      } else {
        const variantIdx = this.findVariantIndex(v, this.typeStrings);
        discriminators[i] = variantIdx;
        variantValues[variantIdx].push(v);
      }
    }

    const groups = new Map<number, Column>();
    for (let vi = 0; vi < this.codecs.length; vi++) {
      if (variantValues[vi].length > 0) {
        groups.set(vi, this.codecs[vi].fromValues(variantValues[vi]));
      }
    }

    return new VariantColumn(this.type, discriminators, groups);
  }

  zeroValue() {
    return null;
  }
  // Discriminators + variant data (assume even distribution)
  estimateSize(rows: number) {
    const perVariant = Math.ceil(rows / this.codecs.length);
    return rows + this.codecs.reduce((sum, c) => sum + c.estimateSize(perVariant), 0);
  }

  findVariantIndex(value: unknown, types: string[]): number {
    // Simple heuristic to match value to variant type
    for (let i = 0; i < types.length; i++) {
      const t = types[i];
      if (t === "String" && typeof value === "string") return i;
      if ((t === "Int64" || t === "UInt64") && typeof value === "bigint") return i;
      if (
        (t.startsWith("Int") || t.startsWith("UInt") || t.startsWith("Float")) &&
        typeof value === "number"
      )
        return i;
      if (t === "Bool" && typeof value === "boolean") return i;
      if ((t === "Date" || t === "DateTime" || t.startsWith("DateTime64")) && value instanceof Date)
        return i;
      if (t.startsWith("Array") && Array.isArray(value)) return i;
      if (
        t.startsWith("Map") &&
        (value instanceof Map || (typeof value === "object" && value !== null))
      )
        return i;
    }
    throw new TypeError(
      `Cannot match value of type ${typeof value} to any variant in ${types.join(" | ")}`,
    );
  }

  readKinds(reader: BufferReader): SerializationNode {
    return readKindsMany(reader, this.codecs);
  }
  toLiteral(value: unknown): string | typeof SQL_NULL {
    if (value == null) return SQL_NULL;
    const idx = this.findVariantIndex(value, this.typeStrings);
    return nullToLiteral(this.codecs[idx].toLiteral(value));
  }
}

/**
 * DynamicCodec handles Dynamic type (runtime-typed values).
 *
 * Does NOT extend BaseCodec because:
 * - Dynamic has its own null representation (discriminator=types.length)
 * - Sparse serialization applies to children, not dynamic itself
 * - Discriminators are always dense-encoded
 *
 * Children (type groups) may be sparse-encoded individually.
 */
class DynamicCodec implements Codec {
  readonly type = "Dynamic";
  private types: string[] = [];
  private codecs: Codec[] = [];
  private readVersion: bigint = Dynamic.VERSION_V3;
  private writeVersion: bigint = Dynamic.VERSION_V3;
  /** Maps original DynamicColumn type indices → compacted V3 write indices (set by writePrefix). */
  private v3IndexMap: Map<number, number> | null = null;

  private isReadV1V2(): boolean {
    return (
      this.readVersion === Dynamic.VERSION_V1_LEGACY ||
      this.readVersion === Dynamic.VERSION_V1 ||
      this.readVersion === Dynamic.VERSION_V2
    );
  }

  private isWriteV1V2(): boolean {
    return (
      this.writeVersion === Dynamic.VERSION_V1_LEGACY ||
      this.writeVersion === Dynamic.VERSION_V1 ||
      this.writeVersion === Dynamic.VERSION_V2
    );
  }

  /** Set the version used for encoding. Default V3, set to V2 for legacy servers. */
  setWriteVersion(v: bigint) {
    this.writeVersion = v;
  }

  writePrefix(writer: BufferWriter, col: Column) {
    const dyn = col as DynamicColumn;

    if (this.isWriteV1V2()) {
      this.types = dyn.types;
      this.codecs = this.types.map((t) => getCodec(t));
      this.writePrefixV2(writer, dyn);
      return;
    }

    // V3 flattened: strip types with empty groups (e.g. SharedVariant from V1/V2 decode)
    // and build a compact index map for discriminator remapping in encode().
    this.v3IndexMap = new Map();
    const activeTypes: string[] = [];
    const origIndices: number[] = []; // new index → original index
    for (let i = 0; i < dyn.types.length; i++) {
      if (dyn.groups.has(i)) {
        this.v3IndexMap.set(i, activeTypes.length);
        origIndices.push(i);
        activeTypes.push(dyn.types[i]);
      }
    }
    this.types = activeTypes;
    this.codecs = this.types.map((t) => getCodec(t));

    writer.writeU64LE(Dynamic.VERSION_V3);
    writer.writeVarint(this.types.length);
    for (const t of this.types) writer.writeString(t);

    for (let i = 0; i < this.types.length; i++) {
      const group = dyn.groups.get(origIndices[i]);
      if (group) this.codecs[i].writePrefix?.(writer, group);
    }
  }

  /** Position where SV was inserted during writePrefixV2, or -1 if SV was already present. */
  private insertedSvPos = -1;

  private writePrefixV2(writer: BufferWriter, dyn: DynamicColumn) {
    // V1/V2 requires SharedVariant "String" at its sorted position in the type list.
    // If SV is already present (V1/V2 decoded column), strip it for wire types.
    // If not present (fromValues column), insert it now and track the position for
    // discriminator/group remapping in encode.
    this.insertedSvPos = -1;
    let svPos = this.findSharedVariantPos();
    if (svPos === -1) {
      // Insert SV at sorted position
      svPos = this.types.findIndex((t) => t >= "String");
      if (svPos === -1) svPos = this.types.length;
      this.types.splice(svPos, 0, "String");
      this.codecs = this.types.map((t) => getCodec(t));
      this.insertedSvPos = svPos;
    }
    const wireTypes = this.types.filter((_, i) => i !== svPos);

    writer.writeU64LE(Dynamic.VERSION_V2);
    writer.writeVarint(wireTypes.length);
    for (const t of wireTypes) writer.writeString(t);

    // Variant mode u64 (BASIC=0)
    writer.writeU64LE(0n);

    // Nested type prefixes (all types including SV, in sorted order)
    for (let i = 0; i < this.codecs.length; i++) {
      const group = dyn.groups.get(i);
      if (group) this.codecs[i].writePrefix?.(writer, group);
    }
  }

  /** Find the SharedVariant position in the type list (sorted "String" insertion point). */
  private findSharedVariantPos(): number {
    // SharedVariant is the "String" that was inserted at sorted position.
    // If there's no "String" type, SV doesn't exist in the list (V3 origin).
    // For V2 encode of V3-origin data, insert SV now.
    const pos = this.types.findIndex((t) => t >= "String");
    if (pos >= 0 && this.types[pos] === "String") return pos;
    return -1; // No SharedVariant present
  }

  readPrefix(reader: BufferReader) {
    this.readVersion = reader.readU64LE();
    this.writeVersion = this.readVersion;

    if (this.isReadV1V2()) {
      this.readPrefixV1V2(reader);
      return;
    }

    if (this.readVersion !== Dynamic.VERSION_V3) {
      throw new Error(`Dynamic: unsupported version V${this.readVersion}`);
    }

    // V3 flattened prefix
    const count = reader.readVarint();
    this.types = [];
    for (let i = 0; i < count; i++) this.types.push(reader.readString());
    this.codecs = this.types.map((t) => getCodec(t));

    for (const c of this.codecs) c.readPrefix?.(reader);
  }

  private readPrefixV1V2(reader: BufferReader) {
    // V1 (legacy=0 or modern=1) has extra max_dynamic_types field
    if (this.readVersion === Dynamic.VERSION_V1_LEGACY || this.readVersion === Dynamic.VERSION_V1) {
      reader.readVarint(); // skip max_dynamic_types
    }

    // Read type names
    const count = reader.readVarint();
    this.types = [];
    for (let i = 0; i < count; i++) this.types.push(reader.readString());

    // V1/V2 inserts implicit SharedVariant (String) at its sorted position.
    // ClickHouse sorts ALL variant types (including SV) alphabetically.
    // SharedVariant sorts before any identical type name.
    const svPos = this.types.findIndex((t) => t >= "String");
    if (svPos === -1) this.types.push("String");
    else this.types.splice(svPos, 0, "String");
    this.codecs = this.types.map((t) => getCodec(t));

    // V1/V2 wraps data in Variant serialization — read and skip variant mode
    reader.readU64LE(); // variant_mode (BASIC=0, COMPACT=1)

    // Read nested type prefixes (SharedVariant String + real types; all no-ops for simple types)
    for (const c of this.codecs) c.readPrefix?.(reader);
  }

  encode(col: Column, sizeHint?: number): Uint8Array {
    const dyn = col as DynamicColumn;
    const hint = sizeHint ?? this.estimateSize(col.length);
    const writer = new BufferWriter(hint);

    if (this.isWriteV1V2()) {
      // V1/V2: u8 discriminators, 0xFF = NULL
      const origNull = dyn.types.length;
      const svIns = this.insertedSvPos; // -1 if SV was already present
      const rows = dyn.discriminators.length;
      const discs = new Uint8Array(rows);
      for (let i = 0; i < rows; i++) {
        const d = dyn.discriminators[i];
        if (d === origNull) {
          discs[i] = 0xff;
        } else if (svIns >= 0 && d >= svIns) {
          discs[i] = d + 1; // shift past inserted SV
        } else {
          discs[i] = d;
        }
      }
      writer.write(discs);
    } else if (this.v3IndexMap && this.v3IndexMap.size !== dyn.types.length) {
      // V3 with remapped indices (V1/V2 decoded data → V3 encode, stripped SharedVariant)
      const nullDisc = this.types.length;
      const origNull = dyn.types.length;
      const rows = dyn.discriminators.length;
      const remapped = new Uint8Array(rows);
      for (let i = 0; i < rows; i++) {
        const d = dyn.discriminators[i];
        remapped[i] = d === origNull ? nullDisc : (this.v3IndexMap.get(d) ?? nullDisc);
      }
      writer.write(remapped);
    } else {
      // V3: discriminators match type list, write as-is
      writer.write(asBytes(dyn.discriminators));
    }

    this.encodeGroups(dyn, writer);
    return writer.finish();
  }

  private encodeGroups(dyn: DynamicColumn, writer: BufferWriter): void {
    // Map codec index → original group key in dyn.groups
    // - v3IndexMap: V3 encode with stripped types (V1/V2 decoded → V3)
    // - insertedSvPos: V1/V2 encode with inserted SV (fromValues → V1/V2)
    const v3Reverse = this.v3IndexMap
      ? new Map([...this.v3IndexMap.entries()].map(([orig, compact]) => [compact, orig]))
      : null;
    for (let i = 0; i < this.codecs.length; i++) {
      let groupKey: number;
      if (v3Reverse) {
        groupKey = v3Reverse.get(i) ?? i;
      } else if (this.insertedSvPos >= 0) {
        // SV was inserted: codec[svPos] = SV (no group), others shift
        if (i < this.insertedSvPos) groupKey = i;
        else if (i === this.insertedSvPos) {
          continue; // SV has no group data
        } else groupKey = i - 1;
      } else {
        groupKey = i;
      }
      const group = dyn.groups.get(groupKey);
      if (group) {
        const groupHint = this.codecs[i].estimateSize(group.length);
        writer.write(this.codecs[i].encode(group, groupHint));
      }
    }
  }

  decode(reader: BufferReader, rows: number, state: DeserializerState): DynamicColumn {
    if (this.isReadV1V2()) {
      return this.decodeV1V2(reader, rows, state);
    }

    // V3: variable-size discriminators
    const nullDisc = this.types.length;
    const discLimit = nullDisc + 1;

    let discriminators: DiscriminatorArray;
    if (discLimit <= 256) discriminators = reader.readTypedArray(Uint8Array, rows);
    else if (discLimit <= 65536) discriminators = reader.readTypedArray(Uint16Array, rows);
    else discriminators = reader.readTypedArray(Uint32Array, rows);

    const { counts, indices } = countAndIndexDiscriminators(discriminators, nullDisc);
    const groups = decodeGroups(reader, this.codecs, counts, state);
    return new DynamicColumn(this.types, discriminators, groups, indices);
  }

  private decodeV1V2(reader: BufferReader, rows: number, state: DeserializerState): DynamicColumn {
    // V1/V2: u8 discriminators, 0xFF = NULL
    const V1V2_NULL = 0xff;
    const raw = reader.readTypedArray(Uint8Array, rows);
    const nullDisc = this.types.length;

    // Remap 0xFF → types.length (our null discriminator convention)
    const discriminators = new Uint8Array(rows);
    for (let i = 0; i < rows; i++) {
      discriminators[i] = raw[i] === V1V2_NULL ? nullDisc : raw[i];
    }

    const { counts, indices } = countAndIndexDiscriminators(discriminators, nullDisc);
    const groups = decodeGroups(reader, this.codecs, counts, state);
    return new DynamicColumn(this.types, discriminators, groups, indices);
  }

  fromValues(values: unknown[]): DynamicColumn {
    // Single pass: collect types, group values, and compute discriminators
    const typeMap = new Map<string, unknown[]>();
    const typeIndex = new Map<string, number>(); // O(1) lookup
    const typeOrder: string[] = [];
    const discriminators = new Uint8Array(values.length);

    for (let i = 0; i < values.length; i++) {
      const v = values[i];
      if (v == null) {
        // Will set null discriminator after we know typeOrder.length
        continue;
      }
      const vType = this.guessType(v);
      let idx = typeIndex.get(vType);
      if (idx === undefined) {
        idx = typeOrder.length;
        typeIndex.set(vType, idx);
        typeOrder.push(vType);
        typeMap.set(vType, []);
      }
      discriminators[i] = idx;
      typeMap.get(vType)!.push(v);
    }

    // Set null discriminators (null disc = typeOrder.length)
    const nullDisc = typeOrder.length;
    for (let i = 0; i < values.length; i++) {
      if (values[i] == null) discriminators[i] = nullDisc;
    }

    const groups = new Map<number, Column>();
    for (let ti = 0; ti < typeOrder.length; ti++) {
      const codec = getCodec(typeOrder[ti]);
      groups.set(ti, codec.fromValues(typeMap.get(typeOrder[ti])!));
    }

    return new DynamicColumn(typeOrder, discriminators, groups);
  }

  zeroValue() {
    return null;
  }
  // Discriminators + type data (assume most values are strings)
  estimateSize(rows: number) {
    // Dynamic can have variable discriminator size but usually 1-2 bytes + data
    return rows * 2 + this.codecs.reduce((sum, c) => sum + c.estimateSize(Math.ceil(rows / 3)), 0);
  }

  guessType(value: unknown): string {
    if (value === null) return "String";
    if (typeof value === "string") return "String";
    if (typeof value === "number") return Number.isInteger(value) ? "Int64" : "Float64";
    if (typeof value === "bigint") return "Int64";
    if (typeof value === "boolean") return "Bool";
    if (value instanceof Date) return "DateTime64(3)";
    if (Array.isArray(value))
      return value.length ? `Array(${this.guessType(value[0])})` : "Array(String)";
    if (typeof value === "object") return "Map(String,String)";
    return "String";
  }

  readKinds(reader: BufferReader): SerializationNode {
    return readKindsMany(reader, this.codecs);
  }
  toLiteral(value: unknown): string | typeof SQL_NULL {
    if (value == null) return SQL_NULL;
    const vType = this.guessType(value);
    const codec = getCodec(vType);
    return nullToLiteral(codec.toLiteral(value));
  }
}

export class JsonCodec implements Codec {
  readonly type = "JSON";
  private typedPaths: { name: string; type: string; codec: Codec }[] = [];
  private typedPathNames: Set<string>;
  private dynamicPaths: string[] = [];
  private dynamicCodecs = new Map<string, DynamicCodec>();
  private readVersion: bigint = JSONFormat.VERSION_V3;
  private writeVersion: bigint = JSONFormat.VERSION_V3;

  constructor(typedPaths: { name: string; type: string }[] = []) {
    this.typedPaths = typedPaths.map((p) => ({
      name: p.name,
      type: p.type,
      codec: getCodec(p.type),
    }));
    this.typedPathNames = new Set(this.typedPaths.map((tp) => tp.name));
  }

  /** Set the version used for encoding. Default V3. */
  setWriteVersion(v: bigint) {
    this.writeVersion = v;
  }

  writePrefix(writer: BufferWriter, col: Column) {
    const json = col as JsonColumn;
    this.dynamicPaths = json.paths.filter((p) => !this.typedPathNames.has(p));

    if (
      this.writeVersion === JSONFormat.VERSION_V1 ||
      this.writeVersion === JSONFormat.VERSION_V2
    ) {
      this.writePrefixV1V2(writer, json);
      return;
    }

    // V3 flattened
    writer.writeU64LE(JSONFormat.VERSION_V3);
    writer.writeVarint(this.dynamicPaths.length);
    for (const p of this.dynamicPaths) writer.writeString(p);

    // Write typed path prefixes first (in schema order)
    for (const tp of this.typedPaths) {
      const pathCol = json.pathColumns.get(tp.name);
      if (pathCol) {
        tp.codec.writePrefix?.(writer, pathCol);
      }
    }

    // Write dynamic path prefixes
    for (const path of this.dynamicPaths) {
      const codec = new DynamicCodec();
      const pathCol = json.pathColumns.get(path)!;
      codec.writePrefix(writer, pathCol);
      this.dynamicCodecs.set(path, codec);
    }
  }

  private writePrefixV1V2(writer: BufferWriter, json: JsonColumn) {
    writer.writeU64LE(this.writeVersion);

    // V1 has extra max_dynamic_paths field
    if (this.writeVersion === JSONFormat.VERSION_V1) {
      writer.writeVarint(this.dynamicPaths.length);
    }

    // Dynamic path names
    writer.writeVarint(this.dynamicPaths.length);
    for (const p of this.dynamicPaths) writer.writeString(p);

    // Typed path prefixes
    for (const tp of this.typedPaths) {
      const pathCol = json.pathColumns.get(tp.name);
      if (pathCol) tp.codec.writePrefix?.(writer, pathCol);
    }

    // Per-dynamic-path Dynamic V2 prefixes
    for (const path of this.dynamicPaths) {
      const codec = new DynamicCodec();
      codec.setWriteVersion(Dynamic.VERSION_V2);
      const pathCol = json.pathColumns.get(path)!;
      codec.writePrefix(writer, pathCol);
      this.dynamicCodecs.set(path, codec);
    }

    // Map(String, String) prefix — no-op for String key/value types
  }

  readPrefix(reader: BufferReader) {
    this.readVersion = reader.readU64LE();
    this.writeVersion = this.readVersion;

    if (this.readVersion === JSONFormat.VERSION_V1 || this.readVersion === JSONFormat.VERSION_V2) {
      this.readPrefixV1V2(reader);
      return;
    }

    if (this.readVersion !== JSONFormat.VERSION_V3) {
      throw new Error(`JSON: only V3 supported, got V${this.readVersion}`);
    }

    // V3 flattened prefix
    const count = reader.readVarint();
    const allPathNames: string[] = [];
    for (let i = 0; i < count; i++) allPathNames.push(reader.readString());

    this.dynamicPaths = allPathNames.filter((p) => !this.typedPathNames.has(p));

    for (const tp of this.typedPaths) tp.codec.readPrefix?.(reader);

    for (const path of this.dynamicPaths) {
      const codec = new DynamicCodec();
      codec.readPrefix(reader);
      this.dynamicCodecs.set(path, codec);
    }
  }

  private readPrefixV1V2(reader: BufferReader) {
    // V1 (version=0) has extra max_dynamic_paths field
    if (this.readVersion === JSONFormat.VERSION_V1) {
      reader.readVarint(); // skip max_dynamic_paths
    }

    // Read dynamic path names
    const count = reader.readVarint();
    this.dynamicPaths = [];
    for (let i = 0; i < count; i++) this.dynamicPaths.push(reader.readString());

    // Read typed path prefixes (alphabetically sorted, same as V3)
    for (const tp of this.typedPaths) tp.codec.readPrefix?.(reader);

    // Read per-dynamic-path Dynamic prefixes (each path is a full Dynamic column)
    for (const path of this.dynamicPaths) {
      const codec = new DynamicCodec();
      codec.readPrefix(reader); // DynamicCodec now handles V1/V2 internally
      this.dynamicCodecs.set(path, codec);
    }

    // Map(String, String) prefix for shared data — no-op for String key/value types
    // (ClickHouse writes empty prefix for Map(String, String))
  }

  encode(col: Column, sizeHint?: number): Uint8Array {
    const json = col as JsonColumn;
    const hint = sizeHint ?? this.estimateSize(col.length);
    const writer = new BufferWriter(hint);

    if (this.readVersion === JSONFormat.VERSION_V1 || this.readVersion === JSONFormat.VERSION_V2) {
      return this.encodeV1V2(json, writer);
    }

    // V3: typed path columns + dynamic path columns
    for (const tp of this.typedPaths) {
      const pathCol = json.pathColumns.get(tp.name);
      if (pathCol) writer.write(tp.codec.encode(pathCol));
    }
    for (const path of this.dynamicPaths) {
      const pathCol = json.pathColumns.get(path)!;
      const pathCodec = this.dynamicCodecs.get(path)!;
      writer.write(pathCodec.encode(pathCol, pathCodec.estimateSize(pathCol.length)));
    }
    return writer.finish();
  }

  private encodeV1V2(json: JsonColumn, writer: BufferWriter): Uint8Array {
    const rows = json.length;

    // 1. Typed path columns (same as V3)
    for (const tp of this.typedPaths) {
      const pathCol = json.pathColumns.get(tp.name);
      if (pathCol) writer.write(tp.codec.encode(pathCol));
    }

    // 2. Dynamic path columns (V2 encoding)
    for (const path of this.dynamicPaths) {
      const pathCol = json.pathColumns.get(path)!;
      const pathCodec = this.dynamicCodecs.get(path)!;
      writer.write(pathCodec.encode(pathCol, pathCodec.estimateSize(pathCol.length)));
    }

    // 3. Shared data Map(String, String) — empty map (no overflow paths)
    //    Format: offsets (BigUint64Array all zeros) + 0 keys + 0 values
    const offsets = new BigUint64Array(rows); // all 0n = no entries per row
    writer.write(new Uint8Array(offsets.buffer, offsets.byteOffset, offsets.byteLength));
    // No keys or values to write (0 total entries)

    return writer.finish();
  }

  decode(reader: BufferReader, rows: number, state: DeserializerState): JsonColumn {
    if (this.readVersion === JSONFormat.VERSION_V1 || this.readVersion === JSONFormat.VERSION_V2) {
      return this.decodeV1V2(reader, rows, state);
    }

    // V3 flattened decode
    const pathColumns = new Map<string, Column>();
    let idx = 0;

    // Decode typed path columns first (in schema order)
    for (const tp of this.typedPaths) {
      pathColumns.set(tp.name, tp.codec.decode(reader, rows, childState(state, idx++)));
    }

    // Decode dynamic path columns
    for (const path of this.dynamicPaths) {
      pathColumns.set(
        path,
        this.dynamicCodecs.get(path)!.decode(reader, rows, childState(state, idx++)),
      );
    }

    // Combine all paths
    const allPaths = [...this.typedPaths.map((tp) => tp.name), ...this.dynamicPaths];
    return new JsonColumn(allPaths, pathColumns, rows);
  }

  private decodeV1V2(reader: BufferReader, rows: number, state: DeserializerState): JsonColumn {
    const pathColumns = new Map<string, Column>();
    let idx = 0;

    // 1. Typed path columns (same as V3)
    for (const tp of this.typedPaths) {
      pathColumns.set(tp.name, tp.codec.decode(reader, rows, childState(state, idx++)));
    }

    // 2. Per-dynamic-path Dynamic columns
    for (const path of this.dynamicPaths) {
      pathColumns.set(
        path,
        this.dynamicCodecs.get(path)!.decode(reader, rows, childState(state, idx++)),
      );
    }

    // 3. Shared data: Map(String, String) — read manually for binary value handling
    //    Format: offsets (BigUint64Array) + keys (String col) + values (raw bytes col)
    const offsets = reader.readTypedArray(BigUint64Array, rows);
    const totalEntries = rows > 0 ? Number(offsets[rows - 1]) : 0;

    // Read keys (path names) as strings
    const keys: string[] = new Array(totalEntries);
    for (let i = 0; i < totalEntries; i++) keys[i] = reader.readString();

    // Read values as raw byte arrays (NOT UTF-8 decoded — they're binary type-encoded)
    const valueBufs: Uint8Array[] = new Array(totalEntries);
    for (let i = 0; i < totalEntries; i++) {
      const len = reader.readVarint();
      valueBufs[i] = reader.readBytes(len);
    }

    // 4. Decode shared data: collect sparse entries per path, then materialize
    const sharedSparse = new Map<string, Map<number, unknown>>();
    let prevOffset = 0;
    for (let row = 0; row < rows; row++) {
      const end = Number(offsets[row]);
      for (let e = prevOffset; e < end; e++) {
        const path = keys[e];
        let rowMap = sharedSparse.get(path);
        if (!rowMap) {
          rowMap = new Map();
          sharedSparse.set(path, rowMap);
        }
        rowMap.set(row, decodeBinaryValue(valueBufs[e]));
      }
      prevOffset = end;
    }

    // Materialize sparse entries into DynamicColumns (not DataColumns) so
    // the encode path can treat all dynamic paths uniformly.
    const sharedPaths: string[] = [];
    const dynCodec = new DynamicCodec();
    for (const [path, rowMap] of sharedSparse) {
      if (!pathColumns.has(path)) {
        sharedPaths.push(path);
        const values = new Array(rows).fill(null);
        for (const [row, val] of rowMap) values[row] = val;
        pathColumns.set(path, dynCodec.fromValues(values));
      }
    }

    const allPaths = [
      ...this.typedPaths.map((tp) => tp.name),
      ...this.dynamicPaths,
      ...sharedPaths,
    ];
    return new JsonColumn(allPaths, pathColumns, rows);
  }

  fromValues(values: unknown[]): JsonColumn {
    const extractPath = (path: string) =>
      values.map((v) =>
        v && typeof v === "object" ? ((v as Record<string, unknown>)[path] ?? null) : null,
      );

    const pathColumns = new Map<string, Column>();
    for (const tp of this.typedPaths) {
      pathColumns.set(tp.name, tp.codec.fromValues(extractPath(tp.name)));
    }

    const dynamicPaths = this.discoverDynamicPaths(values);
    const dynCodec = new DynamicCodec();
    for (const path of dynamicPaths) {
      pathColumns.set(path, dynCodec.fromValues(extractPath(path)));
    }

    return new JsonColumn([...this.typedPathNames, ...dynamicPaths], pathColumns, values.length);
  }

  private discoverDynamicPaths(values: unknown[]): string[] {
    // Must scan all rows - different rows can have different dynamic keys
    const paths = new Set<string>();
    for (const v of values) {
      if (v && typeof v === "object" && !Array.isArray(v)) {
        for (const key of Object.keys(v)) {
          if (!this.typedPathNames.has(key)) paths.add(key);
        }
      }
    }
    return [...paths].sort();
  }

  zeroValue() {
    return {};
  }
  // JSON columns have per-path Dynamic columns; estimate is sum of path estimates
  // Since we don't know paths until readPrefix, use Dynamic's estimate per expected path
  estimateSize(rows: number) {
    return rows * 32;
  } // Conservative: ~32 bytes per row

  readKinds(reader: BufferReader): SerializationNode {
    // Combine typed paths (from schema) and dynamic paths (from readPrefix)
    const allCodecs = [...this.typedPaths.map((tp) => tp.codec), ...this.dynamicCodecs.values()];
    return readKindsMany(reader, allCodecs);
  }
  toLiteral(value: unknown): string | typeof SQL_NULL {
    if (value == null) return SQL_NULL;
    return `'${escapeString(JSON.stringify(value), true)}'`;
  }
}

// Extracts the content between the outermost parentheses: "Array(Int32)" → "Int32"
function extractTypeArgs(type: string): string {
  return type.substring(type.indexOf("(") + 1, type.lastIndexOf(")"));
}

/**
 * Parse typed paths from a JSON type string.
 * Reuses parseTupleElements for the "name Type" parsing, filters out config params.
 */
function parseJsonTypedPaths(type: string): { name: string; type: string }[] {
  if (type === "JSON" || !type.includes("(")) return [];
  const inner = extractTypeArgs(type);
  if (!inner) return [];

  // Reuse parseTupleElements which handles "name Type" format
  const elements = parseTupleElements(inner);

  // Filter to only named elements, excluding config params and SKIP directives
  return elements
    .filter(
      (el): el is { name: string; type: string } =>
        el.name !== null && !el.type.includes("=") && !el.name.toUpperCase().startsWith("SKIP"),
    )
    .map((el) => ({ name: el.name, type: el.type }));
}

function createCodec(type: string): Codec {
  if (type.startsWith("Nullable")) return new NullableCodec(type, getCodec(extractTypeArgs(type)));
  if (type.startsWith("Array")) return new ArrayCodec(type, getCodec(extractTypeArgs(type)));
  if (type.startsWith("LowCardinality"))
    return new LowCardinalityCodec(type, getCodec(extractTypeArgs(type)));
  if (type.startsWith("Map")) {
    const [k, v] = parseTypeList(extractTypeArgs(type));
    return new MapCodec(type, getCodec(k), getCodec(v));
  }
  if (type.startsWith("Tuple")) {
    const args = parseTupleElements(extractTypeArgs(type));
    const isNamed = args[0].name !== null;
    return new TupleCodec(
      type,
      args.map((a) => ({ name: a.name, codec: getCodec(a.type) })),
      isNamed,
    );
  }
  // Nested is syntactic sugar for Array(Tuple(...))
  // e.g., Nested(id UInt64, val String) -> Array(Tuple(UInt64, String))
  if (type.startsWith("Nested")) {
    const args = parseTupleElements(extractTypeArgs(type));
    const tupleType = `Tuple(${args.map((a) => `${a.name} ${a.type}`).join(", ")})`;
    const tupleCodec = new TupleCodec(
      tupleType,
      args.map((a) => ({ name: a.name, codec: getCodec(a.type) })),
      true,
    );
    return new ArrayCodec(type, tupleCodec);
  }
  if (type.startsWith("Variant")) {
    const innerTypes = parseTypeList(extractTypeArgs(type));
    return new VariantCodec(type, innerTypes, innerTypes.map(getCodec));
  }
  if (type === "Dynamic") return new DynamicCodec();
  if (type === "JSON" || type.startsWith("JSON")) {
    const typedPaths = parseJsonTypedPaths(type);
    return new JsonCodec(typedPaths);
  }

  if (type.startsWith("FixedString"))
    return new FixedStringCodec(parseInt(extractTypeArgs(type), 10));

  if (type.startsWith("DateTime64")) {
    const precisionMatch = type.match(/DateTime64\((\d+)/);
    const precision = precisionMatch ? parseInt(precisionMatch[1], 10) : 3;
    return new DateTime64Codec(type, precision);
  }

  // DateTime('timezone') - timezone is metadata, codec is same as DateTime
  if (type.startsWith("DateTime(")) return new EpochCodec(type, Uint32Array, MS_PER_SECOND);

  // Geo Types
  if (type === "Point")
    return new TupleCodec(
      type,
      [
        { name: null, codec: getCodec("Float64") },
        { name: null, codec: getCodec("Float64") },
      ],
      false,
    );
  if (type === "Ring") return new ArrayCodec(type, getCodec("Point"));
  if (type === "Polygon") return new ArrayCodec(type, getCodec("Ring"));
  if (type === "MultiPolygon") return new ArrayCodec(type, getCodec("Polygon"));

  switch (type) {
    case "UInt8":
      return new NumericCodec(type, Uint8Array, toUInt8);
    case "Int8":
      return new NumericCodec(type, Int8Array, toInt8);
    case "UInt16":
      return new NumericCodec(type, Uint16Array, toUInt16);
    case "Int16":
      return new NumericCodec(type, Int16Array, toInt16);
    case "UInt32":
      return new NumericCodec(type, Uint32Array, toUInt32);
    case "Int32":
      return new NumericCodec(type, Int32Array, toInt32);
    case "UInt64":
      return new NumericCodec(type, BigUint64Array, toUInt64);
    case "Int64":
      return new NumericCodec(type, BigInt64Array, toInt64);
    case "Float32":
      return new NumericCodec(type, Float32Array, toNumber);
    case "Float64":
      return new NumericCodec(type, Float64Array, toNumber);
    case "Bool":
      return new NumericCodec(type, Uint8Array, toBool);
    case "Date":
      return new EpochCodec(type, Uint16Array, MS_PER_DAY);
    case "Date32":
      return new EpochCodec(type, Int32Array, MS_PER_DAY);
    case "DateTime":
      return new EpochCodec(type, Uint32Array, MS_PER_SECOND);
    case "String":
      return new StringCodec();
    case "UUID":
      return new UUIDCodec();
    case "IPv4":
      return new IPv4Codec();
    case "IPv6":
      return new IPv6Codec();
    case "Int128":
      return new BigIntCodec(type, 16, true);
    case "UInt128":
      return new BigIntCodec(type, 16, false);
    case "Int256":
      return new BigIntCodec(type, 32, true);
    case "UInt256":
      return new BigIntCodec(type, 32, false);
  }

  if (type.startsWith("Enum")) return new EnumCodec(type);

  // Decimal types
  if (type.startsWith("Decimal")) return new DecimalCodec(type);

  throw new Error(`Unknown type: ${type}`);
}

// LRU codec cache. JS Maps iterate in insertion order, so deleting and
// re-inserting moves a key to the end. Evicting map.keys().next() drops oldest.
const CODEC_CACHE = new Map<string, Codec>();
const CODEC_CACHE_LIMIT = 131072;

export function getCodec(type: string): Codec {
  const cached = CODEC_CACHE.get(type);
  if (cached !== undefined) {
    CODEC_CACHE.delete(type);
    CODEC_CACHE.set(type, cached);
    return cached;
  }

  const codec = createCodec(type);
  CODEC_CACHE.set(type, codec);

  if (CODEC_CACHE.size > CODEC_CACHE_LIMIT) {
    CODEC_CACHE.delete(CODEC_CACHE.keys().next().value!);
  }

  return codec;
}
