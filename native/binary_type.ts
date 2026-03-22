/**
 * Binary type encoding/decoding for shared data in JSON/Object V1/V2 columns.
 *
 * Shared data values are encoded as [type_byte][value_bytes] where the type byte
 * (from DataTypesBinaryEncoding.h) identifies the ClickHouse type and is followed
 * by a type-specific binary payload. Container types (Array, Nullable, Map, Tuple)
 * encode recursively.
 */

// Type byte constants from ClickHouse's DataTypesBinaryEncoding.h
const TypeByte = {
  Nothing: 0x00,
  UInt8: 0x01,
  UInt16: 0x02,
  UInt32: 0x03,
  UInt64: 0x04,
  UInt128: 0x05,
  UInt256: 0x06,
  Int8: 0x07,
  Int16: 0x08,
  Int32: 0x09,
  Int64: 0x0a,
  Int128: 0x0b,
  Int256: 0x0c,
  Float32: 0x0d,
  Float64: 0x0e,
  Date: 0x0f,
  Date32: 0x10,
  DateTime: 0x11,
  DateTime64: 0x12,
  String: 0x15,
  FixedString: 0x16,
  UUID: 0x1d,
  Array: 0x1e,
  Tuple: 0x1f,
  Nullable: 0x23,
  IPv4: 0x25,
  IPv6: 0x26,
  Map: 0x27,
  Bool: 0x2d,
} as const;

// Reverse mapping: type name → type byte (built lazily for encode)
const typeNameToByte: Record<string, number> = {
  Nothing: TypeByte.Nothing,
  UInt8: TypeByte.UInt8,
  UInt16: TypeByte.UInt16,
  UInt32: TypeByte.UInt32,
  UInt64: TypeByte.UInt64,
  UInt128: TypeByte.UInt128,
  UInt256: TypeByte.UInt256,
  Int8: TypeByte.Int8,
  Int16: TypeByte.Int16,
  Int32: TypeByte.Int32,
  Int64: TypeByte.Int64,
  Int128: TypeByte.Int128,
  Int256: TypeByte.Int256,
  Float32: TypeByte.Float32,
  Float64: TypeByte.Float64,
  Date: TypeByte.Date,
  Date32: TypeByte.Date32,
  String: TypeByte.String,
  UUID: TypeByte.UUID,
  IPv4: TypeByte.IPv4,
  IPv6: TypeByte.IPv6,
  Bool: TypeByte.Bool,
};

// ---------- Cursor: lightweight read/write over Uint8Array ----------

class Cursor {
  readonly data: Uint8Array;
  readonly view: DataView;
  offset: number;

  constructor(data: Uint8Array, offset = 0) {
    this.data = data;
    this.view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    this.offset = offset;
  }

  readU8(): number {
    return this.data[this.offset++];
  }
  readI8(): number {
    const v = this.view.getInt8(this.offset);
    this.offset += 1;
    return v;
  }
  readU16LE(): number {
    const v = this.view.getUint16(this.offset, true);
    this.offset += 2;
    return v;
  }
  readI16LE(): number {
    const v = this.view.getInt16(this.offset, true);
    this.offset += 2;
    return v;
  }
  readU32LE(): number {
    const v = this.view.getUint32(this.offset, true);
    this.offset += 4;
    return v;
  }
  readI32LE(): number {
    const v = this.view.getInt32(this.offset, true);
    this.offset += 4;
    return v;
  }
  readU64LE(): bigint {
    const v = this.view.getBigUint64(this.offset, true);
    this.offset += 8;
    return v;
  }
  readI64LE(): bigint {
    const v = this.view.getBigInt64(this.offset, true);
    this.offset += 8;
    return v;
  }
  readF32LE(): number {
    const v = this.view.getFloat32(this.offset, true);
    this.offset += 4;
    return v;
  }
  readF64LE(): number {
    const v = this.view.getFloat64(this.offset, true);
    this.offset += 8;
    return v;
  }
  readBytes(n: number): Uint8Array {
    const slice = this.data.subarray(this.offset, this.offset + n);
    this.offset += n;
    return slice;
  }
  /** LEB128 variable-length unsigned integer: 7 data bits per byte, MSB = continuation. */
  readVarUInt(): number {
    let value = 0;
    let shift = 0;
    while (true) {
      const byte = this.data[this.offset++];
      value |= (byte & 0x7f) << shift;
      if ((byte & 0x80) === 0) return value;
      shift += 7;
    }
  }
  readString(): string {
    const len = this.readVarUInt();
    const bytes = this.data.subarray(this.offset, this.offset + len);
    this.offset += len;
    return TEXT_DECODER.decode(bytes);
  }
}

