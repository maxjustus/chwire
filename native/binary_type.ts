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

/** Decode a binary-encoded ClickHouse type from a cursor. */
function decodeType(c: Cursor): string {
  const tag = c.readU8();

  const scalar = SCALAR_TYPES.get(tag);
  if (scalar) return scalar;

  // Container and parameterized types (need recursive reads)
  switch (tag) {
    case TypeByte.DateTime: {
      const tz = c.readString();
      return tz ? `DateTime('${tz}')` : "DateTime";
    }
    case TypeByte.DateTime64: {
      const precision = c.readU8();
      const tz = c.readString();
      return tz ? `DateTime64(${precision}, '${tz}')` : `DateTime64(${precision})`;
    }
    case TypeByte.FixedString:
      return `FixedString(${c.readVarUInt()})`;
    case TypeByte.Array:
      return `Array(${decodeType(c)})`;
    case TypeByte.Nullable:
      return `Nullable(${decodeType(c)})`;
    case TypeByte.Map:
      return `Map(${decodeType(c)}, ${decodeType(c)})`;
    case TypeByte.Tuple: {
      const elements: string[] = [];
      for (let n = c.readVarUInt(); n > 0; n--) elements.push(decodeType(c));
      return `Tuple(${elements.join(", ")})`;
    }
    default:
      throw new Error(`Unknown binary type byte: 0x${tag.toString(16).padStart(2, "0")}`);
  }
}

// ---------- Value decoding ----------

// Scalar value decoders: type name → read function
const SCALAR_DECODERS = new Map<string, (c: Cursor) => unknown>([
  ["Nothing", () => null],
  ["Bool", (c) => c.readU8() !== 0],
  ["UInt8", (c) => c.readU8()],
  ["UInt16", (c) => c.readU16LE()],
  ["UInt32", (c) => c.readU32LE()],
  ["UInt64", (c) => c.readU64LE()],
  ["Int8", (c) => c.readI8()],
  ["Int16", (c) => c.readI16LE()],
  ["Int32", (c) => c.readI32LE()],
  ["Int64", (c) => c.readI64LE()],
  ["Float32", (c) => c.readF32LE()],
  ["Float64", (c) => c.readF64LE()],
  ["Date", (c) => c.readU16LE()],
  ["Date32", (c) => c.readI32LE()],
  ["String", (c) => TEXT_DECODER.decode(c.readBytes(c.readVarUInt()))],
  ["UUID", (c) => c.readBytes(16).slice()],
  ["IPv4", (c) => c.readU32LE()],
  ["IPv6", (c) => c.readBytes(16).slice()],
  ["UInt128", (c) => c.readBytes(16).slice()],
  ["Int128", (c) => c.readBytes(16).slice()],
  ["UInt256", (c) => c.readBytes(32).slice()],
  ["Int256", (c) => c.readBytes(32).slice()],
]);

function decodeValue(c: Cursor, typeName: string): unknown {
  const t = typeName.trim();

  const scalar = SCALAR_DECODERS.get(t);
  if (scalar) return scalar(c);

  // DateTime variants (with optional timezone)
  if (t === "DateTime" || t.startsWith("DateTime(")) return c.readU32LE();
  if (t.startsWith("DateTime64(")) return c.readI64LE();
  if (t.startsWith("FixedString(")) return c.readBytes(parseInt(t.slice(12, -1), 10)).slice();

  // Container types (recursive)
  if (t.startsWith("Array(")) {
    const inner = t.slice(6, -1);
    const count = c.readVarUInt();
    const elements: unknown[] = new Array(count);
    for (let i = 0; i < count; i++) elements[i] = decodeValue(c, inner);
    return elements;
  }
  if (t.startsWith("Nullable(")) {
    if (c.readU8() !== 0) return null;
    return decodeValue(c, t.slice(9, -1));
  }
  if (t.startsWith("Tuple(")) {
    const types = parseTypeList(t.slice(6, -1));
    const elements: unknown[] = new Array(types.length);
    for (let i = 0; i < types.length; i++) elements[i] = decodeValue(c, types[i]);
    return elements;
  }
  if (t.startsWith("Map(")) {
    const [keyType, valType] = parseTypeList(t.slice(4, -1));
    const count = c.readVarUInt();
    const keys: unknown[] = new Array(count);
    const values: unknown[] = new Array(count);
    for (let i = 0; i < count; i++) keys[i] = decodeValue(c, keyType);
    for (let i = 0; i < count; i++) values[i] = decodeValue(c, valType);
    return { keys, values };
  }

  throw new Error(`Unsupported type for binary value decode: ${t}`);
}

// ---------- Public API ----------

/**
 * Decode a binary-encoded value from shared data.
 * Input: [type_byte(s)][value_bytes]
 * Returns the decoded JS value.
 */
export function decodeBinaryValue(data: Uint8Array): unknown {
  const c = new Cursor(data);
  const typeName = decodeType(c);
  return decodeValue(c, typeName);
}

// ---------- Value encoding ----------

/**
 * Encode a JS value to binary format with type byte prefix.
 * Output: [type_byte(s)][value_bytes]
 */
