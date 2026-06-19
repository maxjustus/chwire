import {
  coerceToString,
  INT32_MAX,
  INT32_MIN,
  INT64_MAX,
  INT64_MIN,
  INT128_MAX,
  INT128_MIN,
  INT256_MAX,
  INT256_MIN,
  IPV4_REGEX,
  toBigIntInRange,
  toBool,
  toValidDate,
  toValidDecimal,
  toValidIPv4,
  toValidIPv6,
  toValidUUID,
  UINT16_MAX,
  UINT32_MAX,
  UINT128_MAX,
  UINT256_MAX,
} from "../coercion.ts";
import { type Column, DataColumn, EnumColumn, LazyStringColumn } from "../columns.ts";
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
  asBytes,
  BaseCodec,
  type ColumnBuilder,
  escapeString,
  type GenContext,
  type Rng,
  wrapQuoted,
} from "./base.ts";

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
    const p = parseInt(match[1]!, 10);
    if (p <= 9) return 4;
    if (p <= 18) return 8;
    if (p <= 38) return 16;
    return 32;
  }
  throw new TypeError(`Unknown Decimal type: "${type}"`);
}

function extractDecimalScale(type: string): number {
  const match = type.match(/Decimal\d*\((?:\d+,\s*)?(\d+)\)/);
  return match ? parseInt(match[1]!, 10) : 0;
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
    const [hi, lo] = parts;
    if (hi === undefined || lo === undefined) throw new TypeError(`Invalid IPv6 address: "${ip}"`);
    const left = hi === "" ? [] : hi.split(":");
    const right = lo === "" ? [] : lo.split(":");

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
    if (group === undefined || group.length < 1 || group.length > 4) {
      throw new TypeError(`Invalid IPv6 address: "${ip}"`);
    }
    let val = 0;
    for (let j = 0; j < group.length; j++) {
      const nibble = HEX_LUT[group.charCodeAt(j)];
      // undefined when charCode is outside the LUT (non-ASCII) — also invalid.
      if (nibble === undefined || nibble === 255) {
        throw new TypeError(`Invalid IPv6 address: "${ip}"`);
      }
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
    const val = ((bytes[i * 2] ?? 0) << 8) | (bytes[i * 2 + 1] ?? 0);
    parts.push(val.toString(16));
  }
  return parts.join(":");
}

const bigIntMin = (a: bigint, b: bigint): bigint => (a < b ? a : b);
const bigIntMax = (a: bigint, b: bigint): bigint => (a > b ? a : b);

/** Uniform bigint in [min, max] inclusive, assembled from 32-bit rng words. */
function randomBigIntInRange(rng: Rng, min: bigint, max: bigint): bigint {
  const span = max - min;
  if (span === 0n) return min;
  // Mask to the minimal width that covers span, then rejection-sample: a plain
  // modulo would bias toward the low end of wide ranges, so retry draws that
  // exceed span until one lands in [0, span]. The mask must hug span (length
  // rounded up to 32-bit chunks would leave a span ~2^41 sampled with a 2^64
  // mask, rejecting ~all draws); using span's exact bit length bounds the
  // rejection rate below 1/2.
  const bits = BigInt(span.toString(2).length);
  const mask = (1n << bits) - 1n;
  while (true) {
    let value = 0n;
    for (let drawn = 0n; drawn < bits; drawn += 32n) {
      value = (value << 32n) | BigInt(rng.int(0, 0xffffffff));
    }
    value &= mask;
    if (value <= span) return min + value;
  }
}

/** Random element of a non-empty array. */
const pick = <T>(rng: Rng, arr: readonly T[]): T => arr[rng.int(0, arr.length - 1)]!;

/**
 * Half the time, pick one of the symbolic width boundaries and clamp it into
 * [min, max] (e.g. -1 is out of range for unsigned types, min+1 may exceed max
 * for 1-value domains); otherwise return null to signal a uniform-random draw.
 * Shared by `genInt`/`genBigInt`; each builds its own typed
 * boundary list and supplies the uniform fallback.
 */
