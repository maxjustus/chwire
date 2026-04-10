import {
  ArrayColumn,
  type Column,
  DataColumn,
  MapColumn,
  NullableColumn,
  TupleColumn,
} from "../columns.ts";
import { LowCardinality as LC } from "../constants.ts";
import { type BufferReader, BufferWriter } from "../io.ts";
import type { DeserializerState } from "../serialization.ts";
import type { TypedArray } from "../types.ts";
import { isArrayLike } from "../coercion.ts";
import {
  asBytes,
  BaseCodec,
  childState,
  type Codec,
  defaultDeserializerState,
  isNumericLikeCodec,
  nullToLiteral,
  readKinds1,
  readKinds2,
  readKindsMany,
  SQL_NULL,
} from "./base.ts";

// When used as a column in Map/Tuple, inner codec's prefix needs to be handled
export class ArrayCodec extends BaseCodec {
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

    writer.write(asBytes(arr.offsets));

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

    if (isNumericLikeCodec(this.inner)) {
      const inner = this.inner;
      const allInner = new inner.Ctor(totalCount);
      const convert = inner.converter;
      let offset = 0n;
      let idx = 0;
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

  estimateSize(rows: number) {
    return rows * 8 + this.inner.estimateSize(rows * 5);
  }

  readKinds(reader: BufferReader) {
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
export class NullableCodec extends BaseCodec {
  readonly type: string;
  private inner: Codec;

  constructor(type: string, inner: Codec) {
    super();
    this.type = type;
    this.inner = inner;
  }

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

  estimateSize(rows: number) {
    return rows + this.inner.estimateSize(rows);
  }

  readKinds(reader: BufferReader) {
    return readKinds1(reader, this.inner);
  }

  toLiteral(value: unknown, quoted?: boolean) {
    if (value == null) return SQL_NULL;
    return this.inner.toLiteral(value, quoted);
  }

  serializeLiteral(): string {
    return "";
  }
}

// LowCardinality stores a dictionary of unique values and indices into that dictionary.
// When wrapping Nullable(T), the dictionary stores T values (not Nullable(T)) and index 0
// is reserved for NULL. This avoids storing null flags per dictionary entry - nullness is
// encoded in the index itself.
export class LowCardinalityCodec extends BaseCodec {
  readonly type: string;
  private inner: Codec;
  private dictCodec: Codec;

  constructor(type: string, inner: Codec) {
    super();
    this.type = type;
    this.inner = inner;
    this.dictCodec = inner instanceof NullableCodec ? inner.getInnerCodec() : inner;
  }

  writePrefix(writer: BufferWriter) {
    writer.writeU64LE(LC.VERSION);
  }

  readPrefix(reader: BufferReader) {
    reader.offset += 8;
  }

  encode(col: Column, sizeHint?: number): Uint8Array {
    const len = col.length;
    if (len === 0) return new Uint8Array(0);

    const hint = sizeHint ?? this.estimateSize(len);
    const writer = new BufferWriter(hint);
    const isNullable = this.inner instanceof NullableCodec;

    const dict = new Map<unknown, number>();
    const dictValues: unknown[] = [];
    const indices: number[] = [];

    if (isNullable) {
      dict.set(null, 0);
      dictValues.push(null);
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

    writer.writeU64LE(LC.FLAG_ADDITIONAL_KEYS | indexType);
    writer.writeU64LE(BigInt(dictValues.length));
    const dictHint = this.dictCodec.estimateSize(dictValues.length);
    writer.write(this.dictCodec.encode(this.dictCodec.fromValues(dictValues), dictHint));
    writer.writeU64LE(BigInt(col.length));
    writer.write(new Uint8Array(new IndexArray(indices).buffer));

    return writer.finish();
  }

  decodeDense(reader: BufferReader, rows: number): Column {
    if (rows === 0) return new DataColumn(this.type, []);

    const flags = reader.readU64LE();
    const indexType = Number(flags & LC.INDEX_TYPE_MASK);
    const isNullable = this.inner instanceof NullableCodec;

    const dictSize = Number(reader.readU64LE());
    const dict = this.dictCodec.decode(reader, dictSize, defaultDeserializerState());
    const count = Number(reader.readU64LE());

    let indices: TypedArray;
    if (indexType === Number(LC.INDEX_U8)) indices = reader.readTypedArray(Uint8Array, count);
    else if (indexType === Number(LC.INDEX_U16))
      indices = reader.readTypedArray(Uint16Array, count);
    else if (indexType === Number(LC.INDEX_U32))
      indices = reader.readTypedArray(Uint32Array, count);
    else indices = reader.readTypedArray(BigUint64Array, count);

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
    return this.inner.fromValues(values);
  }

  zeroValue() {
    return this.inner.zeroValue();
  }

  getDictKey(v: unknown): unknown {
    if (v === null || typeof v !== "object") return v;
    if (v instanceof Date) return v.getTime();
    if (v instanceof Uint8Array) {
      let s = "\0B:";
      for (let i = 0; i < v.length; i++) {
        const byte = v[i];
        s += (byte >> 4).toString(16) + (byte & 0xf).toString(16);
      }
      return s;
    }
    if (typeof v === "object") {
      const keys = Object.keys(v as object).sort();
      return `\0O:${keys.map((k) => `${k}:${this.getDictKey((v as any)[k])}`).join(",")}`;
    }
    return v;
  }

  estimateSize(rows: number) {
    const dictSize = Math.min(rows, 65536);
    return 8 + 8 + this.dictCodec.estimateSize(dictSize) + 8 + rows * 2;
  }

  readKinds(reader: BufferReader) {
    return readKinds1(reader, this.inner);
  }

  toLiteral(value: unknown, quoted?: boolean) {
    return this.inner.toLiteral(value, quoted);
  }

  serializeLiteral(): string {
    return "";
  }
}

// Map is serialized as Array(Tuple(K, V))
// Prefixes are written at top level, not inside the data.
export class MapCodec extends BaseCodec {
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

  estimateSize(rows: number) {
    const avgEntries = rows * 3;
    return (
      rows * 8 + this.keyCodec.estimateSize(avgEntries) + this.valCodec.estimateSize(avgEntries)
    );
  }

  readKinds(reader: BufferReader) {
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

export class TupleCodec extends BaseCodec {
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

  estimateSize(rows: number) {
    return this.elements.reduce((sum, e) => sum + e.codec.estimateSize(rows), 0);
  }

  readKinds(reader: BufferReader) {
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
