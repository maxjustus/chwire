/**
 * Client-generated fuzz tests for the Native format.
 *
 * Unlike fuzz/http.ts (which uses ClickHouse's generateRandom as the data
 * source and cityHash64 as the oracle), here the CLIENT generates random rows
 * via codec.generate() and ClickHouse is the oracle:
 *
 *   R = generate -> encodeNative -> INSERT -> SELECT FORMAT Native -> decode = R'
 *   assert codec.compare(R, R')
 *
 * This is stronger than an in-process round-trip because CH re-serializes
 * between INSERT and SELECT: R' comes from CH's encoder, not ours. The INSERT
 * itself succeeding is a zeroth check - CH rejects malformed discriminator
 * streams and bad type prefixes at parse time.
 *
 * The seed is derived deterministically from the iteration index so a failing
 * case can be re-run via FUZZ_ITERATION_INDEX.
 */

import { describe, it } from "node:test";
import {
  type ColumnDef,
  DynamicValue,
  encodeNative,
  getCodec,
  streamDecodeNative,
} from "../native/index.ts";
import {
  extractTypeArgs,
  type GenContext,
  parseTypeList,
  type Rng,
} from "../native/codecs/base.ts";
import { JsonCodec } from "../native/codecs/dynamic.ts";
import { batchFromRows } from "../native/table.ts";
import { collectText, dataChunks, init, insert, type QueryPacket, query } from "../client.ts";
import { startClickHouse, stopClickHouse } from "../test/setup.ts";
import { type Compression, config, logConfig, logFuzzError, getIterationIndex } from "./config.ts";

logConfig("generated");

// Settings required for experimental/complex types in CREATE/INSERT/SELECT.
const COMPLEX_TYPE_SETTINGS = {
  use_variant_as_common_type: true,
  allow_experimental_variant_type: true,
  allow_suspicious_variant_types: true,
  allow_experimental_dynamic_type: true,
  allow_experimental_json_type: true,
  output_format_native_use_flattened_dynamic_and_json_serialization: true,
  // The Nested codec implements the Array(Tuple) representation. The default
  // flatten_nested=1 expands a top-level Nested into separate v.<field> Array
  // columns, which a single Nested column cannot round-trip; flatten_nested=0
  // stores it as the Array(Tuple) the codec produces.
  flatten_nested: false,
};

/** Column kinds the type roll can produce, gated by FUZZ_KINDS. */
type Kind = "scalar" | "composite" | "variant" | "dynamic" | "json";
const ALL_KINDS: Kind[] = ["scalar", "composite", "variant", "dynamic", "json"];

function enabledKinds(): Set<Kind> {
  const value = process.env.FUZZ_KINDS;
  if (!value) return new Set(ALL_KINDS);
  const requested = value
    .split(",")
    .map((k) => k.trim())
    .filter((k): k is Kind => (ALL_KINDS as string[]).includes(k));
  return new Set(requested.length > 0 ? requested : ALL_KINDS);
}

/**
 * Pool for every Dynamic generation path (standalone columns, Array(Dynamic) and
 * other Dynamic-in-composite forms, JSON dynamic paths). Cells are wrapped in
 * DynamicValue, which carries an explicit type and bypasses guessType, so the
 * full type space is reachable rather than only the guessType fixed points. Kept
 * under max_dynamic_types (default 32): the distinct-type count per Dynamic
 * column is bounded by the pool size regardless of element/row count, so each
 * type gets its own discriminator rather than spilling into the shared-data path
 * (which the codec does not implement).
 */
const FULL_DYNAMIC_TYPE_POOL = [
  "Int8",
  "Int32",
  "Int64",
  "Int128",
  "UInt8",
  "UInt64",
  "Float32",
  "Float64",
  "Bool",
  "String",
  "FixedString(16)",
  "UUID",
  "Date",
  "DateTime",
  "DateTime64(9)",
  "Decimal(18, 4)",
  "IPv4",
  "IPv6",
  "Array(Int64)",
  "Array(String)",
];

/**
 * mulberry32 PRNG: deterministic, seedable, fast. The seed comes from the
 * iteration index so failures replay.
 */
function makeRng(seed: number): Rng {
  let state = seed >>> 0;
  const next = (): number => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int(min: number, max: number): number {
      return min + Math.floor(next() * (max - min + 1));
    },
  };
}

