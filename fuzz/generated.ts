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
const COMPLEX_KINDS: Kind[] = ["variant", "dynamic", "json"];

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
 * Types the isGeneratable probe falls back on for a Dynamic leaf inside a
 * candidate. generateRandomStructure never emits Dynamic, so this only keeps the
 * probe from crashing on a hypothetical Dynamic-bearing candidate; the real
 * per-iteration fuzzing pool comes from buildDynamicTypePool.
 */
const PROBE_DYNAMIC_TYPES = ["Int64", "String", "Float64", "Bool"];

/**
 * Size of a Dynamic column's distinct-type pool. With a bare Dynamic (default
 * max_types=32) each pool type keeps its own discriminator; a column that declares
 * a lower max_types (see rollDynamicType) overflows the pool into the shared
 * variant on purpose — the flattened wire format presents those back as ordinary
 * discriminators, so it still round-trips.
 */
const DYNAMIC_POOL_SIZE = 24;

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
      codec.generate(makeContext(rng, MAX_DEPTH, PROBE_DYNAMIC_TYPES));
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

interface Conn {
  baseUrl: string;
  auth: { username: string; password: string };
}

/**
 * Draw a single random CH type via `generateRandomStructure(1, seed)`, which
 * yields one `name Type` column. Returns the bare type (Enum TSV-escaping of
 * `\'` undone, matching fuzz/http.ts) or null if the structure did not parse.
 */