export function encodeBinaryValue(value: unknown): Uint8Array {
  const parts: number[] = [];
  const typeName = inferType(value);
  encodeTypeBytes(parts, typeName);
  encodeValueBytes(parts, value, typeName);
  return new Uint8Array(parts);
}

function inferType(value: unknown): string {
  if (value === null || value === undefined) return "Nothing";
  if (typeof value === "boolean") return "Bool";
  if (typeof value === "number") return Number.isInteger(value) ? "Int64" : "Float64";
  if (typeof value === "bigint") return "Int64";
  if (typeof value === "string") return "String";
  if (value instanceof Date) return "DateTime";
  if (Array.isArray(value)) {
    if (value.length === 0) return "Array(Nothing)";
    return `Array(${inferType(value[0])})`;
  }
  return "String"; // fallback: stringify objects
}

function encodeTypeBytes(out: number[], typeName: string): void {
  const t = typeName.trim();

  const simple = typeNameToByte[t];
  if (simple !== undefined) {
    out.push(simple);
    return;
  }

  if (t === "DateTime" || t.startsWith("DateTime(")) {
    out.push(TypeByte.DateTime, 0); // + empty timezone
    return;
  }
  if (t.startsWith("DateTime64(")) {
    out.push(TypeByte.DateTime64);
    const [precStr] = t.slice(11, -1).split(",");
    out.push(parseInt(precStr, 10), 0); // precision + empty timezone
    return;
  }
  if (t.startsWith("FixedString(")) {
    out.push(TypeByte.FixedString);
    pushVarUInt(out, parseInt(t.slice(12, -1), 10));
    return;
  }
  if (t.startsWith("Array(")) {
    out.push(TypeByte.Array);
    encodeTypeBytes(out, t.slice(6, -1));
    return;
  }
  if (t.startsWith("Nullable(")) {
    out.push(TypeByte.Nullable);
    encodeTypeBytes(out, t.slice(9, -1));
    return;
  }
  if (t.startsWith("Map(")) {
    out.push(TypeByte.Map);
    const [k, v] = parseTypeList(t.slice(4, -1));
    encodeTypeBytes(out, k);
    encodeTypeBytes(out, v);
    return;
  }
  if (t.startsWith("Tuple(")) {
    out.push(TypeByte.Tuple);
    const parts = parseTypeList(t.slice(6, -1));
    pushVarUInt(out, parts.length);
    for (const p of parts) encodeTypeBytes(out, p);
    return;
  }

  throw new Error(`Cannot encode binary type: ${t}`);
}

function encodeValueBytes(out: number[], value: unknown, typeName: string): void {
  const t = typeName.trim();
  if (t === "Nothing") return;
  if (t === "Bool") {
    out.push(value ? 1 : 0);
    return;
  }
  if (t === "UInt8" || t === "Int8") {
    out.push((value as number) & 0xff);
    return;
  }
  if (t === "UInt16" || t === "Int16") {
    pushU16LE(out, value as number);
    return;
  }
  if (t === "UInt32" || t === "Int32") {
    pushU32LE(out, value as number);
    return;
  }
  if (t === "UInt64" || t === "Int64") {
    pushI64LE(out, typeof value === "bigint" ? value : BigInt(Math.trunc(value as number)));
    return;
  }
  if (t === "Float32") {
    const buf = new ArrayBuffer(4);
    new DataView(buf).setFloat32(0, value as number, true);
    const bytes = new Uint8Array(buf);
    for (let i = 0; i < 4; i++) out.push(bytes[i]);
    return;
  }
  if (t === "Float64") {
    const buf = new ArrayBuffer(8);
    new DataView(buf).setFloat64(0, value as number, true);
    const bytes = new Uint8Array(buf);
    for (let i = 0; i < 8; i++) out.push(bytes[i]);
    return;
  }
  if (t === "Date") {
    pushU16LE(out, value as number);
    return;
  }
  if (t === "Date32") {
    pushU32LE(out, value as number);
    return;
  }
  if (t === "DateTime" || t.startsWith("DateTime(")) {
    if (value instanceof Date) {
      pushU32LE(out, Math.floor(value.getTime() / 1000));
    } else {
      pushU32LE(out, value as number);
    }
    return;
  }
  if (t.startsWith("DateTime64(")) {
    pushI64LE(out, typeof value === "bigint" ? value : BigInt(value as number));
    return;
  }
  if (t === "String") {
    const str = typeof value === "string" ? value : String(value);
    const encoded = TEXT_ENCODER.encode(str);
    pushVarUInt(out, encoded.length);
    for (let i = 0; i < encoded.length; i++) out.push(encoded[i]);
    return;
  }
  if (t.startsWith("Array(")) {
    const innerType = t.substring(6, t.length - 1);
    const arr = value as unknown[];
    pushVarUInt(out, arr.length);
    for (const elem of arr) encodeValueBytes(out, elem, innerType);
    return;
  }
  if (t.startsWith("Nullable(")) {
    if (value === null || value === undefined) {
      out.push(1); // is_null
      return;
    }
    out.push(0); // not null
    encodeValueBytes(out, value, t.substring(9, t.length - 1));
    return;
  }

  throw new Error(`Cannot encode binary value for type: ${t}`);
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