/**
 * Generation depth budget for client-invented Dynamic/JSON nesting. Raised from
 * a polite 4 so deeply nested values are produced. `MAX_STRUCTURE_DEPTH` is the
 * separate, higher bound on CH-supplied generateRandomStructure types (deep
 * Tuples) so they are not rejected for nesting; it stays under a level that
 * would OOM.
 */
const MAX_DEPTH = 14;
const MAX_STRUCTURE_DEPTH = 20;

/** Total Array/Map elements one generated cell may contain (bounds large + deep containers). */
const ELEMENT_BUDGET = 256;

function makeContext(
  rng: Rng,
  depth: number,
  dynamicTypePool: string[],
  budget: { remaining: number } = { remaining: ELEMENT_BUDGET },
): GenContext {
  const ctx: GenContext = {
    rng,
    depth,
    budget,
    descend(): GenContext {
      return makeContext(rng, Math.max(0, depth - 1), dynamicTypePool, budget);
    },
    pickDynamicType(): string {
      return dynamicTypePool[rng.int(0, dynamicTypePool.length - 1)];
    },
  };
  return ctx;
}

/** Stable seed for an iteration: distinct per index, deterministic across runs. */
function seedFor(iterationIndex: number): number {
  return (iterationIndex * 0x9e3779b1 + 0x1234567) >>> 0;
}

/** Leaf types we can generate that CH accepts as Variant arms. */
const VARIANT_LEAF_TYPES = [
  "Int8",
  "Int16",
  "Int32",
  "Int64",
  "UInt8",
  "UInt16",
  "UInt32",
  "UInt64",
  "Float32",
  "Float64",
  "Bool",
  "String",
  "Date",
  "Date32",
  "UUID",
  "IPv4",
  "IPv6",
  "Decimal(18, 4)",
  "DateTime64(3)",
  "Array(String)",
  "Array(Int64)",
];

/**
 * Types that contain a leaf we cannot yet generate standalone, or that need
 * their own kind. Reject when any appears anywhere in the type tree.
 */
const UNSUPPORTED_SUBSTRINGS = ["JSON", "Variant", "Nothing", "AggregateFunction", "Interval"];

/**
 * Whether a CH type can be rolled into a scalar/composite column: its codec
 * builds, a probe generate() succeeds (so no NotImplemented leaf), and nesting
 * stays within MAX_DEPTH. The probe is the source of truth — it directly tests
 * that every leaf codec implements generate().
 */
function isGeneratable(type: string, rng: Rng): boolean {
  for (const sub of UNSUPPORTED_SUBSTRINGS) {
    if (type.includes(sub)) return false;
  }
  // Accept deep CH-supplied structures (e.g. ~15-level Tuples) up to a bound
  // that avoids OOM; only the generation depth (MAX_DEPTH) is the polite one.
  if (nestingDepth(type) > MAX_STRUCTURE_DEPTH) return false;
  try {
    const codec = getCodec(type);
    // Probe a few draws: a single draw may take an empty-container branch and
    // skip an unimplemented leaf codec.
    for (let i = 0; i < 4; i++) {
      codec.generate(makeContext(rng, MAX_DEPTH, FULL_DYNAMIC_TYPE_POOL));
    }
    return true;
  } catch {
    return false;
  }
}

/** Parenthesis nesting depth of a type string. */
function nestingDepth(type: string): number {
  let depth = 0;
  let max = 0;
  for (const ch of type) {
    if (ch === "(") max = Math.max(max, ++depth);
    else if (ch === ")") depth--;
  }
  return max;
}

const COMPOSITE_PREFIXES = [
  "Array",
  "Tuple",
  "Map",
  "Nullable",
  "LowCardinality",
  "Nested",
  "Point",
  "Ring",
  "Polygon",
  "MultiPolygon",
];

function isComposite(type: string): boolean {
  return COMPOSITE_PREFIXES.some((p) => type.startsWith(p));
}

