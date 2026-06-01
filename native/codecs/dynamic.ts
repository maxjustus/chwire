import {
  countAndIndexDiscriminators,
  type Column,
  type DiscriminatorArray,
  DynamicColumn,
  JsonColumn,
  VariantColumn,
} from "../columns.ts";
import { Dynamic, JSONFormat, Variant } from "../constants.ts";
import { DynamicValue } from "../types.ts";
import { type BufferReader, BufferWriter } from "../io.ts";
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

  constructor(typeStrings: string[], codecs: Codec[]) {
    // ClickHouse canonicalizes a Variant by sorting its arms by type name and
    // assigns discriminators in that sorted order. Match it: a declared order
    // that differs from the sorted order writes discriminators the server reads
    // against its own sorted arms, corrupting the round-trip.
    const order = typeStrings
      .map((_, i) => i)
      .sort((a, b) =>
        typeStrings[a] < typeStrings[b] ? -1 : typeStrings[a] > typeStrings[b] ? 1 : 0,
      );
    this.typeStrings = order.map((i) => typeStrings[i]);
    this.codecs = order.map((i) => codecs[i]);
    this.type = `Variant(${this.typeStrings.join(", ")})`;
  }

  writePrefix(writer: BufferWriter) {
    writer.writeU64LE(Variant.MODE_BASIC);
  }

  readPrefix(reader: BufferReader) {
    reader.offset += 8;
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

  estimateSize(rows: number) {
    const perVariant = Math.ceil(rows / this.codecs.length);
    return rows + this.codecs.reduce((sum, c) => sum + c.estimateSize(perVariant), 0);
  }

  findVariantIndex(value: unknown, types: string[]): number {
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

  readKinds(reader: BufferReader) {
    return readKindsMany(reader, this.codecs);
  }

  toLiteral(value: unknown): string | typeof SQL_NULL {
    if (value == null) return SQL_NULL;
    const idx = this.findVariantIndex(value, this.typeStrings);
    return nullToLiteral(this.codecs[idx].toLiteral(value));
  }

  generate(ctx: GenContext): [number, unknown] | null {
    // Index N selects the NULL discriminator; 0..N-1 select an arm.
    const disc = ctx.rng.int(0, this.codecs.length);
    if (disc === this.codecs.length) return null;
    return [disc, this.codecs[disc].generate(ctx.descend())];
  }

  compare(a: unknown, b: unknown): boolean {
    if (a === null || b === null) return a === b;
    if (!Array.isArray(a) || !Array.isArray(b)) return false;
    const [discA, valA] = a as [number, unknown];
    const [discB, valB] = b as [number, unknown];
    if (discA !== discB) return false;
    return this.codecs[discA].compare(valA, valB);
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
      if (group) this.codecs[i].writePrefix?.(writer, group);
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
        const groupHint = this.codecs[i].estimateSize(group.length);
        writer.write(this.codecs[i].encode(group, groupHint));
      }
    }
    return writer.finish();
  }

  decode(reader: BufferReader, rows: number, state: DeserializerState): DynamicColumn {
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

  fromValues(values: unknown[]): DynamicColumn {
    const typeMap = new Map<string, unknown[]>();
    const typeIndex = new Map<string, number>();
    const typeOrder: string[] = [];
    const discriminators = new Uint8Array(values.length);

    for (let i = 0; i < values.length; i++) {
      const v = values[i];
      if (v == null) continue;
      const typed = v instanceof DynamicValue;
      const vType = typed ? v.type : this.guessType(v);
      const actual = typed ? v.value : v;
      let idx = typeIndex.get(vType);
      if (idx === undefined) {
        idx = typeOrder.length;
        typeIndex.set(vType, idx);
        typeOrder.push(vType);
        typeMap.set(vType, []);
      }
      discriminators[i] = idx;
      typeMap.get(vType)!.push(actual);
    }

    const nullDisc = typeOrder.length;
    for (let i = 0; i < values.length; i++) {
      if (values[i] == null) discriminators[i] = nullDisc;
    }

    const groups = new Map<number, Column>();
    for (let ti = 0; ti < typeOrder.length; ti++) {
      const codec = this.resolveCodec(typeOrder[ti]);
      groups.set(ti, codec.fromValues(typeMap.get(typeOrder[ti])!));
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
   * Generate a bare Dynamic value (matching `DynamicColumn.get`).
   *
   * `DynamicCodec` has no type universe at construction (types are discovered
   * from the wire), so the type is sampled from the harness-injected pool via
   * `ctx.pickDynamicType()`. The pool must only contain types whose generated
   * representation survives `guessType` (`fromValues` re-derives each cell's
   * discriminator from its runtime value, discarding the sampled type), so the
   * harness restricts the pool to `guessType` fixed points.
   *
   * `null` exercises the null discriminator (`types.length`).
   */
  generate(ctx: GenContext): unknown {
    if (ctx.rng.int(0, 9) === 0) return null;
    return this.resolveCodec(ctx.pickDynamicType()).generate(ctx.descend());
  }

  /**
   * `a` is the generated value (possibly a DynamicValue carrying an explicit
   * type); `b` is the decoded bare value. Unwrap and compare via the declared
   * type's codec when known, else structurally — the inner values are in the
   * canonical representation `DynamicColumn.get` returns.
   */
  compare(a: unknown, b: unknown): boolean {
    const av = a instanceof DynamicValue ? a.value : a;
    const bv = b instanceof DynamicValue ? b.value : b;
    if (av == null || bv == null) return av === bv;
    const type = a instanceof DynamicValue ? a.type : b instanceof DynamicValue ? b.type : null;
    return type ? this.resolveCodec(type).compare(av, bv) : deepCompare(av, bv);
  }
}

export class JsonCodec implements Codec {
  readonly type = "JSON";
  private typedPaths: { name: string; type: string; codec: Codec }[] = [];
  private typedPathNames: Set<string>;
  private dynamicPaths: string[] = [];
  private dynamicCodecs = new Map<string, DynamicCodec>();
  private resolveCodec: CodecResolver;

  constructor(resolveCodec: CodecResolver, typedPaths: { name: string; type: string }[] = []) {
    this.resolveCodec = resolveCodec;
    this.typedPaths = typedPaths.map((p) => ({
      name: p.name,
      type: p.type,
      codec: resolveCodec(p.type),
    }));
    this.typedPathNames = new Set(this.typedPaths.map((tp) => tp.name));
  }

  writePrefix(writer: BufferWriter, col: Column) {
    const json = col as JsonColumn;
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

    const allPaths = [...this.typedPaths.map((tp) => tp.name), ...this.dynamicPaths];
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
    const dynCodec = new DynamicCodec(this.resolveCodec);
    for (const path of dynamicPaths) {
      pathColumns.set(path, dynCodec.fromValues(extractPath(path)));
    }

    return new JsonColumn([...this.typedPathNames, ...dynamicPaths], pathColumns, values.length);
  }

  private discoverDynamicPaths(values: unknown[]): string[] {
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
   * paths). Typed paths compare via their codec; dynamic paths compare
   * structurally (both sides are already in the canonical decoded representation,
   * with integers as bigint).
   */
  compare(a: unknown, b: unknown): boolean {
    if (a == null || b == null || typeof a !== "object" || typeof b !== "object") return false;
    const ao = a as Record<string, unknown>;
    const bo = b as Record<string, unknown>;
    const typedCodecs = new Map(this.typedPaths.map((tp) => [tp.name, tp.codec]));

    for (const key of new Set([...Object.keys(ao), ...Object.keys(bo)])) {
      const av = ao[key] ?? null;
      const bv = bo[key] ?? null;
      if (av === null || bv === null) {
        if (av !== bv) return false;
        continue;
      }
      const codec = typedCodecs.get(key);
      if (codec ? !codec.compare(av, bv) : !deepCompare(av, bv)) return false;
    }
    return true;
  }
}