import { inferClickHouseType } from "./coercion.ts";
import { parseTypeList, TEXT_DECODER, TEXT_ENCODER } from "./types.ts";

// ---------- Type decoding: type byte → CH type name string ----------

// Scalar types: tag byte → type name (no additional data to read)
const SCALAR_TYPES = new Map<number, string>([
  [TypeByte.Nothing, "Nothing"],
  [TypeByte.UInt8, "UInt8"],
  [TypeByte.UInt16, "UInt16"],
  [TypeByte.UInt32, "UInt32"],
  [TypeByte.UInt64, "UInt64"],
  [TypeByte.UInt128, "UInt128"],
  [TypeByte.UInt256, "UInt256"],
  [TypeByte.Int8, "Int8"],
  [TypeByte.Int16, "Int16"],
  [TypeByte.Int32, "Int32"],
  [TypeByte.Int64, "Int64"],
  [TypeByte.Int128, "Int128"],
  [TypeByte.Int256, "Int256"],
  [TypeByte.Float32, "Float32"],
  [TypeByte.Float64, "Float64"],
  [TypeByte.Date, "Date"],
  [TypeByte.Date32, "Date32"],
  [TypeByte.String, "String"],
  [TypeByte.UUID, "UUID"],
  [TypeByte.IPv4, "IPv4"],
  [TypeByte.IPv6, "IPv6"],
  [TypeByte.Bool, "Bool"],
]);

/** Decode a binary-encoded ClickHouse type from a cursor (tag byte from DataTypesBinaryEncoding.h). */
function decodeType(cursor: Cursor): string {
  const tag = cursor.readU8(); // type tag byte

  const scalar = SCALAR_TYPES.get(tag);
  if (scalar) return scalar;

  // Container and parameterized types (need recursive reads after the tag)
  switch (tag) {
    case TypeByte.DateTime: {
      const tz = cursor.readString(); // timezone string (empty = UTC)
      return tz ? `DateTime('${tz}')` : "DateTime";
    }
    case TypeByte.DateTime64: {
      const precision = cursor.readU8(); // precision 0-9
      const tz = cursor.readString(); // timezone string
      return tz ? `DateTime64(${precision}, '${tz}')` : `DateTime64(${precision})`;
    }
    case TypeByte.FixedString:
      return `FixedString(${cursor.readVarUInt()})`; // byte length
    case TypeByte.Array:
      return `Array(${decodeType(cursor)})`;
    case TypeByte.Nullable:
      return `Nullable(${decodeType(cursor)})`;
    case TypeByte.Map:
      return `Map(${decodeType(cursor)}, ${decodeType(cursor)})`;
    case TypeByte.Tuple: {
      const elements: string[] = [];
      for (let n = cursor.readVarUInt(); n > 0; n--) elements.push(decodeType(cursor));
      return `Tuple(${elements.join(", ")})`;
    }
    default:
      throw new Error(`Unknown binary type byte: 0x${tag.toString(16).padStart(2, "0")}`);
  }
}

// ---------- Value decoding ----------

// Scalar value decoders: type name → read function (one fixed-size read per type)
const SCALAR_DECODERS = new Map<string, (cursor: Cursor) => unknown>([
  ["Nothing", () => null],
  ["Bool", (cursor) => cursor.readU8() !== 0],
  ["UInt8", (cursor) => cursor.readU8()],
  ["UInt16", (cursor) => cursor.readU16LE()],
  ["UInt32", (cursor) => cursor.readU32LE()],
  ["UInt64", (cursor) => cursor.readU64LE()],
  ["Int8", (cursor) => cursor.readI8()],
  ["Int16", (cursor) => cursor.readI16LE()],
  ["Int32", (cursor) => cursor.readI32LE()],
  ["Int64", (cursor) => cursor.readI64LE()],
  ["Float32", (cursor) => cursor.readF32LE()],
  ["Float64", (cursor) => cursor.readF64LE()],
  ["Date", (cursor) => cursor.readU16LE()], // days since epoch
  ["Date32", (cursor) => cursor.readI32LE()], // days since epoch (signed)
  ["String", (cursor) => TEXT_DECODER.decode(cursor.readBytes(cursor.readVarUInt()))],
  ["UUID", (cursor) => cursor.readBytes(16).slice()],
  ["IPv4", (cursor) => cursor.readU32LE()],
  ["IPv6", (cursor) => cursor.readBytes(16).slice()],
  ["UInt128", (cursor) => cursor.readBytes(16).slice()],
  ["Int128", (cursor) => cursor.readBytes(16).slice()],
  ["UInt256", (cursor) => cursor.readBytes(32).slice()],
  ["Int256", (cursor) => cursor.readBytes(32).slice()],
]);