/** Ask CH for a random column type matching one of the requested kinds. */
async function rollColumnType(
  kinds: Set<Kind>,
  rng: Rng,
  sessionId: string,
  conn: { baseUrl: string; auth: { username: string; password: string } },
): Promise<{ kind: Kind; type: string } | null> {
  const wantScalar = kinds.has("scalar");
  const wantComposite = kinds.has("composite");
  const wantVariant = kinds.has("variant");
  const wantDynamic = kinds.has("dynamic");
  const wantJson = kinds.has("json");

  // Oversample the complex kinds: they carry the marquee coverage. When a
  // plain kind is also requested, take a complex kind 1/3 of the time; when
  // only complex kinds are requested, always.
  const complexKinds: Kind[] = [];
  if (wantVariant) complexKinds.push("variant");
  if (wantDynamic) complexKinds.push("dynamic");
  if (wantJson) complexKinds.push("json");
  if (complexKinds.length > 0 && (!(wantScalar || wantComposite) || rng.int(0, 2) === 0)) {
    const kind = complexKinds[rng.int(0, complexKinds.length - 1)];
    if (kind === "variant") return { kind, type: rollVariantType(rng) };
    if (kind === "dynamic") return { kind, type: "Dynamic" };
    return { kind, type: await rollJsonType(rng, sessionId, conn) };
  }

  let scalarLeaf: string | null = null;
  for (let attempt = 0; attempt < 8; attempt++) {
    // generateRandomStructure(1, seed) yields a single "name Type" column;
    // a per-attempt seed varies it deterministically.
    const chSeed = rng.int(0, 0x7fffffff);
    const structure = (
      await collectText(
        query(`SELECT generateRandomStructure(1, ${chSeed}) FORMAT TabSeparated`, sessionId, {
          baseUrl: conn.baseUrl,
          auth: conn.auth,
        }),
      )
    ).trim();
    const match = structure.match(/^\S+\s+(.+)$/);
    if (!match) continue;
    // TSV escapes backslash-quote in Enum names; unescape before use (as fuzz/http.ts does).
    const type = match[1].replace(/\\'/g, "'");
    if (!isGeneratable(type, rng)) continue;
    if (isComposite(type)) {
      if (wantComposite) return { kind: "composite", type };
      // composite rolled but only scalar wanted: keep rolling
    } else {
      if (wantScalar) return { kind: "scalar", type };
      if (scalarLeaf === null) scalarLeaf = type; // remember for wrapping
    }
  }
  // Composite requested but no natural composite was rolled in time: wrap a
  // scalar leaf so the composite wrappers stay covered. CH supplied the leaf.
  if (wantComposite && scalarLeaf !== null) {
    const wrapped = wrapScalar(scalarLeaf, rng);
    if (isGeneratable(wrapped, rng)) return { kind: "composite", type: wrapped };
  }
  return null;
}

/** Wrap a scalar leaf in a composite. Array/Tuple accept any element type. */
function wrapScalar(leaf: string, rng: Rng): string {
  return rng.int(0, 1) === 0 ? `Array(${leaf})` : `Tuple(${leaf}, ${leaf})`;
}

/** Compose a Variant from 2-4 distinct generatable leaf arms (CH dedupes arms). */
function rollVariantType(rng: Rng): string {
  const count = rng.int(2, 4);
  const arms: string[] = [];
  for (let i = 0; i < count; i++) {
    const arm = VARIANT_LEAF_TYPES[rng.int(0, VARIANT_LEAF_TYPES.length - 1)];
    if (!arms.includes(arm)) arms.push(arm);
  }
  if (arms.length < 2) arms.push(arms[0] === "String" ? "Int64" : "String");
  return `Variant(${arms.join(", ")})`;
}

/**
 * Compose a JSON type with 0-3 typed paths. Typed-path types come from CH's
 * generateRandomStructure (matching fuzz/http.ts:216) restricted to generatable
 * scalars, each wrapped in Nullable so an absent path round-trips as omitted
 * rather than as a materialized default. A bare `JSON` (no typed paths) is also
 * rolled to exercise the all-dynamic-path code path.
 */
async function rollJsonType(
  rng: Rng,
  sessionId: string,
  conn: { baseUrl: string; auth: { username: string; password: string } },
): Promise<string> {
  const numTypedPaths = rng.int(0, 3);
  const defs: string[] = [];
  for (let p = 0; defs.length < numTypedPaths && p < numTypedPaths * 4; p++) {
    const chSeed = rng.int(0, 0x7fffffff);
    const structure = (
      await collectText(
        query(`SELECT generateRandomStructure(1, ${chSeed}) FORMAT TabSeparated`, sessionId, {
          baseUrl: conn.baseUrl,
          auth: conn.auth,
        }),
      )
    ).trim();
    const match = structure.match(/^\S+\s+(.+)$/);
    if (!match) continue;
    const type = match[1].replace(/\\'/g, "'");
    // Nullable wraps scalars only; composites round-trip non-null defaults
    // differently, so skip them as typed paths here.
    if (isComposite(type) || !isGeneratable(type, rng)) continue;
    defs.push(`tp_${defs.length} Nullable(${type})`);
  }
  return defs.length > 0 ? `JSON(${defs.join(", ")})` : "JSON";
}

/**
 * Per-column structural shape. i.i.d. per-row picks give geometric-tail
 * coverage and miss runs and all-null columns, which the Variant discriminator
 * machinery (width selection, run indexing) needs exercised.
 */
type Shape = "all-null" | "run" | "alternating" | "uniform";
const SHAPES: Shape[] = ["all-null", "run", "alternating", "uniform"];

/**
 * Build per-row selectors over a label set under a shape. Each entry is a label
 * index in [0, labelCount) or null (the NULL discriminator). Variant arms and
 * Dynamic pool types share this scheduling since both drive a discriminator
 * stream with the same coverage needs (runs, alternation, all-null).
 */
function selectorsForShape(
  shape: Shape,
  rowCount: number,
  labelCount: number,
  rng: Rng,
): (number | null)[] {
  const selectors = new Array<number | null>(rowCount);
  switch (shape) {
    case "all-null":
      selectors.fill(null);
      return selectors;
    case "run": {
      const label = rng.int(0, labelCount - 1);
      selectors.fill(label);
      return selectors;
    }
    case "alternating": {
      const a = rng.int(0, labelCount - 1);
      const b = rng.int(0, labelCount - 1);
      for (let r = 0; r < rowCount; r++) selectors[r] = r % 2 === 0 ? a : b;
      return selectors;
    }
    default:
      for (let r = 0; r < rowCount; r++) {
        const pick = rng.int(0, labelCount); // labelCount selects NULL
        selectors[r] = pick === labelCount ? null : pick;
      }
      return selectors;
  }
}

/**
 * Generate the cells for one column. Variant and Dynamic columns route through
 * the shape scheduler so discriminator runs/all-null/alternation are covered;
 * other kinds draw each cell i.i.d. via the column codec's generate().
 */
function generateCells(kind: Kind, canonicalType: string, rng: Rng, rowCount: number): unknown[] {
  const cells = new Array<unknown>(rowCount);
  const ctx = () => makeContext(rng, MAX_DEPTH, FULL_DYNAMIC_TYPE_POOL);
  const shape = SHAPES[rng.int(0, SHAPES.length - 1)];

  if (kind === "variant") {
    const arms = parseTypeList(extractTypeArgs(canonicalType));
    const armCodecs = arms.map((t) => getCodec(t));
    const selectors = selectorsForShape(shape, rowCount, arms.length, rng);
    for (let r = 0; r < rowCount; r++) {
      const sel = selectors[r];
      cells[r] = sel === null ? null : [sel, armCodecs[sel].generate(ctx())];
    }
    return cells;
  }

  if (kind === "dynamic") {
    // Each pool type is a distinct discriminator; the shape controls how they
    // are distributed across rows (runs, alternation, all-null, uniform mix).
    // DynamicValue carries the explicit type so guessType is bypassed and the
    // full type space round-trips, not just guessType fixed points.
    const pool = FULL_DYNAMIC_TYPE_POOL;
    const poolCodecs = pool.map((t) => getCodec(t));
    const selectors = selectorsForShape(shape, rowCount, poolCodecs.length, rng);
    for (let r = 0; r < rowCount; r++) {
      const sel = selectors[r];
      cells[r] = sel === null ? null : new DynamicValue(pool[sel], poolCodecs[sel].generate(ctx()));
    }
    return cells;
  }

  if (kind === "json") {
    return generateJsonCells(canonicalType, rng, rowCount);
  }

  const codec = getCodec(canonicalType);
  for (let r = 0; r < rowCount; r++) cells[r] = codec.generate(ctx());
  return cells;
}

/**
 * Per-column dynamic-path presence shape. i.i.d. per-row presence only covers
 * the dense/uniform case; the discriminator and path-presence machinery in
 * JsonColumn needs runs and disjoint columns exercised explicitly.
 */
type JsonShape = "dense" | "sparse-tail" | "present-then-absent" | "disjoint";
const JSON_SHAPES: JsonShape[] = ["dense", "sparse-tail", "present-then-absent", "disjoint"];

/**
 * Build per-dynamic-path presence masks under a column shape. `masks[p][r]` is
 * true when dynamic path `p` carries a value in row `r`.
 *   - dense: every path present in every row.
 *   - sparse-tail: each path present only in a short final run of rows.
 *   - present-then-absent: each path present for a leading run, absent after.
 *   - disjoint: each row carries exactly one path (paths never co-occur).
 */
function dynamicPathMasks(
  shape: JsonShape,
  pathCount: number,
  rowCount: number,
  rng: Rng,
): boolean[][] {
  const masks = Array.from({ length: pathCount }, () => new Array<boolean>(rowCount).fill(false));
  if (pathCount === 0) return masks;
  switch (shape) {
    case "dense":
      for (const mask of masks) mask.fill(true);
      return masks;
    case "sparse-tail": {
      const tail = Math.max(1, Math.floor(rowCount / 20));
      for (const mask of masks) {
        for (let r = rowCount - tail; r < rowCount; r++) mask[r] = true;
      }
      return masks;
    }
    case "present-then-absent":
      for (const mask of masks) {
        const cut = rng.int(0, rowCount);
        for (let r = 0; r < cut; r++) mask[r] = true;
      }
      return masks;
    default:
      for (let r = 0; r < rowCount; r++) masks[rng.int(0, pathCount - 1)][r] = true;
      return masks;
  }
}

/**
 * Generate JSON cells. The typed-path object comes from JsonCodec.generate
 * (Nullable typed paths, so null omits the path). Dynamic paths (`dp_0..`) carry
 * bare Dynamic values whose per-row presence follows a scheduled column shape.
 */
function generateJsonCells(canonicalType: string, rng: Rng, rowCount: number): unknown[] {
  const ctx = () => makeContext(rng, MAX_DEPTH, FULL_DYNAMIC_TYPE_POOL);
  const json = getCodec(canonicalType) as JsonCodec;
  const dynCodec = getCodec("Dynamic");

  const pathCount = rng.int(0, 3);
  const shape = JSON_SHAPES[rng.int(0, JSON_SHAPES.length - 1)];
  const masks = dynamicPathMasks(shape, pathCount, rowCount, rng);

  const cells = new Array<Record<string, unknown>>(rowCount);
  for (let r = 0; r < rowCount; r++) {
    const obj = json.generate(ctx());
    for (let p = 0; p < pathCount; p++) {
      if (!masks[p][r]) continue;
      const v = dynCodec.generate(ctx());
      if (v !== null) obj[`dp_${p}`] = v;
    }
    cells[r] = obj;
  }
  return cells;
}

async function consume(input: AsyncIterable<QueryPacket>): Promise<void> {
  for await (const _ of input) {
  }
}

interface Mismatch {
  rowIndex: number;
  expected: string;
  actual: string;
}

/**
 * Run the Tier-1 oracle for a single generated column and assert compare()
 * holds for every row. Throws on the first mismatch with replay context.
 */
async function runColumn(opts: {
  kind: Kind;
  columnType: string;
  seed: number;
  rowCount: number;
  compression: Compression;
  baseUrl: string;
  auth: { username: string; password: string };
  sessionId: string;
  insertSessionId: string;
  table: string;
}): Promise<void> {
  const { kind, columnType, seed, rowCount, compression, baseUrl, auth } = opts;

  await consume(
    query(`CREATE TABLE ${opts.table} (v ${columnType}) ENGINE = Memory`, opts.sessionId, {
      baseUrl,
      auth,
      compression: false,
      settings: COMPLEX_TYPE_SETTINGS,
    }),
  );

  // VariantCodec reorders arms into ClickHouse's canonical (sorted) order, so
  // codec.type is the type CH actually stores. Build, encode, and compare
  // against it so discriminators line up with the server.
  const codec = getCodec(columnType);
  const canonicalType = codec.type;
  const schema: ColumnDef[] = [{ name: "v", type: canonicalType }];

  const rng = makeRng(seed);
  const cells = generateCells(kind, canonicalType, rng, rowCount);
  const rows: unknown[][] = cells.map((c) => [c]);

  const encoded = encodeNative(batchFromRows(schema, rows));

  // Zeroth check: a malformed stream is rejected here.
  await insert(`INSERT INTO ${opts.table} FORMAT Native`, encoded, opts.insertSessionId, {
    baseUrl,
    auth,
    settings: COMPLEX_TYPE_SETTINGS,
  });

  const queryResult = query(`SELECT v FROM ${opts.table} FORMAT Native`, opts.sessionId, {
    baseUrl,
    auth,
    compression,
    settings: COMPLEX_TYPE_SETTINGS,
  });

  const decoded: unknown[] = [];
  for await (const block of streamDecodeNative(dataChunks(queryResult), { mapAsArray: true })) {
    for (const row of block.columnData[0]) {
      decoded.push(row);
    }
  }

  if (decoded.length !== rows.length) {
    throw new Error(
      `Row count mismatch for ${canonicalType}: expected ${rows.length}, got ${decoded.length}`,
    );
  }

  const mismatches: Mismatch[] = [];
  for (let r = 0; r < rows.length; r++) {
    const expected = rows[r][0];
    const actual = decoded[r];
    if (!codec.compare(expected, actual)) {
      mismatches.push({ rowIndex: r, expected: stringify(expected), actual: stringify(actual) });
      if (mismatches.length >= 5) break;
    }
  }

  if (mismatches.length > 0) {
    const detail = mismatches
      .map((m) => `  row ${m.rowIndex} col 0: expected ${m.expected}, actual ${m.actual}`)
      .join("\n");
    throw new Error(
      `compare mismatch for ${canonicalType} (requested ${columnType}, seed=${seed}):\n${detail}`,
    );
  }
}

/** Serialize a value for error output, including bigint. */
function stringify(value: unknown): string {
  return JSON.stringify(value, (_k, v) => (typeof v === "bigint" ? `${v}n` : v)) ?? String(value);
}

describe("Native client-generated Fuzz Tests", { timeout: 600000 }, () => {
  for (const compression of config.compressions) {
    it(`round-trips client-generated data (compression=${compression})`, async () => {
      const kinds = enabledKinds();

      await init();
      const clickhouse = await startClickHouse();
      const baseUrl = `${clickhouse.url}/`;
      const auth = { username: clickhouse.username, password: clickhouse.password };

      try {
        const iterationIndex = getIterationIndex();
        const N = config.iterations;
        const iterations = iterationIndex !== null ? 1 : N;
        const startIdx = iterationIndex ?? 0;

        for (let i = startIdx; i < startIdx + iterations; i++) {
          const rowCount = config.rows;
          const seed = seedFor(i);
          const suffix = `${Date.now()}_${i}_${Math.random().toString(36).slice(2)}`;
          const sessionId = `generated_fuzz_${compression}_${suffix}`;
          const insertSessionId = `${sessionId}_insert`;
          const table = `generated_fuzz_${suffix}`;

          // Roll the column type with its own seeded rng so the per-row
          // generation rng (re-seeded inside runColumn) stays deterministic.
          const rolled = await rollColumnType(kinds, makeRng(seed ^ 0x5bd1e995), sessionId, {
            baseUrl,
            auth,
          });
          if (!rolled) {
            console.log(`[generated fuzz ${i + 1}/${N}] no generatable type rolled, skipping`);
            continue;
          }
          const { kind, type: columnType } = rolled;

          console.log(
            `[generated fuzz ${i + 1}/${N} compression=${compression}] ${kind} ${columnType} seed=${seed}`,
          );

          try {
            await runColumn({
              kind,
              columnType,
              seed,
              rowCount,
              compression,
              baseUrl,
              auth,
              sessionId,
              insertSessionId,
              table,
            });
          } catch (err) {
            logFuzzError(
              {
                testType: "generated",
                iteration: i,
                totalIterations: N,
                compression: compression as Compression,
                rows: rowCount,
                structure: `${kind} ${columnType} seed=${seed}`,
              },
              err,
            );
            throw err;
          } finally {
            await consume(
              query(`DROP TABLE IF EXISTS ${table} SYNC`, insertSessionId, {
                baseUrl,
                auth,
                compression: false,
              }),
            );
          }
        }
      } finally {
        await stopClickHouse();
      }
    });
  }
});
