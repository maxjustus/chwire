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

const TEXT_DECODER = new TextDecoder();
const TEXT_ENCODER = new TextEncoder();

// ---------- Type decoding: type byte → CH type name string ----------

/**
 * Decode a binary-encoded ClickHouse type from a cursor.
 * Handles recursive types (Array, Nullable, Map, Tuple).
 */
function decodeType(c: Cursor): string {
  const tag = c.readU8();
  switch (tag) {
    case TypeByte.Nothing:
      return "Nothing";
    case TypeByte.UInt8:
      return "UInt8";
    case TypeByte.UInt16:
      return "UInt16";
    case TypeByte.UInt32:
      return "UInt32";
    case TypeByte.UInt64:
      return "UInt64";
    case TypeByte.UInt128:
      return "UInt128";
    case TypeByte.UInt256:
      return "UInt256";
    case TypeByte.Int8:
      return "Int8";
    case TypeByte.Int16:
      return "Int16";
    case TypeByte.Int32:
      return "Int32";
    case TypeByte.Int64:
      return "Int64";
    case TypeByte.Int128:
      return "Int128";
    case TypeByte.Int256:
      return "Int256";
    case TypeByte.Float32:
      return "Float32";
    case TypeByte.Float64:
      return "Float64";
    case TypeByte.Date:
      return "Date";
    case TypeByte.Date32:
      return "Date32";
    case TypeByte.DateTime: {
      // DateTime has timezone string after tag
      const tz = c.readString();
      return tz ? `DateTime('${tz}')` : "DateTime";
    }
    case TypeByte.DateTime64: {
      const precision = c.readU8();
      const tz = c.readString();
      return tz ? `DateTime64(${precision}, '${tz}')` : `DateTime64(${precision})`;
    }
    case TypeByte.String:
      return "String";
    case TypeByte.FixedString: {
      const n = c.readVarUInt();
      return `FixedString(${n})`;
    }
    case TypeByte.UUID:
      return "UUID";
    case TypeByte.Array:
      return `Array(${decodeType(c)})`;
    case TypeByte.Tuple: {
      const count = c.readVarUInt();
      const elements: string[] = [];
      for (let i = 0; i < count; i++) elements.push(decodeType(c));
      return `Tuple(${elements.join(", ")})`;
    }
    case TypeByte.Nullable:
      return `Nullable(${decodeType(c)})`;
    case TypeByte.IPv4:
      return "IPv4";
    case TypeByte.IPv6:
      return "IPv6";
    case TypeByte.Map: {
      const keyType = decodeType(c);
      const valType = decodeType(c);
      return `Map(${keyType}, ${valType})`;
    }
    case TypeByte.Bool:
      return "Bool";
    default:
      throw new Error(`Unknown binary type byte: 0x${tag.toString(16).padStart(2, "0")}`);
  }
}

// ---------- Value decoding ----------