function clampPick<T extends number | bigint>(rng: Rng, boundaries: T[], min: T, max: T): T | null {
  if (rng.int(0, 1) !== 0) return null;
  const v = pick(rng, boundaries);
  return v < min ? min : v > max ? max : v;
}

/**
 * Integer in [min, max], oversampling the width boundaries
 * (min, max, 0, 1, -1, min+1, max-1) so over/underflow and sign-edge bugs
 * surface; uniform-random the rest of the time.
 */
function genInt(rng: Rng, min: number, max: number): number {
  const v = clampPick(rng, [min, max, 0, 1, -1, min + 1, max - 1], min, max);
  return v ?? rng.int(min, max);
}

/**
 * Bigint in [min, max] with the same boundary oversampling as `genInt`,
 * for the 64/128/256-bit widths.
 */
function genBigInt(rng: Rng, min: bigint, max: bigint): bigint {
  const v = clampPick(rng, [min, max, 0n, 1n, -1n, min + 1n, max - 1n], min, max);
  return v ?? randomBigIntInRange(rng, min, max);
}

/**
 * Float64 special values that must round-trip bit-exact through CH: NaN, both
 * infinities, both zeros, the smallest subnormal, and the magnitude extremes.
 */
const FLOAT64_SPECIALS: number[] = [
  NaN,
  Infinity,
  -Infinity,
  0,
  -0,
  Number.MIN_VALUE, // smallest positive subnormal (~5e-324)
  -Number.MIN_VALUE,
  Number.MAX_VALUE,
  -Number.MAX_VALUE,
  Number.EPSILON,
];

/**
 * Float32 special values, each `Math.fround`-exact so the 32-bit round-trip is
 * lossless. Smallest subnormal / max for the 32-bit format.
 */
const FLOAT32_SMALLEST_SUBNORMAL = 2 ** -149; // ~1.4e-45, exact in Float32
const FLOAT32_MAX = 3.4028234663852886e38; // (2 - 2^-23) * 2^127
const FLOAT32_SPECIALS: number[] = [
  NaN,
  Infinity,
  -Infinity,
  0,
  -0,
  FLOAT32_SMALLEST_SUBNORMAL,
  -FLOAT32_SMALLEST_SUBNORMAL,
  FLOAT32_MAX,
  -FLOAT32_MAX,
  Math.fround(Number.EPSILON),
];

/**
 * Characters drawn from multiple Unicode planes plus ASCII control codes, used
 * by `genString`. Lone surrogates are intentionally absent: JS
 * UTF-8-encodes them lossily to U+FFFD so they cannot round-trip as-is.
 */
const UNICODE_SAMPLES: string[] = [
  "\u0000", // embedded NUL
  "\u0007", // bell
  "\u0008", // backspace
  "\u001f", // unit separator
  "\u007f", // DEL
  "\t",
  "\n",
  "\r",
  "\\",
  "'",
  "\u00e9", // e-acute, Latin-1 supplement
  "\u0416", // Cyrillic Zhe
  "\u4e2d", // CJK, BMP
  "\u{1f600}", // emoji (astral plane)
  "\u{10ffff}", // highest valid code point
  "\u200b", // zero-width space
];
// NOTE: U+FEFF (BOM) is intentionally excluded. CH's `FORMAT Native` String
// input parser strips one leading BOM from each value (verified: a leading BOM
// is dropped, a second/mid/trailing BOM is preserved; a pure-SQL String CAST
// keeps it, so the strip is format-input-specific). A generated leading BOM
// therefore cannot round-trip, which would violate the generate()/decode()
// representation contract, so it is omitted rather than worked around in
// compare().

/**
 * String oversampling empty, multi-KB, ASCII control runs, and multi-plane
 * Unicode (including embedded NUL); short random ASCII the rest of the time.
 * All values are bare JS strings, the same representation `StringCodec.decode`
 * returns.
 */
