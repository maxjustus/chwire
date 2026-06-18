import { getCodec } from "./codecs.ts";
import { type Column, DataColumn } from "./columns.ts";
import {
  toInt8,
  toInt16,
  toInt32,
  toInt64,
  toNumber,
  toUInt8,
  toUInt16,
  toUInt32,
  toUInt64,
} from "./coercion.ts";
import type { Block } from "./index.ts";
import type { TypedArrayConstructor } from "./io.ts";
import type { ColumnDef, TypedArray } from "./types.ts";

/**
 * Brand keyed in the global symbol registry so `isRecordBatch` recognizes
 * instances across separate module copies (ESM vs CJS, source vs bundled dist).
 * Plain `instanceof` fails the moment two copies of this class coexist; the
 * brand survives because `Symbol.for` returns one symbol process-wide.
 */
const RECORD_BATCH_BRAND = Symbol.for("chwire.RecordBatch");

type NumericConverter = (v: unknown) => number | bigint;

/** Map of numeric ClickHouse types to their TypedArray constructors and converters. */
const NUMERIC_TYPES: Record<
  string,
  { ctor: TypedArrayConstructor<any>; convert: NumericConverter }
> = {
  Int8: { ctor: Int8Array, convert: toInt8 },
  Int16: { ctor: Int16Array, convert: toInt16 },
  Int32: { ctor: Int32Array, convert: toInt32 },
  Int64: { ctor: BigInt64Array, convert: toInt64 },
  UInt8: { ctor: Uint8Array, convert: toUInt8 },
  UInt16: { ctor: Uint16Array, convert: toUInt16 },
  UInt32: { ctor: Uint32Array, convert: toUInt32 },
  UInt64: { ctor: BigUint64Array, convert: toUInt64 },
  Float32: { ctor: Float32Array, convert: toNumber },
  Float64: { ctor: Float64Array, convert: toNumber },
};

function getNumericTypeInfo(
  type: string,
): { ctor: TypedArrayConstructor<any>; convert: NumericConverter } | undefined {
  return NUMERIC_TYPES[type];
}

/**
 * Growing TypedArray for efficient numeric accumulation.
 * Doubles capacity when full, returns trimmed subarray at finish.
 * Coerces values using the provided converter function.
 */
class GrowingTypedArray<T extends TypedArray> {
  private arr: T;
  private offset = 0;
  private Ctor: TypedArrayConstructor<T>;
  private convert: NumericConverter;

  constructor(Ctor: TypedArrayConstructor<T>, convert: NumericConverter, initialCapacity = 1024) {
    this.Ctor = Ctor;
    this.convert = convert;
    this.arr = new Ctor(initialCapacity) as T;
  }

  push(value: unknown): void {
    if (this.offset >= this.arr.length) {
      const newArr = new this.Ctor(this.arr.length * 2) as T;
      (newArr as any).set(this.arr);
      this.arr = newArr;
    }
    (this.arr as any)[this.offset++] = this.convert(value);
  }

  finish(): T {
    return this.arr.subarray(0, this.offset) as T;
  }
}

/** Options for materializing row data. */
export interface MaterializeOptions {
  /** Convert bigint values (Int64, UInt64, Int128, etc.) to strings. */
  bigIntAsString?: boolean;
}

function maybeStringify(val: unknown, opts?: MaterializeOptions): unknown {
  if (opts?.bigIntAsString && typeof val === "bigint") return val.toString();
  return val;
}

/**
 * A Row object is a Proxy that lazily accesses column data.
 *
 * Performance note: Each `row.field` access goes through a Proxy trap and
 * Map lookup. For hot loops, prefer:
 * - `batch.toArray()` for full materialization
 * - `batch.getColumn(name)` + column iteration for columnar access
 * - `batch.getAt(rowIndex, colIndex)` for direct value access
 */
export type Row = Record<string, unknown> & {
  /** Materialize row to a plain object. */
  toObject(options?: MaterializeOptions): Record<string, unknown>;
  /** Materialize row to a plain array in column order. */
  toArray(options?: MaterializeOptions): unknown[];
};

/**
 * RecordBatch provides an ergonomic, virtual view over columnar ClickHouse data.
 * Matches Apache Arrow terminology - a single batch of records with shared schema.
 */
export class RecordBatch implements Iterable<Row> {
  readonly columns: ColumnDef[];
  readonly columnData: Column[];
  readonly rowCount: number;
  readonly decodeTimeMs?: number;

  /** @internal */ nameToIndex: Map<string, number>;
  private _columnNames: string[];

  constructor(block: Block) {
    this.columns = block.columns;
    this.columnData = block.columnData;
    this.rowCount = block.rowCount;
    if (block.decodeTimeMs !== undefined) this.decodeTimeMs = block.decodeTimeMs;
    this.nameToIndex = new Map(this.columns.map((c, i) => [c.name, i]));
    this._columnNames = this.columns.map((c) => c.name);
  }

  static from(block: Block): RecordBatch {
    return new RecordBatch(block);
  }