function decodeValue(c: Cursor, typeName: string): unknown {
  // Strip leading/trailing whitespace from parsed type names
  const t = typeName.trim();

  if (t === "Nothing") return null;
  if (t === "Bool") return c.readU8() !== 0;
  if (t === "UInt8") return c.readU8();
  if (t === "UInt16") return c.readU16LE();
  if (t === "UInt32") return c.readU32LE();
  if (t === "UInt64") return c.readU64LE();
  if (t === "Int8") return c.readI8();
  if (t === "Int16") return c.readI16LE();
  if (t === "Int32") return c.readI32LE();
  if (t === "Int64") return c.readI64LE();
  if (t === "Float32") return c.readF32LE();
  if (t === "Float64") return c.readF64LE();
  if (t === "Date") return c.readU16LE(); // days since epoch
  if (t === "Date32") return c.readI32LE(); // days since epoch
  if (t === "String") {
    const len = c.readVarUInt();
    const bytes = c.readBytes(len);
    return TEXT_DECODER.decode(bytes);
  }
  if (t === "UUID") {
    // UUID stored as low_u64 + high_u64 (ClickHouse byte order)
    const bytes = c.readBytes(16);
    return bytes.slice(); // return copy
  }
  if (t === "IPv4") return c.readU32LE();
  if (t === "IPv6") return c.readBytes(16).slice();

  // DateTime('tz') or DateTime
  if (t === "DateTime" || t.startsWith("DateTime(")) {
    return c.readU32LE(); // unix timestamp
  }
  // DateTime64(precision) or DateTime64(precision, 'tz')
  if (t.startsWith("DateTime64(")) {
    return c.readI64LE(); // ticks
  }
  // FixedString(N)
  if (t.startsWith("FixedString(")) {
    const n = parseInt(t.substring(12, t.length - 1), 10);
    return c.readBytes(n).slice();
  }
  // UInt128, UInt256, Int128, Int256 — return raw bytes
  if (t === "UInt128" || t === "Int128") return c.readBytes(16).slice();
  if (t === "UInt256" || t === "Int256") return c.readBytes(32).slice();

  // Array(T)
  if (t.startsWith("Array(")) {
    const innerType = t.substring(6, t.length - 1);
    const count = c.readVarUInt();
    const elements: unknown[] = new Array(count);
    for (let i = 0; i < count; i++) elements[i] = decodeValue(c, innerType);
    return elements;
  }
  // Nullable(T)
  if (t.startsWith("Nullable(")) {
    const isNull = c.readU8();
    if (isNull !== 0) return null;
    const innerType = t.substring(9, t.length - 1);
    return decodeValue(c, innerType);
  }
  // Tuple(T1, T2, ...)
  if (t.startsWith("Tuple(")) {
    const inner = t.substring(6, t.length - 1);
    const elementTypes = parseTypeList(inner);
    const elements: unknown[] = new Array(elementTypes.length);
    for (let i = 0; i < elementTypes.length; i++) elements[i] = decodeValue(c, elementTypes[i]);
    return elements;
  }
  // Map(K, V)
  if (t.startsWith("Map(")) {
    const inner = t.substring(4, t.length - 1);
    const parts = parseTypeList(inner);
    const keyType = parts[0];
    const valType = parts[1];
    const count = c.readVarUInt();
    const keys: unknown[] = new Array(count);
    const values: unknown[] = new Array(count);
    for (let i = 0; i < count; i++) keys[i] = decodeValue(c, keyType);
    for (let i = 0; i < count; i++) values[i] = decodeValue(c, valType);
    return { keys, values };
  }

  throw new Error(`Unsupported type for binary value decode: ${t}`);
}

/** Parse comma-separated type list respecting parenthesis nesting. */
function parseTypeList(inner: string): string[] {
  const types: string[] = [];
  let depth = 0;
  let current = "";
  for (const char of inner) {
    if (char === "(") depth++;
    if (char === ")") depth--;
    if (char === "," && depth === 0) {
      types.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  if (current.trim()) types.push(current.trim());
  return types;
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

  // Simple scalar types
  const simple = typeNameToByte[t];
  if (simple !== undefined) {
    out.push(simple);
    return;
  }
  // DateTime (no timezone for inferred types)
  if (t === "DateTime" || t.startsWith("DateTime(")) {
    out.push(TypeByte.DateTime);
    // Write empty timezone string (varint 0)
    out.push(0);
    return;
  }
  if (t.startsWith("DateTime64(")) {
    out.push(TypeByte.DateTime64);
    // Parse precision from DateTime64(P) or DateTime64(P, 'tz')
    const inner = t.substring(11, t.length - 1);
    const commaIdx = inner.indexOf(",");
    const precision = parseInt(commaIdx >= 0 ? inner.substring(0, commaIdx) : inner, 10);
    out.push(precision);
    out.push(0); // empty timezone
    return;
  }
  if (t.startsWith("FixedString(")) {
    out.push(TypeByte.FixedString);
    const n = parseInt(t.substring(12, t.length - 1), 10);
    pushVarUInt(out, n);
    return;
  }
  if (t.startsWith("Array(")) {
    out.push(TypeByte.Array);
    encodeTypeBytes(out, t.substring(6, t.length - 1));
    return;
  }
  if (t.startsWith("Nullable(")) {
    out.push(TypeByte.Nullable);
    encodeTypeBytes(out, t.substring(9, t.length - 1));
    return;
  }
  if (t.startsWith("Map(")) {
    out.push(TypeByte.Map);
    const parts = parseTypeList(t.substring(4, t.length - 1));
    encodeTypeBytes(out, parts[0]);
    encodeTypeBytes(out, parts[1]);
    return;
  }
  if (t.startsWith("Tuple(")) {
    out.push(TypeByte.Tuple);
    const parts = parseTypeList(t.substring(6, t.length - 1));
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