function decodeValue(cursor: Cursor, rawTypeName: string): unknown {
  const typeName = rawTypeName.trim();

  const scalar = SCALAR_DECODERS.get(typeName);
  if (scalar) return scalar(cursor);

  // DateTime variants (with optional timezone parameter)
  if (typeName === "DateTime" || typeName.startsWith("DateTime(")) return cursor.readU32LE();
  if (typeName.startsWith("DateTime64(")) return cursor.readI64LE(); // ticks
  if (typeName.startsWith("FixedString("))
    return cursor.readBytes(parseInt(typeName.slice(12, -1), 10)).slice();

  // Container types (recursive decode)
  if (typeName.startsWith("Array(")) {
    const inner = typeName.slice(6, -1);
    const count = cursor.readVarUInt(); // element count
    const elements: unknown[] = new Array(count);
    for (let i = 0; i < count; i++) elements[i] = decodeValue(cursor, inner);
    return elements;
  }
  if (typeName.startsWith("Nullable(")) {
    if (cursor.readU8() !== 0) return null; // null indicator: 0=value, nonzero=null
    return decodeValue(cursor, typeName.slice(9, -1));
  }
  if (typeName.startsWith("Tuple(")) {
    const elementTypes = parseTypeList(typeName.slice(6, -1));
    const elements: unknown[] = new Array(elementTypes.length);
    for (let i = 0; i < elementTypes.length; i++)
      elements[i] = decodeValue(cursor, elementTypes[i]);
    return elements;
  }
  if (typeName.startsWith("Map(")) {
    const [keyType, valType] = parseTypeList(typeName.slice(4, -1));
    const count = cursor.readVarUInt(); // entry count
    const keys: unknown[] = new Array(count);
    const values: unknown[] = new Array(count);
    for (let i = 0; i < count; i++) keys[i] = decodeValue(cursor, keyType);
    for (let i = 0; i < count; i++) values[i] = decodeValue(cursor, valType);
    return { keys, values };
  }

  throw new Error(`Unsupported type for binary value decode: ${typeName}`);
}

// ---------- Public API ----------

/**
 * Decode a binary-encoded value from shared data.
 * Input: [type_byte(s)][value_bytes]
 * Returns the decoded JS value.
 */
export function decodeBinaryValue(data: Uint8Array): unknown {
  const cursor = new Cursor(data);
  const typeName = decodeType(cursor);
  return decodeValue(cursor, typeName);
}

// ---------- Value encoding ----------

/**
 * Encode a JS value to binary format with type byte prefix.
 * Output: [type_byte(s)][value_bytes]
 */
export function encodeBinaryValue(value: unknown): Uint8Array {
  const parts: number[] = [];
  // Binary encoding uses "Nothing" for null; inferClickHouseType returns "String"
  const typeName = value == null ? "Nothing" : inferClickHouseType(value);
  encodeTypeBytes(parts, typeName);
  encodeValueBytes(parts, value, typeName);
  return new Uint8Array(parts);
}

/** Write type tag byte(s) for binary type encoding. Recursive for containers. */
function encodeTypeBytes(out: number[], rawTypeName: string): void {
  const typeName = rawTypeName.trim();

  const simple = typeNameToByte[typeName];
  if (simple !== undefined) {
    out.push(simple); // single tag byte for scalar types
    return;
  }

  if (typeName === "DateTime" || typeName.startsWith("DateTime(")) {
    out.push(TypeByte.DateTime, 0); // [tag][timezone_len=0]
    return;
  }
  if (typeName.startsWith("DateTime64(")) {
    out.push(TypeByte.DateTime64);
    const [precisionStr] = typeName.slice(11, -1).split(",");
    out.push(parseInt(precisionStr, 10), 0); // [precision_u8][timezone_len=0]
    return;
  }
  if (typeName.startsWith("FixedString(")) {
    out.push(TypeByte.FixedString);
    pushVarUInt(out, parseInt(typeName.slice(12, -1), 10)); // [tag][byte_length_varint]
    return;
  }
  if (typeName.startsWith("Array(")) {
    out.push(TypeByte.Array);
    encodeTypeBytes(out, typeName.slice(6, -1)); // [tag][element_type...]
    return;
  }
  if (typeName.startsWith("Nullable(")) {
    out.push(TypeByte.Nullable);
    encodeTypeBytes(out, typeName.slice(9, -1)); // [tag][inner_type...]
    return;
  }
  if (typeName.startsWith("Map(")) {
    out.push(TypeByte.Map);
    const [keyType, valType] = parseTypeList(typeName.slice(4, -1));
    encodeTypeBytes(out, keyType); // [tag][key_type...][val_type...]
    encodeTypeBytes(out, valType);
    return;
  }
  if (typeName.startsWith("Tuple(")) {
    out.push(TypeByte.Tuple);
    const elementTypes = parseTypeList(typeName.slice(6, -1));
    pushVarUInt(out, elementTypes.length); // [tag][count_varint][type_0...][type_1...]
    for (const elemType of elementTypes) encodeTypeBytes(out, elemType);
    return;
  }

  throw new Error(`Cannot encode binary type: ${typeName}`);
}