async function fetchRandomStructureType(
  rng: Rng,
  sessionId: string,
  conn: Conn,
): Promise<string | null> {
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
  if (!match) return null;
  return match[1].replace(/\\'/g, "'");
}

/**
 * Whether a type is a legal Dynamic subtype. Dynamic is stored as a Variant
 * internally, so a subtype must be a legal Variant arm: CH forbids a Nullable (or
 * LowCardinality(Nullable)) arm since the discriminator already encodes absence.
 * The rule is on the arm's top-level constructor, so Array(Nullable(T)) etc. stay
 * legal. Extended as the INSERT oracle surfaces further restrictions.
 */
function dynamicArmAllowed(type: string): boolean {
  return !type.startsWith("Nullable") && !type.startsWith("LowCardinality(Nullable");
}

/**
 * Build the pool of types one Dynamic column may hold this iteration, drawn from
 * CH's generateRandomStructure and filtered to what our codecs can generate. This
 * replaces a hand-maintained constant: CH owns "what types exist", isGeneratable
 * owns "what we can decode". Bounded by DYNAMIC_POOL_SIZE. The pool gets its own
 * seeded rng so it stays deterministic for replay without perturbing per-row gen.
 */
async function buildDynamicTypePool(rng: Rng, sessionId: string, conn: Conn): Promise<string[]> {
  const pool: string[] = [];
  const seen = new Set<string>();
  for (
    let attempt = 0;
    attempt < DYNAMIC_POOL_SIZE * 4 && pool.length < DYNAMIC_POOL_SIZE;
    attempt++
  ) {
    const type = await fetchRandomStructureType(rng, sessionId, conn);
    if (type === null || seen.has(type)) continue;
    seen.add(type);
    // Permissive: admit anything our codecs can generate and CH allows as a
    // Dynamic arm. Restrictions are discovered from INSERT rejections and encoded
    // in dynamicArmAllowed.
    if (isGeneratable(type, rng) && dynamicArmAllowed(type)) {
      pool.push(type);
    }
  }
  return pool.length > 0 ? pool : PROBE_DYNAMIC_TYPES;
}

/** Ask CH for a random column type matching one of the requested kinds. */
async function rollColumnType(
  kinds: Set<Kind>,
  rng: Rng,
  sessionId: string,
  conn: Conn,
): Promise<{ kind: Kind; type: string; table?: string } | null> {
  const wantScalar = kinds.has("scalar");
  const wantComposite = kinds.has("composite");
  const complexKinds = COMPLEX_KINDS.filter((k) => kinds.has(k));

  // Oversample the complex kinds: they carry the marquee coverage. When a plain
  // kind is also requested, take a complex kind 1/3 of the time; otherwise always.
  const wantPlain = wantScalar || wantComposite;
  if (complexKinds.length > 0 && (!wantPlain || rng.int(0, 2) === 0)) {
    const kind = complexKinds[rng.int(0, complexKinds.length - 1)];
    return rollComplexType(kind, rng, sessionId, conn);
  }
  return rollPlainType(wantScalar, wantComposite, rng, sessionId, conn);
}

/** Wrap a canonical Variant in a composite to exercise nested-Variant columns. */
function wrapVariant(variant: string, rng: Rng): string {
  switch (rng.int(0, 2)) {
    case 0:
      return `Array(${variant})`;
    case 1:
      return `Map(String, ${variant})`;
    default:
      return `Tuple(c0 ${variant}, c1 Int64)`;
  }
}

/**
 * Roll a Dynamic column shape: a bare Dynamic, a capped Dynamic whose low
 * max_types forces the pool's distinct types to overflow into the shared variant,
 * or a Dynamic nested inside a composite (Array/Map/Tuple). All round-trip through
 * the flattened wire format.
 */
function rollDynamicType(rng: Rng): string {
  switch (rng.int(0, 3)) {
    case 0:
      return `Dynamic(max_types=${rng.int(1, 8)})`;
    case 1:
      return "Array(Dynamic)";
    case 2:
      return rng.int(0, 1) === 0 ? "Map(String, Dynamic)" : "Tuple(c0 Dynamic, c1 Dynamic)";
    default:
      return "Dynamic";
  }
}

/** Resolve an already-chosen complex kind to a concrete column type. */
async function rollComplexType(
  kind: Kind,
  rng: Rng,
  sessionId: string,
  conn: Conn,
): Promise<{ kind: Kind; type: string; table?: string } | null> {
  if (kind === "variant") {
    const v = await rollVariantType(rng, sessionId, conn);
    if (v === null) return null;
    // 1/3 of the time nest the canonical Variant in a composite. The oracle table
    // holds a top-level Variant column, so the wrapped column needs a fresh table:
    // drop the oracle one and let runColumn create it (no preCreated reuse).
    if (rng.int(0, 2) === 0) {
      await consume(
        query(`DROP TABLE IF EXISTS ${v.table} SYNC`, sessionId, {
          baseUrl: conn.baseUrl,
          auth: conn.auth,
          compression: false,
        }),
      );
      return { kind, type: wrapVariant(v.type, rng) };
    }
    return { kind, type: v.type, table: v.table };
  }
  if (kind === "dynamic") return { kind, type: rollDynamicType(rng) };
  return { kind, type: await rollJsonType(rng, sessionId, conn) };
}

/**
 * Roll a scalar or composite type from CH's generateRandomStructure, retrying up
 * to 8x for a natural match. If a composite was wanted but none was rolled in
 * time, wrap a remembered scalar leaf so the composite wrappers stay covered.
 */
async function rollPlainType(
  wantScalar: boolean,
  wantComposite: boolean,
  rng: Rng,
  sessionId: string,
  conn: Conn,
): Promise<{ kind: Kind; type: string } | null> {
  let scalarLeaf: string | null = null;
  for (let attempt = 0; attempt < 8; attempt++) {
    const type = await fetchRandomStructureType(rng, sessionId, conn);
    if (type === null || !isGeneratable(type, rng)) continue;
    if (isComposite(type)) {
      if (wantComposite) return { kind: "composite", type };
      // composite rolled but only scalar wanted: keep rolling
    } else {
      if (wantScalar) return { kind: "scalar", type };
      if (scalarLeaf === null) scalarLeaf = type; // remember for wrapping
    }
  }
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

/**
 * Reject an arm whose top-level wrapper is Nullable or LowCardinality(Nullable):
 * CH rejects those directly inside a Variant with BAD_ARGUMENTS. Nested Nullable
 * (Array(Nullable(T)), Tuple(a Nullable(T))) is a legal arm, so this checks only
 * the outermost wrapper, not a blanket substring.
 */
function isTopLevelNullableArm(arm: string): boolean {
  return arm.startsWith("Nullable") || /^LowCardinality\(Nullable/.test(arm);
}

/**
 * Compose a Variant from arms drawn via CH's generateRandomStructure, then let
 * CH canonicalize and dedup the arm set.
 *
 * CH sorts Variant arms by their canonical type string and silently collapses
 * collisions where aliases coincide (Decimal32(2)==Decimal(9, 2),
 * Int64+Int64==Int64) without erroring. The codec sorts arms the same way but
 * does NOT canonicalize aliases, so a client-side dedup-by-codec-string keeps
 * arms CH collapses, desyncing discriminators. The dedup must therefore be done
 * by CH: build a candidate Variant, CREATE a throwaway table, read the compact
 * canonical form from system.columns.type, DROP. If fewer than 2 distinct arms
 * survive (collision collapse) or the candidate is illegal, return null so the
 * caller skips, mirroring rollColumnType's null path.
 */
async function rollVariantType(
  rng: Rng,
  sessionId: string,
  conn: Conn,
): Promise<{ type: string; table: string } | null> {
  const armCount = rng.int(2, 5);
  const arms: string[] = [];
  for (let attempt = 0; arms.length < armCount && attempt < armCount * 4; attempt++) {
    const arm = await fetchRandomStructureType(rng, sessionId, conn);
    if (arm === null) continue;
    if (isTopLevelNullableArm(arm)) continue;
    if (!isGeneratable(arm, rng)) continue;
    arms.push(arm);
  }
  if (arms.length < 2) return null;

  // Let CH dedup + canonicalize the arm set via the CREATE TABLE / system.columns
  // oracle (CH collapses aliases like Decimal32(2)==Decimal(9,2) that the codec's
  // string sort does not). The table is KEPT and returned so runColumn reuses it
  // — it already holds the canonical column — instead of creating a second one.
  // Dropped here only on the reject/collapse paths; on success the caller drops it.
  // Math.random (not the seeded rng) so parallel jobs that share an iteration
  // seed across compressions get distinct names instead of colliding on one table.
  const table = `variant_canon_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const drop = () =>
    consume(
      query(`DROP TABLE IF EXISTS ${table} SYNC`, sessionId, {
        baseUrl: conn.baseUrl,
        auth: conn.auth,
        compression: false,
      }),
    );

  let canonical: string;
  try {
    await consume(
      query(`CREATE TABLE ${table} (v Variant(${arms.join(", ")})) ENGINE = Memory`, sessionId, {
        baseUrl: conn.baseUrl,
        auth: conn.auth,
        compression: false,
        settings: COMPLEX_TYPE_SETTINGS,
      }),
    );
    canonical = (
      await collectText(
        query(
          `SELECT type FROM system.columns WHERE database = currentDatabase() AND table = '${table}' AND name = 'v' FORMAT TabSeparated`,
          sessionId,
          { baseUrl: conn.baseUrl, auth: conn.auth },
        ),
      )
    )
      .trim()
      .replace(/\\'/g, "'");
  } catch {
    // An illegal arm set (e.g. a Nullable that slipped the filter) errors here;
    // treat it as a skipped roll rather than crashing the iteration.
    await drop();
    return null;
  }

  // After CH dedup, require at least 2 distinct arms survive.
  if (!canonical || parseTypeList(extractTypeArgs(canonical)).length < 2) {
    await drop();
    return null;
  }
  return { type: canonical, table };
}

/** Path count: usually a handful, occasionally wide, to stress the path index. */
function rollPathCount(rng: Rng): number {
  return rng.int(0, 3) === 0 ? rng.int(0, 18) : rng.int(0, 4);
}

/**
 * A JSON path name with a unique root (so no two paths prefix-collide) and 0-2
 * nested segments, e.g. `tp_3`, `tp_3.s0`, `tp_3.s0.s1`. CH stores dotted paths
 * as flat positional sub-columns, which JsonColumn round-trips as dotted keys.
 */
function jsonPathName(prefix: string, index: number, rng: Rng): string {
  const segs = [`${prefix}_${index}`];
  for (let d = 0, depth = rng.int(0, 2); d < depth; d++) segs.push(`s${d}`);
  return segs.join(".");
}

/**
 * CH serializes a JSON sub-column Map as an object, so a Map in a typed path must
 * have a String key. Detects Map(<non-String>, ...) at any depth. (Dynamic paths
 * are Variant-wrapped, not JSON-native, so this restriction does not apply there.)
 */
function hasNonStringMapKey(type: string): boolean {
  for (let i = type.indexOf("Map("); i !== -1; i = type.indexOf("Map(", i + 4)) {
    const keyStart = i + 4;
    let depth = 0;
    let j = keyStart;
    for (; j < type.length; j++) {
      const c = type[j];
      if (c === "(") depth++;
      else if (c === ")") depth--;
      else if (c === "," && depth === 0) break;
    }
    if (type.slice(keyStart, j).trim() !== "String") return true;
  }
  return false;
}

/**
 * Compose a JSON type with typed paths whose types come from CH's
 * generateRandomStructure (matching fuzz/http.ts:216). Scalars are wrapped in
 * Nullable so an absent path round-trips as omitted; composites are declared bare
 * (Nullable(Array/Map/Tuple) is illegal and they are always materialized, so
 * there is no absent-default ambiguity). A bare `JSON` (no typed paths) is also
 * rolled to exercise the all-dynamic-path path.
 */
async function rollJsonType(rng: Rng, sessionId: string, conn: Conn): Promise<string> {
  const numTypedPaths = rollPathCount(rng);
  const defs: string[] = [];
  for (let p = 0; defs.length < numTypedPaths && p < numTypedPaths * 4 + 4; p++) {
    const type = await fetchRandomStructureType(rng, sessionId, conn);
    if (type === null || !isGeneratable(type, rng) || hasNonStringMapKey(type)) continue;
    const declared = isComposite(type) ? type : `Nullable(${type})`;
    defs.push(`${jsonPathName("tp", defs.length, rng)} ${declared}`);
  }
  // Occasionally cap dynamic paths low so cells with more of them overflow into
  // CH's shared-data storage; FLATTENED serialization flattens that back into
  // ordinary dynamic paths on the wire, so it round-trips without special handling.
  if (rng.int(0, 3) === 0) defs.unshift(`max_dynamic_paths=${rng.int(1, 4)}`);
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
function generateCells(
  kind: Kind,
  canonicalType: string,
  rng: Rng,
  rowCount: number,
  dynamicTypePool: string[],
): unknown[] {
  const cells = new Array<unknown>(rowCount);
  const ctx = () => makeContext(rng, MAX_DEPTH, dynamicTypePool);
  const shape = SHAPES[rng.int(0, SHAPES.length - 1)];

  // Top-level Variant routes through the shape scheduler; a Variant nested in a
  // composite (Array(Variant) etc.) falls through to the generic recursive
  // generate below, where VariantCodec.generate emits each [disc, value] cell.
  if (kind === "variant" && canonicalType.startsWith("Variant")) {
    const arms = parseTypeList(extractTypeArgs(canonicalType));
    const armCodecs = arms.map((t) => getCodec(t));
    const selectors = selectorsForShape(shape, rowCount, arms.length, rng);
    for (let r = 0; r < rowCount; r++) {
      const sel = selectors[r];
      cells[r] = sel === null ? null : [sel, armCodecs[sel].generate(ctx())];
    }
    return cells;
  }

  // Top-level Dynamic (bare or capped) routes through the shape scheduler; a
  // Dynamic nested in a composite (Array(Dynamic) etc.) falls through to the
  // generic recursive generate below, where DynamicCodec.generate samples the
  // same pool via ctx.pickDynamicType.
  if (kind === "dynamic" && canonicalType.startsWith("Dynamic")) {
    // Each pool type is a distinct discriminator; the shape controls how they
    // are distributed across rows (runs, alternation, all-null, uniform mix).
    // DynamicValue carries the explicit type so guessType is bypassed and the
    // full type space round-trips, not just guessType fixed points.
    const poolCodecs = dynamicTypePool.map((t) => getCodec(t));
    const selectors = selectorsForShape(shape, rowCount, poolCodecs.length, rng);
    for (let r = 0; r < rowCount; r++) {
      const sel = selectors[r];
      cells[r] =
        sel === null
          ? null
          : new DynamicValue(dynamicTypePool[sel], poolCodecs[sel].generate(ctx()));
    }
    return cells;
  }

  if (kind === "json") {
    return generateJsonCells(canonicalType, rng, rowCount, dynamicTypePool);
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
function generateJsonCells(
  canonicalType: string,
  rng: Rng,
  rowCount: number,
  dynamicTypePool: string[],
): unknown[] {
  const ctx = () => makeContext(rng, MAX_DEPTH, dynamicTypePool);
  const json = getCodec(canonicalType) as JsonCodec;
  const dynCodec = getCodec("Dynamic");

  const pathCount = rollPathCount(rng);
  const shape = JSON_SHAPES[rng.int(0, JSON_SHAPES.length - 1)];
  const masks = dynamicPathMasks(shape, pathCount, rowCount, rng);
  const pathNames = Array.from({ length: pathCount }, (_, p) => jsonPathName("dp", p, rng));

  const cells = new Array<Record<string, unknown>>(rowCount);
  for (let r = 0; r < rowCount; r++) {
    const obj = json.generate(ctx());
    for (let p = 0; p < pathCount; p++) {
      if (!masks[p][r]) continue;
      const v = dynCodec.generate(ctx());
      if (v !== null) obj[pathNames[p]] = v;
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
  /** Types a Dynamic column may hold this iteration (built from CH). */
  dynamicTypePool: string[];
  /** Variant rolls arrive with a CH-canonicalized table already created; reuse it. */
  preCreated?: boolean;
}): Promise<void> {
  const { kind, columnType, seed, rowCount, compression, baseUrl, auth } = opts;

  if (!opts.preCreated) {
    await consume(
      query(`CREATE TABLE ${opts.table} (v ${columnType}) ENGINE = Memory`, opts.sessionId, {
        baseUrl,
        auth,
        compression: false,
        settings: COMPLEX_TYPE_SETTINGS,
      }),
    );
  }

  // VariantCodec reorders arms into ClickHouse's canonical (sorted) order, so
  // codec.type is the type CH actually stores. Build, encode, and compare
  // against it so discriminators line up with the server.
  //
  // JsonCodec.type is the bare "JSON" regardless of typed paths, so for JSON we
  // keep the full requested type: declaring the source column as plain "JSON"
  // when the table is JSON(typed paths) makes CH cast JSON -> JSON(typed) on
  // INSERT, and that cast round-trips dynamic paths through a text serialization
  // CH itself cannot re-parse for large integers (Int128 text exceeds 64-bit) or
  // sub-second DateTime64. Declaring the typed type makes it an identity insert.
  const codec = getCodec(columnType);
  const canonicalType = kind === "json" ? columnType : codec.type;
  const schema: ColumnDef[] = [{ name: "v", type: canonicalType }];

  const rng = makeRng(seed);
  const cells = generateCells(kind, canonicalType, rng, rowCount, opts.dynamicTypePool);
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
          // Variant rolls bring a pre-created, CH-canonicalized table; reuse it.
          const table = rolled.table ?? `generated_fuzz_${suffix}`;

          console.log(
            `[generated fuzz ${i + 1}/${N} compression=${compression}] ${kind} ${columnType} seed=${seed}`,
          );

          // Only Dynamic-bearing kinds sample the pool; building it for the rest
          // would spend CH round-trips no cell ever reads.
          const dynamicTypePool =
            kind === "dynamic" || kind === "json"
              ? await buildDynamicTypePool(makeRng(seed ^ 0x2545f491), sessionId, { baseUrl, auth })
              : PROBE_DYNAMIC_TYPES;

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
              dynamicTypePool,
              preCreated: rolled.table !== undefined,
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
