/**
 * Self-contained random ClickHouse type-string generator: the offline twin of
 * ClickHouse's `generateRandomStructure`.
 *
 * The fuzz harness (fuzz/generated.ts) has so far drawn every random type from a
 * live CH `generateRandomStructure` round-trip. That keeps CH as an INDEPENDENT
 * oracle for the type grammar — it surfaces types our parser mishandles — and it
 * stays. `genType` is added ALONGSIDE it, not as a replacement, for two reasons:
 *
 *   1. Faster/offline: a type is produced with no network round-trip, so the
 *      per-iteration type query disappears for the scalar/composite/Dynamic-pool
 *      paths (data INSERT/SELECT still validate against the server).
 *   2. Bug-catching: this module re-encodes the legality constraints (Decimal
 *      precision->byte-width, Map-key restrictions, Nullable nesting rules)
 *      SEPARATELY from the codecs that parse them. Feeding genType's output
 *      through CREATE TABLE + our parser is a red-team/blue-team check: a
 *      constraint the generator and the parser disagree on shows up as a CH
 *      rejection or a canonicalization mismatch. If both shared one source of
 *      truth, a shared blind spot would stay invisible.
 *
 * It does not have to be legal-by-construction for correctness: the harness
 * already filters every proposed type through `isGeneratable` and CH validates at
 * CREATE TABLE. Legality is pursued so fast mode does not waste round-trips on
 * rejected types, and parameters are edge-oversampled the same way the value
 * generators (`genInt`/`genString` in native/codecs/scalar.ts) oversample
 * boundaries, so the type-parameter seams get hit on purpose.
 */
import type { Rng } from "../native/codecs/base.ts";

/** Random element of a non-empty array. */
const pick = <T>(rng: Rng, arr: readonly T[]): T => arr[rng.int(0, arr.length - 1)]!;

/** Leaf types with no parameters. Each is a valid Nullable inner and Map value. */
const SIMPLE_SCALARS = [
  "Int8",
  "Int16",
  "Int32",
  "Int64",
  "Int128",
  "Int256",
  "UInt8",
  "UInt16",
  "UInt32",
  "UInt64",
  "UInt128",
  "UInt256",
  "Float32",
  "Float64",
  "Bool",
  "String",
  "UUID",
  "IPv4",
  "IPv6",
  "Date",
  "Date32",
  "DateTime",
] as const;

/**
 * Scalars CH accepts as a `Map` key: a hashable type, no Nullable/composite. A
 * deliberately conservative subset (no Float/Bool, whose key behaviour is iffy)
 * so fast mode does not waste CREATE round-trips on rejected keys.
 */
const MAP_KEY_SCALARS = [
  "Int32",
  "Int64",
  "UInt32",
  "UInt64",
  "String",
  "UUID",
  "Date",
  "DateTime",
] as const;

/** A few IANA zones for the DateTime/DateTime64 timezone parameter. */
const TIMEZONES = ["UTC", "Europe/London", "America/New_York", "Asia/Kolkata"] as const;

/** Default nesting budget; paren depth of the result is bounded by depth + 1. */
export const DEFAULT_TYPE_DEPTH = 5;

/**
 * Precisions on the byte-width seams (and the [1, 76] extremes) of
 * `decimalByteSize` (native/codecs/scalar.ts:81-95): 9->10 crosses 4->8 bytes,
 * 18->19 crosses 8->16, 38->39 crosses 16->32.
 */
const DECIMAL_PRECISION_EDGES = [1, 9, 10, 18, 19, 38, 39, 76] as const;

/**
 * Decimal(P, S): precision P in [1, 76], scale S in [0, P]. Half the time P is one
 * of the byte-width seams so the P->byte-size mapping is exercised right at its
 * transitions (the same edge/interior mixture `clampPick` uses for values), else
 * uniform. S reaches its own edges (0 and P) a third of the time.
 */
function genDecimalType(rng: Rng): string {
  const p = rng.int(0, 1) === 0 ? pick(rng, DECIMAL_PRECISION_EDGES) : rng.int(1, 76);
  const s = rng.int(0, 2) === 0 ? pick(rng, [0, p]) : rng.int(0, p);
  return `Decimal(${p}, ${s})`;
}

/**
 * FixedString(N): N in [1, 256]. Oversample the single-byte edge and the 255/256
 * length-prefix boundary; uniform-random otherwise.
 */
function genFixedStringType(rng: Rng): string {
  const n = rng.int(0, 1) === 0 ? pick(rng, [1, 2, 16, 255, 256]) : rng.int(1, 256);
  return `FixedString(${n})`;
}

/**
 * Enum8 (values in [-128, 127]) or Enum16 ([-32768, 32767]). Names are distinct
 * (`e0`, `e1`, ...) and values distinct; the signed extremes and 0 are seeded
 * first so the sign/width edges of the underlying Int8/Int16 are covered.
 */