  /** Prototype-level brand; see RECORD_BATCH_BRAND. */
  get [RECORD_BATCH_BRAND](): true {
    return true;
  }

  /**
   * Identity-independent RecordBatch check. Prefer this over `instanceof` for
   * dispatching on user-supplied data: it stays correct when the batch was
   * created by a different copy of this module (ESM/CJS or source/dist split).
   */
  static isRecordBatch(value: unknown): value is RecordBatch {
    return (
      typeof value === "object" &&
      value !== null &&
      (value as Record<symbol, unknown>)[RECORD_BATCH_BRAND] === true
    );
  }

  get length(): number {
    return this.rowCount;
  }
  get numCols(): number {
    return this.columns.length;
  }
  get schema(): ColumnDef[] {
    return this.columns;
  }
  get columnNames(): string[] {
    return this._columnNames;
  }

  /** Get column by name. */
  getColumn(name: string): Column | undefined {
    const idx = this.nameToIndex.get(name);
    return idx !== undefined ? this.columnData[idx] : undefined;
  }

  /** Get column by index. */
  getColumnAt(index: number): Column | undefined {
    return this.columnData[index];
  }

  /** Get value at specific row and column index. Allocation-free. */
  getAt(rowIndex: number, colIndex: number): unknown {
    return this.columnData[colIndex]!.get(rowIndex);
  }

  /** Get row at index (returns a lazy Proxy). */
  get(index: number, options?: MaterializeOptions): Row {
    if (index < 0 || index >= this.rowCount) {
      throw new RangeError(`Index out of bounds: ${index}`);
    }
    return createRowProxy(this, index, options);
  }

  /** Iterate over rows lazily. Default iterator creates new proxies per row (safe to store/collect). */
  *[Symbol.iterator](): Iterator<Row> {
    for (let i = 0; i < this.rowCount; i++) {
      yield this.get(i);
    }
  }

  /** Materialize all rows to plain objects. */
  toArray(options?: MaterializeOptions): Record<string, unknown>[] {
    const result = new Array(this.rowCount);
    const numCols = this.columns.length;
    const names = this.columnNames;

    for (let i = 0; i < this.rowCount; i++) {
      const row: Record<string, unknown> = {};
      for (let j = 0; j < numCols; j++) {
        row[names[j]!] = maybeStringify(this.columnData[j]!.get(i), options);
      }
      result[i] = row;
    }
    return result;
  }

  /** For JSON.stringify(table). */
  toJSON(): Record<string, unknown>[] {
    return this.toArray();
  }
}

/**
 * internal helper to create a lazy row proxy.
 */
function createRowProxy(batch: RecordBatch, rowIndex: number, options?: MaterializeOptions): Row {
  const names = batch.columnNames;
  const nameToIndex = batch.nameToIndex;
  const materialize = (opts?: MaterializeOptions) => {
    const o = opts ?? options;
    const obj: Record<string, unknown> = {};
    for (let j = 0; j < batch.numCols; j++) {
      obj[names[j]!] = maybeStringify(batch.columnData[j]!.get(rowIndex), o);
    }
    return obj;
  };
  return new Proxy({} as Row, {
    get(_, prop) {
      if (prop === "toObject" || prop === "toJSON") {
        return materialize;
      }
      if (prop === "toArray") {
        return (opts?: MaterializeOptions) => {
          const o = opts ?? options;
          const arr = new Array(batch.numCols);
          for (let j = 0; j < batch.numCols; j++) {
            arr[j] = maybeStringify(batch.columnData[j]!.get(rowIndex), o);
          }
          return arr;
        };
      }
      if (typeof prop === "string") {
        const idx = nameToIndex.get(prop);
        if (idx !== undefined) return maybeStringify(batch.columnData[idx]!.get(rowIndex), options);
      }
      return undefined;
    },
    ownKeys() {
      return names;
    },
    getOwnPropertyDescriptor(_, prop) {
      if (typeof prop === "string" && nameToIndex.has(prop)) {
        const col = batch.getColumn(prop);
        return {
          enumerable: true,
          configurable: true,
          value: col ? maybeStringify(col.get(rowIndex), options) : undefined,
        };
      }
      return undefined;
    },
    has(_, prop) {
      return typeof prop === "string" && nameToIndex.has(prop);
    },
  });
}

/**
 * Builder for constructing RecordBatches row-by-row.
 * Grows dynamically - no upfront capacity required.
 */
export class RecordBatchBuilder {
  private schema: ColumnDef[];
  private accumulators: (unknown[] | GrowingTypedArray<any>)[];
  private _rowCount: number = 0;
  private finished: boolean = false;

  constructor(schema: ColumnDef[], expectedRows?: number) {
    this.schema = schema;
    const initialCapacity = expectedRows ?? 1024;
    this.accumulators = schema.map((col) => {
      const info = getNumericTypeInfo(col.type);
      return info ? new GrowingTypedArray(info.ctor, info.convert, initialCapacity) : [];
    });
  }

  get rowCount(): number {
    return this._rowCount;
  }