function genString(rng: Rng): string {
  switch (rng.int(0, 4)) {
    case 0:
      return "";
    case 1: {
      // Multi-KB string of a repeated unit (exercises large length varints).
      const unit = pick(rng, UNICODE_SAMPLES);
      return unit.repeat(rng.int(1024, 4096));
    }
    case 2: {
      // Mixed pile of control + multi-plane characters.
      const len = rng.int(1, 64);
      let s = "";
      for (let i = 0; i < len; i++) s += pick(rng, UNICODE_SAMPLES);
      return s;
    }
    default: {
      // short random ASCII; length biased small to exercise repeats
      const len = rng.int(0, 12);
      let s = "";
      for (let i = 0; i < len; i++) s += String.fromCharCode(rng.int(32, 126));
      return s;
    }
  }
}

/**
 * `n` bytes, oversampling the all-zero and all-0xFF fills (each 1/4),
 * otherwise random per-byte (1/2). Backs the fixed-width byte generators
 * (UUID/FixedString/IPv4/IPv6) so each draws the same fill class then bytes.
 */
function genBytes(rng: Rng, n: number): Uint8Array {
  const bytes = new Uint8Array(n);
  const fill = rng.int(0, 3);
  if (fill === 1) bytes.fill(0xff);
  else if (fill >= 2) for (let i = 0; i < n; i++) bytes[i] = rng.int(0, 0xff);
  return bytes;
}

class NumericColumnBuilder<T extends TypedArray> implements ColumnBuilder {
  private arr: T;
  private offset = 0;
  private type: string;
  private Ctor: TypedArrayConstructor<T>;
  private convert?: (v: unknown) => number | bigint;

  constructor(
    type: string,
    Ctor: TypedArrayConstructor<T>,
    convert?: (v: unknown) => number | bigint,
    initialCapacity = 1024,
  ) {
    this.type = type;
    this.Ctor = Ctor;
    if (convert !== undefined) this.convert = convert;
    this.arr = new Ctor(initialCapacity) as T;
  }

  private ensureCapacity(capacity: number): void {
    if (capacity <= this.arr.length) return;
    let nextLength = this.arr.length === 0 ? 1 : this.arr.length * 2;
    while (nextLength < capacity) nextLength *= 2;
    const next = new this.Ctor(nextLength) as T;
    next.set(this.arr as any);
    this.arr = next;
  }

  push(value: unknown): void {
    this.ensureCapacity(this.offset + 1);
    this.arr[this.offset++] = (this.convert ? this.convert(value) : value) as any;
  }

  pushAll(values: ArrayLike<unknown>): void {
    const start = this.offset;
    this.offset += values.length;
    this.ensureCapacity(this.offset);
    const convert = this.convert;
    if (convert) {
      for (let i = 0; i < values.length; i++) this.arr[start + i] = convert(values[i]) as any;
    } else {
      for (let i = 0; i < values.length; i++) this.arr[start + i] = values[i] as any;
    }
  }

  finish(): DataColumn<T> {
    return new DataColumn(this.type, this.arr.subarray(0, this.offset) as T);
  }
}

export class NumericCodec<T extends TypedArray> extends BaseCodec {
  readonly type: string;
  readonly Ctor: TypedArrayConstructor<T>;
  readonly converter?: (v: unknown) => number | bigint;
  // Width range for the plain-integer generate() fallback. Float/Bool ignore
  // these; Int64/UInt64 are bigint-special-cased before the fallback, so the
  // Number-precision overflow at 64-bit widths never reaches a read site.
  private readonly min: number;
  private readonly max: number;

