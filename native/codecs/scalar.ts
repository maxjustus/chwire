import { type Column, DataColumn, EnumColumn } from "../columns.ts";
import { IPv6 as IPv6Const, UUID as UUIDConst } from "../constants.ts";
import { type BufferReader, BufferWriter, type TypedArrayConstructor } from "../io.ts";
import {
  ClickHouseDateTime64,
  type EnumMapping,
  parseEnumDefinition,
  TEXT_DECODER,
  TEXT_ENCODER,
  type TypedArray,
} from "../types.ts";
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
  toBigIntInRange,
  toBool,
  toValidDate,
  toValidDecimal,
  toValidIPv4,
  toValidIPv6,
  toValidUUID,
  UINT128_MAX,
  UINT16_MAX,
  UINT32_MAX,
  UINT256_MAX,
} from "../coercion.ts";
import { asBytes, BaseCodec, escapeString, wrapQuoted } from "./base.ts";

// Hex lookup tables for optimized UUID encode/decode
const HEX_LUT = new Uint8Array(256);
const BYTE_TO_HEX: string[] = [];
for (let i = 0; i < 256; i++) {
  HEX_LUT[i] = 255;
  BYTE_TO_HEX[i] = i.toString(16).padStart(2, "0");
}
for (let i = 0; i < 10; i++) HEX_LUT[48 + i] = i;
for (let i = 0; i < 6; i++) {
  HEX_LUT[65 + i] = 10 + i;
  HEX_LUT[97 + i] = 10 + i;
}

function writeBigInt128(v: DataView, o: number, val: bigint, signed: boolean): void {
  const low = val & 0xffffffffffffffffn;
  const high = val >> 64n;
  v.setBigUint64(o, low, true);
  if (signed) v.setBigInt64(o + 8, high, true);
  else v.setBigUint64(o + 8, high, true);
}

function readBigInt128(v: DataView, o: number, signed: boolean): bigint {
  const low = v.getBigUint64(o, true);
  const high = signed ? v.getBigInt64(o + 8, true) : v.getBigUint64(o + 8, true);
  return (high << 64n) | low;
}

function writeBigInt256(v: DataView, o: number, val: bigint, signed: boolean): void {
  for (let i = 0; i < 3; i++) {
    v.setBigUint64(o + i * 8, val & 0xffffffffffffffffn, true);
    val >>= 64n;
  }
  if (signed) v.setBigInt64(o + 24, val, true);
  else v.setBigUint64(o + 24, val, true);
}

function readBigInt256(v: DataView, o: number, signed: boolean): bigint {
  let val = signed ? v.getBigInt64(o + 24, true) : v.getBigUint64(o + 24, true);
  for (let i = 2; i >= 0; i--) {
    val = (val << 64n) | v.getBigUint64(o + i * 8, true);
  }
  return val;
}