  /** Append a row (values in column order). Coerces values to correct types. */
  appendRow(values: unknown[]): this {
    if (values.length !== this.schema.length) throw new Error("Row length mismatch");
    for (let i = 0; i < values.length; i++) {
      this.accumulators[i]!.push(values[i]);
    }
    this._rowCount++;
    return this;
  }

  /** Finalize and return an immutable RecordBatch. */
  finish(): RecordBatch {
    if (this.finished) throw new Error("Builder already finished");
    this.finished = true;
    const columnData = this.accumulators.map((acc, i) => {
      const type = this.schema[i]!.type;
      if (acc instanceof GrowingTypedArray) {
        return new DataColumn(type, acc.finish());
      }
      return getCodec(type).fromValues(acc);
    });
    return new RecordBatch({
      columns: this.schema,
      columnData,
      rowCount: this._rowCount,
    });
  }
}

/**
 * Create a RecordBatch from row data.
 * Accepts arrays, sync iterables/generators, or async iterables/generators.
 * Returns Promise<RecordBatch> for async iterables.
 *
 * @example
 * // From array
 * batchFromRows(schema, [[1, "a"], [2, "b"]]);
 *
 * // From generator
 * batchFromRows(schema, function*() { yield [1, "a"]; }());
 *
 * // From async generator
 * await batchFromRows(schema, async function*() { yield [1, "a"]; }());
 */
export function batchFromRows(
  schema: ColumnDef[],
  rows: unknown[][] | Iterable<unknown[]>,
  expectedRows?: number,
): RecordBatch;
export function batchFromRows(
  schema: ColumnDef[],
  rows: AsyncIterable<unknown[]>,
  expectedRows?: number,
): Promise<RecordBatch>;
export function batchFromRows(
  schema: ColumnDef[],
  rows: unknown[][] | Iterable<unknown[]> | AsyncIterable<unknown[]>,
  expectedRows?: number,
): RecordBatch | Promise<RecordBatch> {
  // Detect async iterable
  if (typeof (rows as any)[Symbol.asyncIterator] === "function") {
    return (async () => {
      const builder = new RecordBatchBuilder(schema, expectedRows);
      for await (const row of rows as AsyncIterable<unknown[]>) {
        builder.appendRow(row);
      }
      return builder.finish();
    })();
  }
  // Array fast path: pre-allocate columns at exact size, skip builder overhead
  if (Array.isArray(rows)) {
    const n = rows.length;
    const numCols = schema.length;
    const numericInfo = schema.map((col) => getNumericTypeInfo(col.type));
    const accumulators: (unknown[] | TypedArray)[] = schema.map((_, i) => {
      const info = numericInfo[i];
      return info ? new info.ctor(n) : new Array<unknown>(n);
    });

    for (let i = 0; i < n; i++) {
      const row = rows[i]!;
      if (row.length !== numCols) throw new Error("Row length mismatch");
      for (let j = 0; j < numCols; j++) {
        const info = numericInfo[j];
        if (info) {
          (accumulators[j] as any)[i] = info.convert(row[j]);
        } else {
          (accumulators[j] as unknown[])[i] = row[j];
        }
      }
    }

    const columnData = accumulators.map((acc, i) => {
      const type = schema[i]!.type;
      if (ArrayBuffer.isView(acc)) return new DataColumn(type, acc as TypedArray);
      return getCodec(type).fromValues(acc as unknown[]);
    });

    return new RecordBatch({ columns: schema, columnData, rowCount: n });
  }

  // Generic iterable path: unknown size, grow dynamically
  const builder = new RecordBatchBuilder(schema, expectedRows);
  for (const row of rows as Iterable<unknown[]>) {
    builder.appendRow(row);
  }
  return builder.finish();
}

export function validateColumnLengths(
  columnData: readonly Column[],
  columnNames?: readonly string[],
  expectedRowCount?: number,
): number {
  const rowCount = expectedRowCount ?? columnData[0]?.length ?? 0;
  for (let i = 0; i < columnData.length; i++) {
    const c = columnData[i]!;
    if (c.length !== rowCount) {
      const name = columnNames?.[i] ?? `#${i}`;
      throw new Error(
        `Column length mismatch: expected ${rowCount} rows, column ${name} has ${c.length}`,
      );
    }
  }
  return rowCount;
}

/**
 * Create a RecordBatch from pre-built Column objects.
 * Schema is inferred from the columns.
 *
 * @example
 * batchFromCols({
 *   id: getCodec("UInt32").fromValues([1, 2, 3]),
 *   name: getCodec("String").fromValues(["a", "b", "c"]),
 * });
 */
export function batchFromCols(columns: Record<string, Column>): RecordBatch {
  const names = Object.keys(columns);
  const schema = names.map((name) => ({ name, type: columns[name]!.type }));
  const columnData = names.map((name) => columns[name]!);
  const rowCount = validateColumnLengths(columnData, names);
  return new RecordBatch({ columns: schema, columnData, rowCount });
}

/** Data that can be sent as an external table (shared by HTTP and TCP clients). */
export type ExternalTableData = RecordBatch | Iterable<RecordBatch> | AsyncIterable<RecordBatch>;
