import { Time } from "../constants.ts";
import { extractTypeArgs, type Codec, parseTupleElements, parseTypeList } from "./base.ts";
import {
  ArrayCodec,
  LowCardinalityCodec,
  MapCodec,
  NullableCodec,
  TupleCodec,
} from "./composite.ts";
import { DynamicCodec, JsonCodec, VariantCodec } from "./dynamic.ts";
import {
  BigIntCodec,
  DateTime64Codec,
  DecimalCodec,
  EnumCodec,
  EpochCodec,
  FixedStringCodec,
  IPv4Codec,
  IPv6Codec,
  NumericCodec,
  StringCodec,
  UUIDCodec,
} from "./scalar.ts";
import {
  toBool,
  toInt16,
  toInt32,
  toInt64,
  toInt8,
  toNumber,
  toUInt16,
  toUInt32,
  toUInt64,
  toUInt8,
} from "../coercion.ts";

const { MS_PER_DAY, MS_PER_SECOND } = Time;

/**
 * Parse typed paths from a JSON type string.
 * Reuses parseTupleElements for the "name Type" parsing, filters out config params.
 */
function parseJsonTypedPaths(type: string): { name: string; type: string }[] {
  if (type === "JSON" || !type.includes("(")) return [];
  const inner = extractTypeArgs(type);
  if (!inner) return [];

  const elements = parseTupleElements(inner);

  return elements
    .filter(
      // Config params (e.g. max_dynamic_paths=16) have no space, so
      // parseTupleElements leaves them name=null; SKIP directives are dropped by
      // name. An Enum typed path's type legitimately contains '=', so it must NOT
      // be filtered on '='.
      (el): el is { name: string; type: string } =>
        el.name !== null && !el.name.toUpperCase().startsWith("SKIP"),
    )
    .map((el) => ({ name: el.name, type: el.type }));
}

