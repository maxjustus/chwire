import { type ColumnBuilder, columnFromRows, makeDefaultColumnBuilder } from "./codecs/base.ts";
import { getCodec } from "./codecs.ts";
import type { Column } from "./columns.ts";
import type { Block } from "./index.ts";
import type { ColumnDef } from "./types.ts";

/**
 * Brand keyed in the global symbol registry so `isRecordBatch` recognizes
 * instances across separate module copies (ESM vs CJS, source vs bundled dist).
 * Plain `instanceof` fails the moment two copies of this class coexist; the
 * brand survives because `Symbol.for` returns one symbol process-wide.
 */
const RECORD_BATCH_BRAND = Symbol.for("chwire.RecordBatch");

function makeColumnBuilder(type: string, expectedRows?: number): ColumnBuilder {
  const codec = getCodec(type);
  return codec.makeBuilder?.(expectedRows) ?? makeDefaultColumnBuilder(codec, expectedRows);
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
  private builders: ColumnBuilder[];
  private _rowCount: number = 0;
  private finished: boolean = false;

  constructor(schema: ColumnDef[], expectedRows?: number) {
    this.schema = schema;
    this.builders = schema.map((col) => makeColumnBuilder(col.type, expectedRows));
  }

  get rowCount(): number {
    return this._rowCount;
  }

  /** Append a row (values in column order). Coerces values to correct types. */
  appendRow(values: unknown[]): this {
    if (values.length !== this.schema.length) throw new Error("Row length mismatch");
    for (let i = 0; i < values.length; i++) {
      this.builders[i]!.push(values[i]);
    }
    this._rowCount++;
    return this;
  }

  /** Finalize and return an immutable RecordBatch. */
  finish(): RecordBatch {
    if (this.finished) throw new Error("Builder already finished");
    this.finished = true;
    const columnData = this.builders.map((builder) => builder.finish());
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
  if (Array.isArray(rows)) {
    const numCols = schema.length;
    for (const row of rows) {
      if (row.length !== numCols) throw new Error("Row length mismatch");
    }
    const columnData = schema.map((col, i) => {
      const codec = getCodec(col.type);
      return codec.fromRows?.(rows, i) ?? columnFromRows(codec, rows, i);
    });
    return new RecordBatch({ columns: schema, columnData, rowCount: rows.length });
  }

  const builder = new RecordBatchBuilder(schema, expectedRows);
  for (const row of rows as Iterable<unknown[]>) builder.appendRow(row);
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