function genEnumType(rng: Rng): string {
  const wide = rng.int(0, 1) === 0;
  const lo = wide ? -32768 : -128;
  const hi = wide ? 32767 : 127;
  const tag = wide ? "Enum16" : "Enum8";
  const count = rng.int(1, 6);
  const values = new Set<number>();
  for (const edge of [lo, hi, 0]) {
    if (values.size < count) values.add(edge);
  }
  while (values.size < count) values.add(rng.int(lo, hi));
  const members = [...values].map((v, i) => `'e${i}' = ${v}`);
  return `${tag}(${members.join(", ")})`;
}

/** DateTime, optionally with a timezone. */
function genDateTimeType(rng: Rng): string {
  return rng.int(0, 1) === 0 ? `DateTime('${pick(rng, TIMEZONES)}')` : "DateTime";
}

/** DateTime64(p[, tz]): precision p in [0, 9], oversampling the 0/3/6/9 steps. */
function genDateTime64Type(rng: Rng): string {
  const p = rng.int(0, 1) === 0 ? pick(rng, [0, 3, 6, 9]) : rng.int(0, 9);
  return rng.int(0, 2) === 0 ? `DateTime64(${p}, '${pick(rng, TIMEZONES)}')` : `DateTime64(${p})`;
}

/** A scalar leaf: a parametric scalar 3/7 of the time, else a simple one. */
export function genScalarType(rng: Rng): string {
  switch (rng.int(0, 6)) {
    case 0:
      return genDecimalType(rng);
    case 1:
      return genFixedStringType(rng);
    case 2:
      return genEnumType(rng);
    case 3:
      return genDateTime64Type(rng);
    case 4:
      return genDateTimeType(rng);
    default:
      return pick(rng, SIMPLE_SCALARS);
  }
}

/** A type CH accepts as a Map key (scalar, no Nullable/composite). */
function genMapKeyType(rng: Rng): string {
  switch (rng.int(0, 5)) {
    case 0:
      return genFixedStringType(rng);
    case 1:
      return genEnumType(rng);
    default:
      return pick(rng, MAP_KEY_SCALARS);
  }
}

/**
 * A type CH accepts inside LowCardinality WITHOUT allow_suspicious_low_cardinality_types
 * (the harness does not set it): only String / FixedString, optionally Nullable.
 * Numeric, Float, Date, and DateTime LowCardinality inners are prohibited by
 * default — and LowCardinality(Float) cannot even preserve sign-of-zero through its
 * dictionary — so they are not generated.
 */
function genLowCardinalityInner(rng: Rng): string {
  const base = rng.int(0, 2) === 0 ? genFixedStringType(rng) : "String";
  return rng.int(0, 2) === 0 ? `Nullable(${base})` : base;
}

/** Tuple of 1-4 elements, all named or all unnamed (CH forbids a mix). */
function genTupleType(rng: Rng, depth: number): string {
  const count = rng.int(1, 4);
  const named = rng.int(0, 1) === 0;
  const types: string[] = [];
  for (let i = 0; i < count; i++) types.push(genType(rng, depth - 1));
  // 1-in-4: duplicate one element's type as an adjacent sibling. Two identical
  // sibling type strings can resolve to the same shared codec instance, so this
  // targets shared-codec-state bugs (the codec-cache corruption fired only when
  // a cached composite like Array(Dynamic) appeared twice as a sibling).
  if (rng.int(0, 3) === 0) {
    const at = rng.int(0, types.length - 1);
    types.splice(at, 0, types[at]!);
  }
  const elems = types.map((t, i) => (named ? `c${i} ${t}` : t));
  return `Tuple(${elems.join(", ")})`;
}

/**
 * A composite wrapper. Array/Map value/Tuple element recurse with `depth - 1`;
 * Nullable and LowCardinality use constrained scalar inners (CH forbids them over
 * containers), so they stay shallow.
 */
export function genCompositeType(rng: Rng, depth = DEFAULT_TYPE_DEPTH): string {
  switch (rng.int(0, 4)) {
    case 0:
      return `Array(${genType(rng, depth - 1)})`;
    case 1:
      return `Map(${genMapKeyType(rng)}, ${genType(rng, depth - 1)})`;
    case 2:
      return genTupleType(rng, depth);
    case 3:
      return `Nullable(${genScalarType(rng)})`;
    default:
      return `LowCardinality(${genLowCardinalityInner(rng)})`;
  }
}

/**
 * A random scalar or composite type string. At depth 0 (or 1/3 of the time
 * otherwise) a scalar leaf; else a composite wrapper that recurses with a smaller
 * budget. `depth` bounds recursive container nesting; paren depth is bounded by
 * `depth + 2` (a terminal LowCardinality(Nullable(parametric)) tail adds two).
 */
export function genType(rng: Rng, depth = DEFAULT_TYPE_DEPTH): string {
  if (depth <= 0 || rng.int(0, 2) === 0) return genScalarType(rng);
  return genCompositeType(rng, depth);
}
