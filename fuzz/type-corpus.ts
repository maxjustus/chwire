/**
 * Curated corpus of marquee ClickHouse scalar/composite types.
 *
 * The random fuzz (fuzz/generated.ts) draws a fresh type per iteration, so a
 * short run only exercises whatever shapes the dice land on. This corpus is the
 * deterministic complement: test/type-corpus.test.ts round-trips EVERY entry
 * through ClickHouse on every run, guaranteeing the tricky shapes are always
 * covered (the AFL seed-corpus idea).
 *
 * Curation principle — one entry per distinct codec path or parameter seam, not
 * an exhaustive matrix. The unit tests already own exhaustive integer-width and
 * value-boundary coverage; this corpus owns the SHAPES random rolls rarely hit:
 *   - each Decimal byte-width seam (4 / 8 / 16 / 32 bytes => precision 9, 18,
 *     38, 76) plus the scale==precision extreme and the named-vs-(P,S) parse
 *     branches in decimalByteSize (native/codecs/scalar.ts).
 *   - every legal wrapper combination (Nullable / LowCardinality / Array / Map /
 *     Tuple), including the deep nests.
 *   - the geo and Nested sugar, which generateRandomStructure and genType almost
 *     never emit.
 *
 * Legality: all entries are CH-legal under COMPLEX_TYPE_SETTINGS
 * (fuzz/round-trip.ts) WITHOUT allow_suspicious_low_cardinality_types — so
 * LowCardinality is only over String / FixedString / Nullable(String|FixedString),
 * Map keys are hashable non-Nullable scalars, and Tuple elements are all-named or
 * all-unnamed. No Variant / Dynamic / JSON (those have their own fuzz paths).
 *
 * When adding a type, prefer one that pins a codec path or seam no existing entry
 * covers; near-duplicates of an existing path do not earn their keep.
 */
export const TYPE_CORPUS: readonly string[] = [
  // integers: every distinct numeric codec path (NumericCodec small signed/unsigned,
  // 64-bit signed/unsigned bigint-backed arrays, BigIntCodec 16-byte and 32-byte).
  // Int16/Int32/UInt16/UInt32 are the same small-int path with a different TypedArray,
  // so one signed + one unsigned small width stands in for them.
  "Int8",
  "UInt8",
  "Int64",
  "UInt64",
  "Int128",
  "UInt256",

  // floats + bool
  "Float32",
  "Float64",
  "Bool",

  // decimals: one entry per byte-width bucket (4/8/16/32), the 18->19 seam, the
  // scale==precision extreme at the ceiling, and a named form (Decimal64) that
  // hits decimalByteSize's startsWith branch instead of its precision regex.
  "Decimal(9, 4)",
  "Decimal(18, 6)",
  "Decimal(19, 19)",
  "Decimal(38, 10)",
  "Decimal(76, 76)",
  "Decimal64(4)",

  // enums: signed extrema of the underlying Int8 / Int16.
  "Enum8('neg' = -128, 'zero' = 0, 'pos' = 127)",
  "Enum16('lo' = -32768, 'hi' = 32767)",

  // strings / fixed / network: distinct codecs + the FixedString single-byte and
  // large-width edges.
  "String",
  "FixedString(1)",
  "FixedString(256)",
  "UUID",
  "IPv4",
  "IPv6",

  // temporal: DateTime('UTC') is a regression pin — EpochCodec.encode selects its
  // value range by matching the type string, and a timezone-qualified DateTime
  // once fell through to Date32's 2038 ceiling. DateTime64 precision 3 (with tz)
  // and 9 span the sub-second scaling factor.
  "Date",
  "Date32",
  "DateTime",
  "DateTime('UTC')",
  "DateTime64(3, 'America/New_York')",
  "DateTime64(9, 'UTC')",

  // nullable over a fixed-width numeric, a variable-length String, a 16-byte
  // Decimal, and a FixedString.
  "Nullable(Int32)",
  "Nullable(String)",
  "Nullable(Decimal(38, 10))",
  "Nullable(FixedString(16))",

  // low-cardinality: the full set of inners legal without the suspicious flag.
  "LowCardinality(String)",
  "LowCardinality(Nullable(String))",
  "LowCardinality(FixedString(8))",
  "LowCardinality(Nullable(FixedString(16)))",

  // arrays: fixed-width, variable-length, nested-null-bitmap, and multi-level
  // offsets.
  "Array(Int64)",
  "Array(String)",
  "Array(Nullable(Int32))",
  "Array(Array(Int32))",

  // maps: diverse key codecs (String / numeric / UUID / Date) and value shapes
  // (scalar / Array / Decimal). Enum-as-key is covered by the deep-nesting entry.
  "Map(String, Int64)",
  "Map(Int64, String)",
  "Map(UUID, Array(Float64))",
  "Map(Date, Decimal(18, 4))",

  // tuples: single-element edge, named with a Nullable element, and unnamed with
  // composite elements.
  "Tuple(Int64)",
  "Tuple(a Int64, b String, c Nullable(UUID))",
  "Tuple(Int64, Array(String), Map(String, Int64))",

  // deep nesting: the marquee shapes — enum-keyed map of a tuple of array/map,
  // an array of map of array of nullable, and a tuple mixing array-of-map (with a
  // LowCardinality key) and a nullable float.
  "Map(Enum8('a' = 1, 'b' = 2), Tuple(c0 Array(Nullable(Decimal(38, 10))), c1 Map(String, Int64)))",
  "Array(Map(String, Array(Nullable(Int64))))",
  "Tuple(x Array(Map(LowCardinality(String), Int64)), y Nullable(Float64))",

  // geo sugar: Point is the base Tuple(Float64, Float64); MultiPolygon is its
  // deepest nest, Array(Array(Array(Point))).
  "Point",
  "MultiPolygon",

  // nested sugar: Nested -> Array(Tuple), round-trips only under flatten_nested=0.
  "Nested(a Int64, b String)",
];
