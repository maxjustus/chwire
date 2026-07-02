import {
  countAndIndexDiscriminators,
  type Column,
  type DiscriminatorArray,
  DynamicColumn,
  JsonColumn,
  VariantColumn,
} from "../columns.ts";
import { isArrayLike, isTypedArray } from "../coercion.ts";
import { Dynamic, JSONFormat, Variant } from "../constants.ts";
import { DynamicValue, type TypedArray, VariantValue } from "../types.ts";
import { type BufferReader, BufferWriter, type TypedArrayConstructor } from "../io.ts";
import type { DeserializerState } from "../serialization.ts";
import {
  asBytes,
  childState,
  type Codec,
  deepCompare,
  escapeString,
  type GenContext,
  nullToLiteral,
  readKindsMany,
  SQL_NULL,
} from "./base.ts";

export type CodecResolver = (type: string) => Codec;

/**
 * Order strings the way ClickHouse orders Variant arms and JSON sub-columns:
 * by raw code-unit value (`tp_10` before `tp_2`), never locale-aware. These
 * columns are serialized positionally with no name on the wire, so our encode
 * order must match the server's sort exactly or the streams desync on decode.
 */
const byteOrder = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Smallest typed array whose element width can address `numIndexes` distinct
 * values; mirrors ClickHouse's getSmallestIndexesType, which sizes the V3
 * flattened Dynamic index column as num_types + 1 (for the null index).
 */
function smallestIndexArrayCtor(
  numIndexes: number,
): Uint8ArrayConstructor | Uint16ArrayConstructor | Uint32ArrayConstructor {
  if (numIndexes <= 256) return Uint8Array;
  if (numIndexes <= 65536) return Uint16Array;
  return Uint32Array;
}

/**
 * Compare one Dynamic cell: `a` may be a generated `DynamicValue` carrying an
 * explicit type; `b` is the bare decoded value. Unwrap both, null-check, then
 * compare via the declared type's codec when either side is type-tagged, else
 * structurally. Shared by `DynamicCodec.compare` and the dynamic-path branch of
 * `JsonCodec.compare`.
 */
/** Strip the explicit-type wrapper a generated Dynamic cell may carry. */
function unwrapDynamic(x: unknown): unknown {
  return x instanceof DynamicValue ? x.value : x;
}

function compareDynamicCell(resolve: CodecResolver, a: unknown, b: unknown): boolean {
  const av = unwrapDynamic(a);
  const bv = unwrapDynamic(b);
  if (av == null || bv == null) return av === bv;
  const type = a instanceof DynamicValue ? a.type : b instanceof DynamicValue ? b.type : null;
  return type ? resolve(type).compare(av, bv) : deepCompare(av, bv);
}

function decodeGroups(
  reader: BufferReader,
  codecs: Codec[],
  counts: Uint32Array,
  state: DeserializerState,
): Map<number, Column> {
  const groups = new Map<number, Column>();
  for (let i = 0; i < codecs.length; i++) {
    const n = counts[i]!;
    if (n > 0) {
      groups.set(i, codecs[i]!.decode(reader, n, childState(state, i)));
    }
  }
  return groups;
}

/**
 * VariantCodec handles Variant(T1, T2, ...) types.
 *
 * Implements instead extending BaseCodec because:
 * - Variant has its own null representation (discriminator=255)
 * - Sparse serialization applies to children, not variant itself
 * - Discriminators are always dense-encoded
 *
 * Children (variant groups) may be sparse-encoded individually.
 */
export class VariantCodec implements Codec {
  readonly type: string;
  private typeStrings: string[];
  private codecs: Codec[];
  private primitiveDisc: Record<string, number>;