export function createCodec(type: string): Codec {
  if (type.startsWith("Nullable")) return new NullableCodec(type, getCodec(extractTypeArgs(type)));
  if (type.startsWith("Array")) return new ArrayCodec(type, getCodec(extractTypeArgs(type)));
  if (type.startsWith("LowCardinality"))
    return new LowCardinalityCodec(type, getCodec(extractTypeArgs(type)));
  if (type.startsWith("Map")) {
    const [k, v] = parseTypeList(extractTypeArgs(type));
    return new MapCodec(type, getCodec(k!), getCodec(v!));
  }
  if (type.startsWith("Tuple")) {
    const args = parseTupleElements(extractTypeArgs(type));
    const isNamed = args[0]!.name !== null;
    return new TupleCodec(
      type,
      args.map((a) => ({ name: a.name, codec: getCodec(a.type) })),
      isNamed,
    );
  }
  // Nested is syntactic sugar for Array(Tuple(...)) and is encoded as that
  // single column. This only round-trips a TOP-LEVEL Nested column when the
  // target table was created with flatten_nested=0. Under the default
  // flatten_nested=1, ClickHouse splits the table into separate
  // <name>.<field> Array columns, so inserting one Native column named after
  // the Nested group does not match any physical column: the row values are
  // dropped and the <name>.<field> columns default to empty arrays (silent
  // data loss, no error). The codec only sees the column type string at encode
  // time, not the server's flatten_nested setting, so this is documented rather
  // than guarded here. Nested INSIDE other types (Array(Nested(...)),
  // Nested(... Nested ...)) and a directly declared Array(Tuple(...)) are not
  // affected and round-trip normally.
  if (type.startsWith("Nested")) {
    const args = parseTupleElements(extractTypeArgs(type));
    const tupleType = `Tuple(${args.map((a) => `${a.name} ${a.type}`).join(", ")})`;
    const tupleCodec = new TupleCodec(
      tupleType,
      args.map((a) => ({ name: a.name, codec: getCodec(a.type) })),
      true,
    );
    return new ArrayCodec(type, tupleCodec);
  }
  if (type.startsWith("Variant")) {
    const innerTypes = parseTypeList(extractTypeArgs(type));
    return new VariantCodec(innerTypes, innerTypes.map(getCodec));
  }
  // Dynamic or Dynamic(max_types=N): the max_types hint only bounds how many
  // distinct types stay separate vs. spill to the shared variant in storage; the
  // flattened wire format presents all of them, so it does not affect the codec.
  if (type === "Dynamic" || type.startsWith("Dynamic(")) return new DynamicCodec(getCodec);
  if (type === "JSON" || type.startsWith("JSON")) {
    const typedPaths = parseJsonTypedPaths(type);
    return new JsonCodec(getCodec, typedPaths, type);
  }

  if (type.startsWith("FixedString"))
    return new FixedStringCodec(parseInt(extractTypeArgs(type), 10));

  if (type.startsWith("DateTime64")) {
    const precisionMatch = type.match(/DateTime64\((\d+)/);
    const precision = precisionMatch ? parseInt(precisionMatch[1]!, 10) : 3;
    return new DateTime64Codec(type, precision);
  }

  if (type.startsWith("DateTime(")) return new EpochCodec(type, Uint32Array, MS_PER_SECOND);

  if (type === "Point")
    return new TupleCodec(
      type,
      [
        { name: null, codec: getCodec("Float64") },
        { name: null, codec: getCodec("Float64") },
      ],
      false,
    );
  if (type === "Ring") return new ArrayCodec(type, getCodec("Point"));
  if (type === "Polygon") return new ArrayCodec(type, getCodec("Ring"));
  if (type === "MultiPolygon") return new ArrayCodec(type, getCodec("Polygon"));

  switch (type) {
    case "UInt8":
      return new NumericCodec(type, Uint8Array, toUInt8);
    case "Int8":
      return new NumericCodec(type, Int8Array, toInt8);
    case "UInt16":
      return new NumericCodec(type, Uint16Array, toUInt16);
    case "Int16":
      return new NumericCodec(type, Int16Array, toInt16);
    case "UInt32":
      return new NumericCodec(type, Uint32Array, toUInt32);
    case "Int32":
      return new NumericCodec(type, Int32Array, toInt32);
    case "UInt64":
      return new NumericCodec(type, BigUint64Array, toUInt64);
    case "Int64":
      return new NumericCodec(type, BigInt64Array, toInt64);
    case "Float32":
      return new NumericCodec(type, Float32Array, toNumber);
    case "Float64":
      return new NumericCodec(type, Float64Array, toNumber);
    case "Bool":
      return new NumericCodec(type, Uint8Array, toBool);
    case "Date":
      return new EpochCodec(type, Uint16Array, MS_PER_DAY);
    case "Date32":
      return new EpochCodec(type, Int32Array, MS_PER_DAY);
    case "DateTime":
      return new EpochCodec(type, Uint32Array, MS_PER_SECOND);
    case "String":
      return new StringCodec();
    case "UUID":
      return new UUIDCodec();
    case "IPv4":
      return new IPv4Codec();
    case "IPv6":
      return new IPv6Codec();
    case "Int128":
      return new BigIntCodec(type, 16, true);
    case "UInt128":
      return new BigIntCodec(type, 16, false);
    case "Int256":
      return new BigIntCodec(type, 32, true);
    case "UInt256":
      return new BigIntCodec(type, 32, false);
  }

  if (type.startsWith("Enum")) return new EnumCodec(type);
  if (type.startsWith("Decimal")) return new DecimalCodec(type);

  throw new Error(`Unknown type: ${type}`);
}

// LRU codec cache. JS Maps iterate in insertion order, so deleting and
// re-inserting moves a key to the end. Evicting map.keys().next() drops oldest.
// IMPORTANT: Only stateless codecs may be cached. Codecs that accumulate state
// during readPrefix/writePrefix (e.g. Dynamic, JSON) must bypass the cache —
// otherwise block 1's state corrupts block 2 when the server sends multiple
// MergeTree parts with different column metadata.
const CODEC_CACHE = new Map<string, Codec>();
const CODEC_CACHE_LIMIT = 131072;

export function getCodec(type: "JSON" | `JSON(${string})`): JsonCodec;
export function getCodec(type: string): Codec;
export function getCodec(type: string): Codec {
  if (type.startsWith("Dynamic") || type === "JSON" || type.startsWith("JSON(")) {
    return createCodec(type);
  }

  const cached = CODEC_CACHE.get(type);
  if (cached !== undefined) {
    CODEC_CACHE.delete(type);
    CODEC_CACHE.set(type, cached);
    return cached;
  }

  const codec = createCodec(type);
  CODEC_CACHE.set(type, codec);

  if (CODEC_CACHE.size > CODEC_CACHE_LIMIT) {
    CODEC_CACHE.delete(CODEC_CACHE.keys().next().value!);
  }

  return codec;
}