function decimalByteSize(type: string): 4 | 8 | 16 | 32 {
  if (type.startsWith("Decimal32")) return 4;
  if (type.startsWith("Decimal64")) return 8;
  if (type.startsWith("Decimal128")) return 16;
  if (type.startsWith("Decimal256")) return 32;
  const match = type.match(/Decimal\((\d+),/);
  if (match) {
    const p = parseInt(match[1], 10);
    if (p <= 9) return 4;
    if (p <= 18) return 8;
    if (p <= 38) return 16;
    return 32;
  }
  throw new TypeError(`Unknown Decimal type: "${type}"`);
}

function extractDecimalScale(type: string): number {
  const match = type.match(/Decimal\d*\((?:\d+,\s*)?(\d+)\)/);
  return match ? parseInt(match[1], 10) : 0;
}

function parseDecimalToScaledBigInt(str: string, scale: number): bigint {
  const neg = str.startsWith("-");
  if (neg) str = str.slice(1);
  const dot = str.indexOf(".");
  let intP: string, fracP: string;
  if (dot === -1) {
    intP = str;
    fracP = "";
  } else {
    intP = str.slice(0, dot);
    fracP = str.slice(dot + 1);
  }

  if (fracP.length < scale) fracP = fracP.padEnd(scale, "0");
  else if (fracP.length > scale)
    throw new TypeError(
      `Decimal precision loss: "${str}" has ${fracP.length} fractional digits but scale is ${scale}`,
    );

  const val = BigInt(intP + fracP);
  return neg ? -val : val;
}

function formatScaledBigInt(val: bigint, scale: number): string {
  const neg = val < 0n;
  if (neg) val = -val;
  let str = val.toString();
  if (scale === 0) return neg ? `-${str}` : str;
  while (str.length <= scale) str = `0${str}`;
  const intP = str.slice(0, -scale);
  const fracP = str.slice(-scale);
  const r = `${intP}.${fracP}`;
  return neg ? `-${r}` : r;
}

function ipv6ToBytes(ip: string): Uint8Array {
  if (ip.length === 0) {
    throw new TypeError(`Invalid IPv6 address: "${ip}"`);
  }

  const parts = ip.split("::");
  if (parts.length > 2) {
    throw new TypeError(`Invalid IPv6 address: "${ip}"`);
  }

  let groups: string[];
  if (parts.length === 2) {
    const left = parts[0] === "" ? [] : parts[0].split(":");
    const right = parts[1] === "" ? [] : parts[1].split(":");

    for (const g of left) {
      if (g.length === 0) throw new TypeError(`Invalid IPv6 address: "${ip}"`);
    }
    for (const g of right) {
      if (g.length === 0) throw new TypeError(`Invalid IPv6 address: "${ip}"`);
    }

    const missing = 8 - (left.length + right.length);
    if (missing < 1) throw new TypeError(`Invalid IPv6 address: "${ip}"`);
    groups = [...left, ...new Array(missing).fill("0"), ...right];
  } else {
    groups = ip.split(":");
    if (groups.length !== 8) throw new TypeError(`Invalid IPv6 address: "${ip}"`);
    for (const g of groups) {
      if (g.length === 0) throw new TypeError(`Invalid IPv6 address: "${ip}"`);
    }
  }

  const bytes = new Uint8Array(16);
  for (let i = 0; i < 8; i++) {
    const group = groups[i];
    if (group.length < 1 || group.length > 4) {
      throw new TypeError(`Invalid IPv6 address: "${ip}"`);
    }
    let val = 0;
    for (let j = 0; j < group.length; j++) {
      const nibble = HEX_LUT[group.charCodeAt(j)];
      if (nibble === 255) throw new TypeError(`Invalid IPv6 address: "${ip}"`);
      val = (val << 4) | nibble;
    }
    bytes[i * 2] = (val >> 8) & 0xff;
    bytes[i * 2 + 1] = val & 0xff;
  }
  return bytes;
}

function bytesToIpv6(bytes: Uint8Array): string {
  const parts: string[] = [];
  for (let i = 0; i < 8; i++) {
    const val = (bytes[i * 2] << 8) | bytes[i * 2 + 1];
    parts.push(val.toString(16));
  }
  return parts.join(":");
}

export class NumericCodec<T extends TypedArray> extends BaseCodec {
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
    if (
      col instanceof DataColumn &&
      ArrayBuffer.isView(col.data) &&
      !(col.data instanceof DataView)
    ) {
      const data = col.data as TypedArray;
      return asBytes(data);
    }

    const len = col.length;
    const arr = new this.Ctor(len);
    for (let i = 0; i < len; i++) {
      const v = col.get(i);
      arr[i] = (this.converter ? this.converter(v) : v) as any;
    }
    return asBytes(arr);
  }

  decodeDense(reader: BufferReader, rows: number): Column {
    return new DataColumn(this.type, reader.readTypedArray(this.Ctor, rows));
  }

  fromValues(values: unknown[] | TypedArray): DataColumn<T> {
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

export class EnumCodec extends BaseCodec {
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

  decodeDense(reader: BufferReader, rows: number): Column {
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

export class StringCodec extends BaseCodec {
  readonly type = "String";

  encode(col: Column, sizeHint?: number): Uint8Array {
    const len = col.length;
    const writer = new BufferWriter(sizeHint ?? this.estimateSize(len));
    for (let i = 0; i < len; i++) {
      writer.writeString(coerceToString(col.get(i)));
    }
    return writer.finish();
  }

  decodeDense(reader: BufferReader, rows: number): Column {
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

export class UUIDCodec extends BaseCodec {
  readonly type = "UUID";

  encode(col: Column): Uint8Array {
    const len = col.length;
    const buf = new Uint8Array(len * UUIDConst.BYTE_SIZE);

    for (let i = 0; i < len; i++) {
      const u = toValidUUID(col.get(i));
      const clean = u.replace(/-/g, "");

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

  decodeDense(reader: BufferReader, rows: number): Column {
    reader.ensureAvailable(rows * UUIDConst.BYTE_SIZE);
    const values: string[] = new Array(rows);
    for (let i = 0; i < rows; i++) {
      const b = reader.buffer.subarray(reader.offset, reader.offset + 16);
      reader.offset += 16;

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

export class FixedStringCodec extends BaseCodec {
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

  decodeDense(reader: BufferReader, rows: number): Column {
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

export class BigIntCodec extends BaseCodec {
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

  decodeDense(reader: BufferReader, rows: number): Column {
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

export class DecimalCodec extends BaseCodec {
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

  decodeDense(reader: BufferReader, rows: number): Column {
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

export class DateTime64Codec extends BaseCodec {
  readonly type: string;
  private precision: number;
  private msScale: bigint;
  private fullScale: bigint;

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

  decodeDense(reader: BufferReader, rows: number): Column {
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

export class EpochCodec<T extends Uint16Array | Int32Array | Uint32Array> extends BaseCodec {
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

  decodeDense(reader: BufferReader, rows: number): Column {
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
      return value;
    } else {
      throw new TypeError(`Cannot serialize ${typeof value} to ${this.type}`);
    }

    if (this.type === "Date" || this.type === "Date32") {
      return d.toISOString().slice(0, 10);
    }
    return d.toISOString().slice(0, 19).replace("T", " ");
  }
}

export class IPv4Codec extends BaseCodec {
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
      arr[i] = ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
    }
    return asBytes(arr);
  }

  decodeDense(reader: BufferReader, rows: number): Column {
    const arr = reader.readTypedArray(Uint32Array, rows);
    const values: string[] = new Array(rows);
    for (let i = 0; i < rows; i++) {
      const v = arr[i];
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

export class IPv6Codec extends BaseCodec {
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

  decodeDense(reader: BufferReader, rows: number): Column {
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