  constructor(typeStrings: string[], codecs: Codec[]) {
    // ClickHouse canonicalizes a Variant by sorting its arms by type name and
    // assigns discriminators in that sorted order. Match it: a declared order
    // that differs from the sorted order writes discriminators the server reads
    // against its own sorted arms, corrupting the round-trip.
    const order = typeStrings
      .map((_, i) => i)
      .sort((a, b) => byteOrder(typeStrings[a]!, typeStrings[b]!));
    this.typeStrings = order.map((i) => typeStrings[i]!);
    this.codecs = order.map((i) => codecs[i]!);
    this.type = `Variant(${this.typeStrings.join(", ")})`;

    // Fast typeof->arm cache; must stay in sync with findVariantIndex's rules.
    this.primitiveDisc = Object.create(null) as Record<string, number>;
    for (let i = 0; i < this.typeStrings.length; i++) {
      const t = this.typeStrings[i]!;
      if (t === "String") this.primitiveDisc.string ??= i;
      else if (t === "Bool") this.primitiveDisc.boolean ??= i;
      else if (t === "Int64" || t === "UInt64") this.primitiveDisc.bigint ??= i;
      else if (t.startsWith("Int") || t.startsWith("UInt") || t.startsWith("Float"))
        this.primitiveDisc.number ??= i;
    }
  }

  writePrefix(writer: BufferWriter, col: Column) {
    writer.writeU64LE(Variant.MODE_BASIC);
    // ClickHouse writes every arm's serialization prefix after the mode flag,
    // in sorted arm order, regardless of whether that arm carries any rows
    // (e.g. a LowCardinality arm writes its key-version even with zero values).
    // Pass the arm's group column when present, else an empty column of the arm
    // type so nested prefix writers (Array/Tuple/Map -> LowCardinality) still
    // emit their static metadata.
    const variant = col as VariantColumn;
    for (let i = 0; i < this.codecs.length; i++) {
      const codec = this.codecs[i]!;
      const group = variant.groups.get(i) ?? codec.fromValues([]);
      codec.writePrefix?.(writer, group);
    }
  }

  readPrefix(reader: BufferReader) {
    reader.offset += 8;
    for (const codec of this.codecs) codec.readPrefix?.(reader);
  }