  constructor(
    type: string,
    Ctor: TypedArrayConstructor<T>,
    converter?: (v: unknown) => number | bigint,
  ) {
    super();
    this.type = type;
    this.Ctor = Ctor;
    if (converter !== undefined) this.converter = converter;
    const bits = Ctor.BYTES_PER_ELEMENT * 8;
    const signed = type.startsWith("Int");
    this.max = signed ? 2 ** (bits - 1) - 1 : 2 ** bits - 1;
    this.min = signed ? -(2 ** (bits - 1)) : 0;
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

  override fromRows(rows: readonly unknown[][], columnIndex: number): DataColumn<T> {
    const arr = new this.Ctor(rows.length);
    const convert = this.converter;
    for (let i = 0; i < rows.length; i++) {
      const v = rows[i]![columnIndex];
      arr[i] = (convert ? convert(v) : v) as any;
    }
    return new DataColumn(this.type, arr);
  }

  override makeBuilder(expectedRows?: number): ColumnBuilder {
    return new NumericColumnBuilder(this.type, this.Ctor, this.converter, expectedRows ?? 1024);
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

  generate(ctx: GenContext): number | bigint {
    const rng = ctx.rng;
    switch (this.type) {
      case "Bool":
        return rng.int(0, 1);
      case "Float32":
        // Oversample the IEEE-754 specials (NaN/Inf/-0/subnormal/max), each
        // fround-exact, then fall back to fround-rounded random so the 32-bit
        // round-trip stays lossless.
        if (rng.int(0, 1) === 0) return pick(rng, FLOAT32_SPECIALS);
        return Math.fround((rng.next() - 0.5) * 2 ** rng.int(0, 60));
      case "Float64":
        if (rng.int(0, 1) === 0) return pick(rng, FLOAT64_SPECIALS);
        return (rng.next() - 0.5) * 2 ** rng.int(0, 200);
      case "Int64":
        return genBigInt(rng, INT64_MIN, INT64_MAX);
      case "UInt64":
        return genBigInt(rng, 0n, (1n << 64n) - 1n);
    }
    // Remaining integer typed arrays use the width range from the constructor.
    return genInt(rng, this.min, this.max);
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

  generate(ctx: GenContext): string {
    return pick(ctx.rng, [...this.mapping.valueToName.values()]);
  }
}

export class StringCodec extends BaseCodec {
  readonly type = "String";

  encode(col: Column, sizeHint?: number): Uint8Array {
    const len = col.length;
    const writer = new BufferWriter(sizeHint ?? this.estimateSize(len));
    if (col instanceof LazyStringColumn) {
      for (let i = 0; i < len; i++) {
        writer.writeStringSlice(col.source, col.starts[i]!, col.lengths[i]!);
      }
    } else if (col instanceof DataColumn) {
      const data = col.data;
      for (let i = 0; i < len; i++) {
        const v = data[i];
        writer.writeString(typeof v === "string" ? v : coerceToString(v));
      }
    } else {
      for (let i = 0; i < len; i++) {
        writer.writeString(coerceToString(col.get(i)));
      }
    }
    return writer.finish();
  }

  decodeDense(reader: BufferReader, rows: number): Column {
    if (reader.options?.lazyStrings) {
      const starts = new Uint32Array(rows);
      const lengths = new Uint32Array(rows);
      for (let i = 0; i < rows; i++) {
        const len = reader.readVarint();
        reader.ensureAvailable(len);
        starts[i] = reader.offset;
        lengths[i] = len;
        reader.offset += len;
      }
      return new LazyStringColumn(
        this.type,
        reader.buffer,
        starts,
        lengths,
        reader.options.lazyStringMemoize !== false,
      );
    }

    const values = new Array<string>(rows);
    for (let i = 0; i < rows; i++) values[i] = reader.readString();
    return new DataColumn(this.type, values);
  }

  fromValues(values: unknown[]): Column {
    for (let i = 0; i < values.length; i++) {
      if (typeof values[i] !== "string") {
        return new DataColumn(this.type, values.map(coerceToString));
      }
    }
    return new DataColumn(this.type, values.slice() as string[]);
  }

  override fromRows(rows: readonly unknown[][], columnIndex: number): Column {
    const values: string[] = new Array(rows.length);
    for (let i = 0; i < rows.length; i++) {
      const v = rows[i]![columnIndex];
      values[i] = typeof v === "string" ? v : coerceToString(v);
    }
    return new DataColumn(this.type, values);
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

  generate(ctx: GenContext): string {
    return genString(ctx.rng);
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
      // clean is 32 validated hex chars (toValidUUID), so every charCode is in
      // the LUT — the lookups are in range.
      for (let j = 0; j < 8; j++) {
        const p = (7 - j) * 2;
        buf[off + j] = (HEX_LUT[clean.charCodeAt(p)]! << 4) | HEX_LUT[clean.charCodeAt(p + 1)]!;
      }
      for (let j = 0; j < 8; j++) {
        const p = (15 - j) * 2;
        buf[off + 8 + j] = (HEX_LUT[clean.charCodeAt(p)]! << 4) | HEX_LUT[clean.charCodeAt(p + 1)]!;
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

      // b is exactly 16 bytes (ensureAvailable above); the fixed indices are in range.
      // Leading "" anchors the whole expression as string concatenation.
      values[i] =
        "" +
        BYTE_TO_HEX[b[7]!] +
        BYTE_TO_HEX[b[6]!] +
        BYTE_TO_HEX[b[5]!] +
        BYTE_TO_HEX[b[4]!] +
        "-" +
        BYTE_TO_HEX[b[3]!] +
        BYTE_TO_HEX[b[2]!] +
        "-" +
        BYTE_TO_HEX[b[1]!] +
        BYTE_TO_HEX[b[0]!] +
        "-" +
        BYTE_TO_HEX[b[15]!] +
        BYTE_TO_HEX[b[14]!] +
        "-" +
        BYTE_TO_HEX[b[13]!] +
        BYTE_TO_HEX[b[12]!] +
        BYTE_TO_HEX[b[11]!] +
        BYTE_TO_HEX[b[10]!] +
        BYTE_TO_HEX[b[9]!] +
        BYTE_TO_HEX[b[8]!];
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

  generate(ctx: GenContext): string {
    const bytes = genBytes(ctx.rng, 16);
    let hex = "";
    for (let i = 0; i < 16; i++) hex += BYTE_TO_HEX[bytes[i]!];
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
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
      // slice (copy), not subarray: these bytes are retained in the column,
      // and a view would pin the whole block buffer for its lifetime.
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

  generate(ctx: GenContext): Uint8Array {
    return genBytes(ctx.rng, this.len);
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

  generate(ctx: GenContext): bigint {
    return genBigInt(ctx.rng, this.min, this.max);
  }
}

/** Significant-digit precision P of a Decimal type (Decimal(P, S) or the shorthand widths). */
function extractDecimalPrecision(type: string, byteSize: 4 | 8 | 16 | 32): number {
  const m = type.match(/^Decimal\(\s*(\d+)/);
  if (m) return Number(m[1]);
  return byteSize === 4 ? 9 : byteSize === 8 ? 18 : byteSize === 16 ? 38 : 76;
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
    // Storage-width range, then tighten to the declared precision P: a
    // Decimal(P, S) value's unscaled magnitude must be <= 10^P - 1 (CH enforces
    // this), which is always within the width.
    let widthMin: bigint;
    let widthMax: bigint;
    if (this.byteSize === 4) {
      widthMin = BigInt(INT32_MIN);
      widthMax = BigInt(INT32_MAX);
    } else if (this.byteSize === 8) {
      widthMin = INT64_MIN;
      widthMax = INT64_MAX;
    } else if (this.byteSize === 16) {
      widthMin = INT128_MIN;
      widthMax = INT128_MAX;
    } else {
      widthMin = INT256_MIN;
      widthMax = INT256_MAX;
    }
    const precMax = 10n ** BigInt(extractDecimalPrecision(type, this.byteSize)) - 1n;
    this.max = bigIntMin(widthMax, precMax);
    this.min = bigIntMax(widthMin, -precMax);
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

  generate(ctx: GenContext): string {
    return formatScaledBigInt(genBigInt(ctx.rng, this.min, this.max), this.scale);
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
      values[i] = new ClickHouseDateTime64(arr[i]!, this.precision);
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
    // Work on the absolute value: BigInt division truncates toward zero, so for
    // ticks in (-fullScale, 0) the seconds part is 0n and String(0n) would drop
    // the sign. The "-" must come from the original ticks.
    const neg = ticks < 0n;
    const abs = neg ? -ticks : ticks;
    const seconds = abs / this.fullScale;
    const frac = abs % this.fullScale;
    const sign = neg ? "-" : "";
    if (frac === 0n) return `${sign}${seconds}`;
    const fracStr = String(frac).padStart(this.precision, "0");
    return `${sign}${seconds}.${fracStr}`;
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

  generate(ctx: GenContext): ClickHouseDateTime64 {
    const rng = ctx.rng;
    // CH DateTime64 spans years 1900..2299, but high precision narrows that:
    // ticks = seconds * 10^precision must fit in Int64. Derive the tick window
    // from the second window, then clamp to Int64: maxSec is
    // floor(INT64_MAX/fullScale), so adding the full fractional part can spill
    // past INT64_MAX.
    const minSec = bigIntMax(-2208988800n, INT64_MIN / this.fullScale);
    const maxSec = bigIntMin(10413792000n, INT64_MAX / this.fullScale);
    const minTicks = bigIntMax(minSec * this.fullScale, INT64_MIN);
    const maxTicks = bigIntMin(maxSec * this.fullScale + (this.fullScale - 1n), INT64_MAX);
    // genBigInt oversamples the window boundaries (its set already
    // includes minTicks/maxTicks/0n); otherwise a uniform tick.
    return new ClickHouseDateTime64(genBigInt(rng, minTicks, maxTicks), this.precision);
  }

  override compare(a: unknown, b: unknown): boolean {
    if (!(a instanceof ClickHouseDateTime64) || !(b instanceof ClickHouseDateTime64)) return false;
    return a.ticks === b.ticks && a.precision === b.precision;
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
    // Match Date/Date32 exactly and let bare and timezone-qualified DateTime
    // ("DateTime", "DateTime('UTC')") share the default Uint32 range — keying on
    // the exact "DateTime" string instead would clamp DateTime('tz') to Date32's
    // INT32_MAX (~2038) ceiling.
    const [minUnits, maxUnits] =
      type === "Date"
        ? [0, UINT16_MAX]
        : type === "Date32"
          ? [INT32_MIN, INT32_MAX]
          : [0, UINT32_MAX];
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

  generate(ctx: GenContext): Date {
    // Pick a unit count inside CH's accepted range for this type so the value
    // round-trips without clamping. Decode produces new Date(units * multiplier),
    // so emit the same.
    const [minUnits, maxUnits] =
      this.type === "Date"
        ? [0, UINT16_MAX] // 1970-01-01 .. 2149-06-06
        : this.type === "Date32"
          ? [-25567, 120529] // 1900-01-01 .. 2299-12-31
          : [0, UINT32_MAX]; // DateTime: 1970-01-01 .. 2106-02-07
    // Oversample epoch and the two range boundaries; otherwise random units.
    const units = genInt(ctx.rng, minUnits, maxUnits);
    return new Date(units * this.multiplier);
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
      // A successful match guarantees all four octet capture groups.
      const a = parseInt(m[1]!, 10);
      const b = parseInt(m[2]!, 10);
      const c = parseInt(m[3]!, 10);
      const d = parseInt(m[4]!, 10);
      arr[i] = ((a << 24) | (b << 16) | (c << 8) | d) >>> 0;
    }
    return asBytes(arr);
  }

  decodeDense(reader: BufferReader, rows: number): Column {
    const arr = reader.readTypedArray(Uint32Array, rows);
    const values: string[] = new Array(rows);
    for (let i = 0; i < rows; i++) {
      const v = arr[i]!;
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

  generate(ctx: GenContext): string {
    // 0xff fill yields 255.255.255.255; all-zero yields 0.0.0.0; else random.
    return genBytes(ctx.rng, 4).join(".");
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

  generate(ctx: GenContext): string {
    // Format the bytes through the decode path so the generated string matches
    // decode's representation (minimal hex per group, no :: compression).
    return bytesToIpv6(genBytes(ctx.rng, 16));
  }
}