/** Write value bytes for binary value encoding (type-specific layout). */
function encodeValueBytes(out: number[], value: unknown, rawTypeName: string): void {
  const typeName = rawTypeName.trim();
  if (typeName === "Nothing") return;
  if (typeName === "Bool") {
    out.push(value ? 1 : 0);
    return;
  }
  if (typeName === "UInt8" || typeName === "Int8") {
    out.push((value as number) & 0xff);
    return;
  }
  if (typeName === "UInt16" || typeName === "Int16") {
    pushU16LE(out, value as number);
    return;
  }
  if (typeName === "UInt32" || typeName === "Int32") {
    pushU32LE(out, value as number);
    return;
  }
  if (typeName === "UInt64" || typeName === "Int64") {
    const bigintVal = typeof value === "bigint" ? value : BigInt(Math.trunc(value as number));
    pushI64LE(out, bigintVal);
    return;
  }
  if (typeName === "Float32") {
    const buffer = new ArrayBuffer(4);
    new DataView(buffer).setFloat32(0, value as number, true);
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < 4; i++) out.push(bytes[i]);
    return;
  }
  if (typeName === "Float64") {
    const buffer = new ArrayBuffer(8);
    new DataView(buffer).setFloat64(0, value as number, true);
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < 8; i++) out.push(bytes[i]);
    return;
  }
  if (typeName === "Date") {
    pushU16LE(out, value as number);
    return;
  }
  if (typeName === "Date32") {
    pushU32LE(out, value as number);
    return;
  }
  if (typeName === "DateTime" || typeName.startsWith("DateTime(")) {
    if (value instanceof Date) {
      pushU32LE(out, Math.floor(value.getTime() / 1000));
    } else {
      pushU32LE(out, value as number);
    }
    return;
  }
  if (typeName.startsWith("DateTime64(")) {
    pushI64LE(out, typeof value === "bigint" ? value : BigInt(value as number));
    return;
  }
  if (typeName === "String") {
    const str = typeof value === "string" ? value : String(value);
    const encoded = TEXT_ENCODER.encode(str);
    pushVarUInt(out, encoded.length); // [varint_len][utf8_bytes]
    for (let i = 0; i < encoded.length; i++) out.push(encoded[i]);
    return;
  }
  if (typeName.startsWith("Array(")) {
    const arrayValues = value as unknown[];
    pushVarUInt(out, arrayValues.length); // [count_varint][element_0...][element_1...]
    for (const elem of arrayValues) encodeValueBytes(out, elem, typeName.slice(6, -1));
    return;
  }
  if (typeName.startsWith("Nullable(")) {
    if (value === null || value === undefined) {
      out.push(1); // null indicator: 1 = null
      return;
    }
    out.push(0); // null indicator: 0 = value follows
    encodeValueBytes(out, value, typeName.slice(9, -1));
    return;
  }

  throw new Error(`Cannot encode binary value for type: ${typeName}`);
}

// ---------- Little-endian write helpers (to number[]) ----------

function pushU16LE(out: number[], v: number): void {
  out.push(v & 0xff, (v >> 8) & 0xff);
}

function pushU32LE(out: number[], v: number): void {
  out.push(v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >> 24) & 0xff);
}

function pushI64LE(out: number[], v: bigint): void {
  const buf = new ArrayBuffer(8);
  new DataView(buf).setBigInt64(0, v, true);
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < 8; i++) out.push(bytes[i]);
}

function pushVarUInt(out: number[], value: number): void {
  let v = value;
  while (v >= 0x80) {
    out.push((v & 0x7f) | 0x80);
    v >>>= 7;
  }
  out.push(v);
}