  encode(col: Column, sizeHint?: number): Uint8Array {
    const variant = col as VariantColumn;
    const hint = sizeHint ?? this.estimateSize(col.length);
    const writer = new BufferWriter(hint);
    writer.write(variant.discriminators);
    for (let i = 0; i < this.codecs.length; i++) {
      const group = variant.groups.get(i);
      if (group) {
        const codec = this.codecs[i]!;
        writer.write(codec.encode(group, codec.estimateSize(group.length)));
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
    const n = values.length;
    const discriminators = new Uint8Array(n);
    const armCount = this.codecs.length;
    const variantValues: unknown[][] = this.codecs.map(() => []);

    for (let i = 0; i < n; i++) {
      const v = values[i];
      if (v == null) {
        discriminators[i] = Variant.NULL_DISCRIMINATOR;
        continue;
      }
      if (v instanceof VariantValue) {
        const d = v.discriminator;
        if (d < 0 || d >= armCount) {
          throw new Error(`Invalid Variant discriminator ${d}, expected 0-${armCount - 1}`);
        }
        discriminators[i] = d;
        variantValues[d]!.push(v.value);
        continue;
      }
      const disc = this.primitiveDisc[typeof v];
      if (disc !== undefined) {
        discriminators[i] = disc;
        variantValues[disc]!.push(v);
      } else {
        const idx = this.findVariantIndex(v, this.typeStrings);
        discriminators[i] = idx;
        variantValues[idx]!.push(v);
      }
    }

    const groups = new Map<number, Column>();
    for (let vi = 0; vi < armCount; vi++) {
      const vals = variantValues[vi]!;
      if (vals.length > 0) {
        groups.set(vi, this.codecs[vi]!.fromValues(vals));
      }
    }

    return new VariantColumn(this.type, discriminators, groups);
  }

  zeroValue() {
    return null;
  }

  estimateSize(rows: number) {
    const perVariant = Math.ceil(rows / this.codecs.length);
    return rows + this.codecs.reduce((sum, c) => sum + c.estimateSize(perVariant), 0);
  }

  findVariantIndex(value: unknown, types: string[]): number {
    for (let i = 0; i < types.length; i++) {
      const t = types[i]!;
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

  readKinds(reader: BufferReader) {
    return readKindsMany(reader, this.codecs);
  }

  toLiteral(value: unknown): string | typeof SQL_NULL {
    if (value == null) return SQL_NULL;
    if (value instanceof VariantValue) {
      return nullToLiteral(this.codecs[value.discriminator]!.toLiteral(value.value));
    }
    const idx = this.findVariantIndex(value, this.typeStrings);
    return nullToLiteral(this.codecs[idx]!.toLiteral(value));
  }

  generate(ctx: GenContext): VariantValue | null {
    // Index N selects the NULL discriminator; 0..N-1 select an arm.
    const disc = ctx.rng.int(0, this.codecs.length);
    if (disc === this.codecs.length) return null;
    return new VariantValue(disc, this.codecs[disc]!.generate(ctx.descend()));
  }

  compare(a: unknown, b: unknown): boolean {
    if (a === null || b === null) return a === b;
    if (!(a instanceof VariantValue) || !(b instanceof VariantValue)) return false;
    if (a.discriminator !== b.discriminator) return false;
    return this.codecs[a.discriminator]!.compare(a.value, b.value);
  }
}

/**
 * DynamicCodec handles Dynamic type (runtime-typed values).
 *
 * Implements instead extending BaseCodec because:
 * - Dynamic has its own null representation (discriminator=types.length)
 * - Sparse serialization applies to children, not dynamic itself
 * - Discriminators are always dense-encoded
 *
 * Children (type groups) may be sparse-encoded individually.
 */
export class DynamicCodec implements Codec {
  readonly type = "Dynamic";
  private types: string[] = [];
  private codecs: Codec[] = [];
  private resolveCodec: CodecResolver;

  constructor(resolveCodec: CodecResolver) {
    this.resolveCodec = resolveCodec;
  }

  writePrefix(writer: BufferWriter, col: Column) {
    const dyn = col as DynamicColumn;
    this.types = dyn.types;
    this.codecs = this.types.map((t) => this.resolveCodec(t));

    writer.writeU64LE(Dynamic.VERSION_V3);
    writer.writeVarint(this.types.length);
    for (const t of this.types) writer.writeString(t);

    for (let i = 0; i < this.types.length; i++) {
      const group = dyn.groups.get(i);
      if (group) this.codecs[i]!.writePrefix?.(writer, group);
    }
  }

  readPrefix(reader: BufferReader) {
    const version = reader.readU64LE();
    if (version !== Dynamic.VERSION_V3)
      throw new Error(`Dynamic: only V3 supported, got V${version}`);

    const count = reader.readVarint();
    this.types = [];
    for (let i = 0; i < count; i++) this.types.push(reader.readString());
    this.codecs = this.types.map((t) => this.resolveCodec(t));

    for (const c of this.codecs) c.readPrefix?.(reader);
  }

  encode(col: Column, sizeHint?: number): Uint8Array {
    const dyn = col as DynamicColumn;
    const hint = sizeHint ?? this.estimateSize(col.length);
    const writer = new BufferWriter(hint);

    writer.write(asBytes(dyn.discriminators));

    for (let i = 0; i < this.codecs.length; i++) {
      const group = dyn.groups.get(i);
      if (group) {
        const codec = this.codecs[i]!;
        writer.write(codec.encode(group, codec.estimateSize(group.length)));
      }
    }
    return writer.finish();
  }

  decode(reader: BufferReader, rows: number, state: DeserializerState): DynamicColumn {
    const nullDisc = this.types.length;
    // V3 flattened indexes use the smallest width that fits nullDisc + 1
    // values (CH getSmallestIndexesType); shared-variant overflow means the
    // flattened type list is NOT bounded by max_types, so >255 is legal.
    const Ctor = smallestIndexArrayCtor(nullDisc + 1);
    const discriminators: DiscriminatorArray = reader.readTypedArray(
      Ctor as TypedArrayConstructor<DiscriminatorArray>,
      rows,
    );

    const { counts, indices } = countAndIndexDiscriminators(discriminators, nullDisc);
    const groups = decodeGroups(reader, this.codecs, counts, state);
    return new DynamicColumn(this.types, discriminators, groups, indices);
  }

  fromValues(values: unknown[]): DynamicColumn {
    return this.build(values, null, values.length);
  }

  /**
   * Build a column from sparse data: `values[j]` belongs to row
   * `rowIndices[j]`; every other row is null. `rowIndices === null` means
   * identity (`values[j]` is row `j`), with rows past `values.length` null.
   * Lets JsonCodec scatter only the keys a row actually has instead of
   * materializing a dense rows-length array per path.
   */
  fromSparse(rowIndices: number[] | null, values: unknown[], rows: number): DynamicColumn {
    return this.build(values, rowIndices, rows);
  }

  private build(values: unknown[], rowIndices: number[] | null, rows: number): DynamicColumn {
    const NULL_SENTINEL = 0xffffffff;
    const typeIndex = new Map<string, number>();
    const typeOrder: string[] = [];
    const typeValues: unknown[][] = [];
    const k = values.length;
    // The discriminator width depends on the type count, which is only known
    // after the scan; collect wide and narrow at the end. In the dense case
    // (k === rows) discriminators are written in place; sparse input scans
    // into a scratch array and scatters to final row positions afterwards.
    const wide = new Uint32Array(rows);
    const discs = rowIndices ? new Uint32Array(k) : wide;
    let hasNulls = false;

    for (let j = 0; j < k; j++) {
      const v = values[j];
      if (v == null) {
        discs[j] = NULL_SENTINEL;
        hasNulls = true;
        continue;
      }
      const typed = v instanceof DynamicValue;
      const vType = typed ? v.type : this.guessType(v);
      const actual = typed ? v.value : v;
      let idx = typeIndex.get(vType);
      if (idx === undefined) {
        idx = typeOrder.length;
        typeIndex.set(vType, idx);
        typeOrder.push(vType);
        typeValues.push([]);
      }
      discs[j] = idx;
      typeValues[idx]!.push(actual);
    }

    const nullDisc = typeOrder.length;
    if (rowIndices) {
      if (nullDisc !== 0) wide.fill(nullDisc);
      for (let j = 0; j < k; j++) {
        const d = discs[j]!;
        wide[rowIndices[j]!] = d === NULL_SENTINEL ? nullDisc : d;
      }
    } else {
      if (hasNulls) {
        for (let i = 0; i < k; i++) {
          if (wide[i] === NULL_SENTINEL) wide[i] = nullDisc;
        }
      }
      if (k < rows && nullDisc !== 0) wide.fill(nullDisc, k);
    }

    // Server-side, types beyond max_types overflow into the shared variant on
    // unflatten, so any count the index width can address is legal.
    const Ctor = smallestIndexArrayCtor(nullDisc + 1);
    const discriminators = Ctor === Uint32Array ? wide : new Ctor(wide);

    const groups = new Map<number, Column>();
    for (let ti = 0; ti < nullDisc; ti++) {
      groups.set(ti, this.resolveCodec(typeOrder[ti]!).fromValues(typeValues[ti]!));
    }

    return new DynamicColumn(typeOrder, discriminators, groups);
  }

  zeroValue() {
    return null;
  }

  estimateSize(rows: number) {
    return rows * 2 + this.codecs.reduce((sum, c) => sum + c.estimateSize(Math.ceil(rows / 3)), 0);
  }

  guessType(value: unknown): string {
    switch (typeof value) {
      case "string":
        return "String";
      case "number":
        return Number.isInteger(value) ? "Int64" : "Float64";
      case "bigint":
        return "Int64";
      case "boolean":
        return "Bool";
      case "object":
        if (value === null) return "String";
        if (value instanceof Date) return "DateTime64(3)";
        if (Array.isArray(value))
          return value.length ? `Array(${this.guessType(value[0])})` : "Array(String)";
        return "Map(String,String)";
      default:
        return "String";
    }
  }

  readKinds(reader: BufferReader) {
    return readKindsMany(reader, this.codecs);
  }

  toLiteral(value: unknown): string | typeof SQL_NULL {
    if (value == null) return SQL_NULL;
    const vType = this.guessType(value);
    const codec = this.resolveCodec(vType);
    return nullToLiteral(codec.toLiteral(value));
  }

  /**
   * Generate an explicit-typed Dynamic value (`DynamicValue`).
   *
   * `DynamicCodec` has no type universe at construction (types are discovered
   * from the wire), so the type is sampled from the harness-injected pool via
   * `ctx.pickDynamicType()`. Wrapping the sampled value in a `DynamicValue`
   * carries the type through `fromValues`, which otherwise re-derives the
   * discriminator from the runtime value via `guessType` and would collapse the
   * full type space onto `guessType` fixed points. This makes the whole pool
   * reachable for nested Dynamic (Array(Dynamic), JSON dynamic paths), matching
   * how standalone Dynamic columns are generated.
   *
   * `null` exercises the null discriminator (`types.length`).
   */
  generate(ctx: GenContext): unknown {
    if (ctx.rng.int(0, 9) === 0) return null;
    const t = ctx.pickDynamicType();
    return new DynamicValue(t, this.resolveCodec(t).generate(ctx.descend()));
  }

  /**
   * `a` is the generated value (possibly a DynamicValue carrying an explicit
   * type); `b` is the decoded bare value. The inner values are in the canonical
   * representation `DynamicColumn.get` returns.
   */
  compare(a: unknown, b: unknown): boolean {
    return compareDynamicCell(this.resolveCodec, a, b);
  }
}

export class JsonCodec implements Codec {
  readonly type: string;
  private typedPaths: { name: string; type: string; codec: Codec }[] = [];
  private typedPathNames: Set<string>;
  private typedPathNameList: string[];
  private dynamicPaths: string[] = [];
  private dynamicCodecs = new Map<string, DynamicCodec>();
  private resolveCodec: CodecResolver;

  constructor(
    resolveCodec: CodecResolver,
    typedPaths: { name: string; type: string }[] = [],
    type = "JSON",
  ) {
    this.type = type;
    this.resolveCodec = resolveCodec;
    // ClickHouse canonicalizes JSON typed paths into lexicographic order. The
    // sub-columns are serialized positionally (no per-path name on the wire), so
    // our order must match the server's or the streams desync. Match its plain
    // byte-order sort (e.g. `tp_10` before `tp_2`).
    this.typedPaths = typedPaths
      .map((p) => ({ name: p.name, type: p.type, codec: resolveCodec(p.type) }))
      .sort((a, b) => byteOrder(a.name, b.name));
    this.typedPathNameList = this.typedPaths.map((tp) => tp.name);
    this.typedPathNames = new Set(this.typedPathNameList);
  }

  writePrefix(writer: BufferWriter, col: Column) {
    const json = col as JsonColumn;
    this.dynamicCodecs.clear();
    this.dynamicPaths = json.paths.filter((p) => !this.typedPathNames.has(p));

    writer.writeU64LE(JSONFormat.VERSION_V3);
    writer.writeVarint(this.dynamicPaths.length);
    for (const p of this.dynamicPaths) writer.writeString(p);

    for (const tp of this.typedPaths) {
      const pathCol = json.pathColumns.get(tp.name);
      if (pathCol) {
        tp.codec.writePrefix?.(writer, pathCol);
      }
    }

    for (const path of this.dynamicPaths) {
      const codec = new DynamicCodec(this.resolveCodec);
      const pathCol = json.pathColumns.get(path)!;
      codec.writePrefix(writer, pathCol);
      this.dynamicCodecs.set(path, codec);
    }
  }

  readPrefix(reader: BufferReader) {
    this.dynamicCodecs.clear();
    const ver = reader.readU64LE();
    if (ver !== JSONFormat.VERSION_V3) throw new Error(`JSON: only V3 supported, got V${ver}`);

    const count = reader.readVarint();
    const allPathNames: string[] = [];
    for (let i = 0; i < count; i++) allPathNames.push(reader.readString());

    this.dynamicPaths = allPathNames.filter((p) => !this.typedPathNames.has(p));

    for (const tp of this.typedPaths) tp.codec.readPrefix?.(reader);

    for (const path of this.dynamicPaths) {
      const codec = new DynamicCodec(this.resolveCodec);
      codec.readPrefix(reader);
      this.dynamicCodecs.set(path, codec);
    }
  }

  encode(col: Column, sizeHint?: number): Uint8Array {
    const json = col as JsonColumn;
    const hint = sizeHint ?? this.estimateSize(col.length);
    const writer = new BufferWriter(hint);

    for (const tp of this.typedPaths) {
      const pathCol = json.pathColumns.get(tp.name);
      if (pathCol) {
        const encoded = tp.codec.encode(pathCol);
        writer.write(encoded);
      }
    }

    for (const path of this.dynamicPaths) {
      const pathCol = json.pathColumns.get(path)!;
      const pathCodec = this.dynamicCodecs.get(path)!;
      const pathHint = pathCodec.estimateSize(pathCol.length);
      writer.write(pathCodec.encode(pathCol, pathHint));
    }
    return writer.finish();
  }

  decode(reader: BufferReader, rows: number, state: DeserializerState): JsonColumn {
    const pathColumns = new Map<string, Column>();
    let idx = 0;

    for (const tp of this.typedPaths) {
      pathColumns.set(tp.name, tp.codec.decode(reader, rows, childState(state, idx++)));
    }

    for (const path of this.dynamicPaths) {
      pathColumns.set(
        path,
        this.dynamicCodecs.get(path)!.decode(reader, rows, childState(state, idx++)),
      );
    }

    const allPaths = [...this.typedPathNameList, ...this.dynamicPaths];
    return new JsonColumn(allPaths, pathColumns, rows, this.type);
  }

  fromValues(values: unknown[]): JsonColumn {
    const n = values.length;
    const typedPathArrays = this.typedPaths.map(() => new Array<unknown>(n).fill(null));
    // rows === null means the path has appeared in every row so far (identity
    // indices); it is materialized only when a gap shows up, so fully-dense
    // paths never allocate an index array.
    const dynamicPathEntries = new Map<string, { rows: number[] | null; values: unknown[] }>();
    const dynamicPathOrder: string[] = [];

    for (let i = 0; i < n; i++) {
      const v = values[i];
      if (!v || typeof v !== "object") continue;
      if (Array.isArray(v)) {
        throw new TypeError(
          "JSON column values must be plain objects; top-level arrays are not supported",
        );
      }
      const obj = v as Record<string, unknown>;

      for (let tp = 0; tp < this.typedPaths.length; tp++) {
        const val = obj[this.typedPaths[tp]!.name];
        if (val !== undefined) typedPathArrays[tp]![i] = val;
      }

      for (const key in obj) {
        if (!Object.hasOwn(obj, key) || this.typedPathNames.has(key)) continue;
        let entry = dynamicPathEntries.get(key);
        if (!entry) {
          entry = { rows: null, values: [] };
          dynamicPathEntries.set(key, entry);
          dynamicPathOrder.push(key);
        }
        if (entry.rows) {
          entry.rows.push(i);
        } else if (entry.values.length !== i) {
          entry.rows = Array.from({ length: entry.values.length }, (_, j) => j);
          entry.rows.push(i);
        }
        entry.values.push(obj[key]);
      }
    }

    const pathColumns = new Map<string, Column>();
    for (let tp = 0; tp < this.typedPaths.length; tp++) {
      pathColumns.set(
        this.typedPaths[tp]!.name,
        this.typedPaths[tp]!.codec.fromValues(typedPathArrays[tp]!),
      );
    }

    const dynCodec = new DynamicCodec(this.resolveCodec);
    for (const path of dynamicPathOrder) {
      const entry = dynamicPathEntries.get(path)!;
      pathColumns.set(path, dynCodec.fromSparse(entry.rows, entry.values, n));
    }

    return this.assembleColumn(pathColumns, dynamicPathOrder, n);
  }

  fromCols(input: Record<string, Column | unknown[] | TypedArray>): JsonColumn {
    const keys = Object.keys(input);

    const firstKey = keys[0];
    const rowCount = firstKey === undefined ? 0 : input[firstKey]!.length;
    for (const key of keys) {
      const len = input[key]!.length;
      if (len !== rowCount) {
        throw new Error(
          `Column length mismatch: '${firstKey}' has ${rowCount} rows, '${key}' has ${len}`,
        );
      }
    }

    const pathColumns = new Map<string, Column>();

    for (const tp of this.typedPaths) {
      const value = input[tp.name];
      if (value === undefined) {
        throw new Error(
          `Missing typed path '${tp.name}' (declared in ${this.type}); ` +
            `pass an array of nulls for an all-null path`,
        );
      }
      if (isArrayLike(value)) {
        pathColumns.set(tp.name, tp.codec.fromValues(value));
      } else {
        // Exact-spelling match: codecs preserve caller spelling, so there is no
        // canonical form to compare against, and whitespace-insensitive equality
        // can false-positive on pathological names (`a UInt8` vs `aU Int8`).
        if (value.type !== tp.type) {
          throw new Error(
            `Type mismatch for typed path '${tp.name}': expected '${tp.type}', got '${value.type}'`,
          );
        }
        pathColumns.set(tp.name, value);
      }
    }

    const dynamicPathOrder: string[] = [];
    const dynCodec = new DynamicCodec(this.resolveCodec);
    for (const key of keys) {
      if (this.typedPathNames.has(key)) continue;
      const value = input[key]!;
      // JS callers can pass anything; a non-arraylike is only usable when it is
      // a genuine Dynamic column (any other shape loses per-value types).
      const colType = isArrayLike(value) ? undefined : (value as Column).type;
      if (typeof colType === "string" && colType.startsWith("Dynamic")) {
        dynamicPathOrder.push(key);
        pathColumns.set(key, value as Column);
        continue;
      }
      if (!Array.isArray(value)) {
        const got = isTypedArray(value)
          ? "a TypedArray"
          : typeof colType === "string"
            ? `a '${colType}' column`
            : `a ${typeof value}`;
        throw new TypeError(
          `Dynamic path '${key}' must be a plain array or a Dynamic column, got ${got}. ` +
            `TypedArrays and typed columns lose per-value type information; ` +
            `use DynamicValue[] to pin types.`,
        );
      }
      dynamicPathOrder.push(key);
      pathColumns.set(key, dynCodec.fromValues(value));
    }

    return this.assembleColumn(pathColumns, dynamicPathOrder, rowCount);
  }

  private assembleColumn(
    pathColumns: Map<string, Column>,
    dynamicPathOrder: string[],
    rowCount: number,
  ): JsonColumn {
    dynamicPathOrder.sort(byteOrder);
    const allPaths = [...this.typedPathNameList, ...dynamicPathOrder];
    return new JsonColumn(allPaths, pathColumns, rowCount, this.type);
  }

  zeroValue() {
    return {};
  }

  estimateSize(rows: number) {
    return rows * 32;
  }

  readKinds(reader: BufferReader) {
    const allCodecs = [...this.typedPaths.map((tp) => tp.codec), ...this.dynamicCodecs.values()];
    return readKindsMany(reader, allCodecs);
  }

  toLiteral(value: unknown): string | typeof SQL_NULL {
    if (value == null) return SQL_NULL;
    return `'${escapeString(JSON.stringify(value), true)}'`;
  }

  /**
   * Generate a random JSON object from the typed paths (matching
   * `JsonColumn.get`): each typed path via its codec, null values omitted since
   * `JsonColumn.get` omits null paths on decode. Dynamic paths are scheduled by
   * the fuzz harness (per-column path-presence shapes) and merged on top.
   */
  generate(ctx: GenContext): Record<string, unknown> {
    const obj: Record<string, unknown> = {};
    for (const tp of this.typedPaths) {
      const v = tp.codec.generate(ctx.descend());
      if (v !== null) obj[tp.name] = v;
    }
    return obj;
  }

  /**
   * Compare two JSON objects under the null-path-omission rule: a path absent in
   * one side equals a null/absent path in the other (`JsonColumn.get` omits null
   * paths). Typed paths compare via their codec. Dynamic paths carry a generated
   * `DynamicValue` (explicit type) on side `a` and a bare decoded value on side
   * `b`; compare via the declared type's codec so type-aware equality (Float32
   * precision, Decimal scale, DateTime64 ticks) applies, falling back to a
   * structural compare when neither side is type-tagged.
   */
  compare(a: unknown, b: unknown): boolean {
    if (a == null || b == null || typeof a !== "object" || typeof b !== "object") return false;
    const ao = a as Record<string, unknown>;
    const bo = b as Record<string, unknown>;
    const typedCodecs = new Map(this.typedPaths.map((tp) => [tp.name, tp.codec]));

    for (const key of new Set([...Object.keys(ao), ...Object.keys(bo)])) {
      const rawA = ao[key] ?? null;
      const rawB = bo[key] ?? null;
      const typedCodec = typedCodecs.get(key);
      if (typedCodec) {
        const av = unwrapDynamic(rawA);
        const bv = unwrapDynamic(rawB);
        if (av === null || bv === null) {
          if (av !== bv) return false;
          continue;
        }
        if (!typedCodec.compare(av, bv)) return false;
        continue;
      }
      if (!compareDynamicCell(this.resolveCodec, rawA, rawB)) return false;
    }
    return true;
  }
}
