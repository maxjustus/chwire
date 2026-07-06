/**
 * Rewrite canonical generated values into the alternate input forms the
 * coercion layer (native/coercion.ts) accepts, so the fuzzer exercises those
 * branches instead of only the canonical forms codec.generate() emits.
 *
 * Invariant: every rewrite is value-preserving — the rewritten cell must
 * decode equal (codec.compare) to the canonical one. Each leaf is rewritten
 * with probability 1/2 so mixed columns are covered too.
 */

import {
  extractTypeArgs,
  parseTupleElements,
  parseTypeList,
  type Rng,
} from "../native/codecs/base.ts";
import { DynamicValue } from "../native/index.ts";
import { pick } from "./util.ts";

const INT_32_OR_NARROWER = /^U?Int(8|16|32)$/;
const BIG_INT_TYPES = /^U?Int(64|128|256)$/;

/** Canonical IPv6 output of bytesToIpv6 for an IPv4-mapped address. */
const IPV4_MAPPED = /^0:0:0:0:0:ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/;

export function rerenderCells(type: string, cells: unknown[], rng: Rng): unknown[] {
  return cells.map((c) => rerenderValue(type, c, rng));
}

function rerenderValue(type: string, v: unknown, rng: Rng): unknown {
  if (v === null || v === undefined) return v;
  // A DynamicValue carries its own concrete type; rewrite the payload under it.
  if (v instanceof DynamicValue) {
    return new DynamicValue(v.type, rerenderValue(v.type, v.value, rng));
  }
  if (type.startsWith("Nullable(") || type.startsWith("LowCardinality(")) {
    return rerenderValue(extractTypeArgs(type), v, rng);
  }
  if (type.startsWith("Array(") && Array.isArray(v)) {
    const inner = extractTypeArgs(type);
    return v.map((e) => rerenderValue(inner, e, rng));
  }
  if (type.startsWith("Map(") && Array.isArray(v)) {
    const [, valType] = parseTypeList(extractTypeArgs(type));
    return (v as [unknown, unknown][]).map(([k, val]) => [
      // Keys stay canonical: rewriting a key must not perturb CH's key identity.
      k,
      rerenderValue(valType!, val, rng),
    ]);
  }
  if (type.startsWith("Tuple(")) {
    const elements = parseTupleElements(extractTypeArgs(type));
    if (Array.isArray(v)) {
      return elements.map((e, i) => rerenderValue(e.type, v[i], rng));
    }
    if (typeof v === "object") {
      const obj: Record<string, unknown> = {};
      for (const e of elements) {
        obj[e.name!] = rerenderValue(e.type, (v as Record<string, unknown>)[e.name!], rng);
      }
      return obj;
    }
    return v;
  }
  return rerenderLeaf(type, v, rng);
}

/**
 * Rewrite one leaf value into an accepted alternate form, or return it
 * unchanged (probability 1/2, plus every case the coercions do not cover).
 */
function rerenderLeaf(type: string, v: unknown, rng: Rng): unknown {
  if (rng.int(0, 1) === 0) return v;

  // Bool: toBool accepts booleans and the strings "true"/"false"/"1"/"0".
  if (type === "Bool" && typeof v === "number") {
    return pick(rng, [v === 1, v === 1 ? "true" : "false", String(v)]);
  }

  // Narrow ints: toNumber accepts numeric strings and bigint.
  if (INT_32_OR_NARROWER.test(type) && typeof v === "number") {
    return pick(rng, [String(v), BigInt(v)]);
  }

  // Wide ints: toBigIntInRange accepts decimal strings, and safe numbers.
  if (BIG_INT_TYPES.test(type) && typeof v === "bigint") {
    if (
      v >= BigInt(Number.MIN_SAFE_INTEGER) &&
      v <= BigInt(Number.MAX_SAFE_INTEGER) &&
      rng.int(0, 1) === 0
    ) {
      return Number(v);
    }
    return String(v);
  }

  // Floats: Number(String(x)) is exact for finite doubles. Skip -0 (String(-0)
  // is "0", which would silently drop the sign) and non-finite (Number("NaN")
  // is rejected by toNumber on purpose).
  if ((type === "Float32" || type === "Float64") && typeof v === "number") {
    if (!Number.isFinite(v) || Object.is(v, -0)) return v;
    return String(v);
  }

  // Decimals: trailing zeros beyond the scale are exact and accepted.
  if (type.startsWith("Decimal") && typeof v === "string") {
    return v.includes(".") ? `${v}0` : `${v}.0`;
  }

  // Date/Date32/DateTime: fromValues accepts epoch-ms numbers and ISO strings.
  if (
    (type === "Date" || type === "Date32" || type.startsWith("DateTime(") || type === "DateTime") &&
    v instanceof Date
  ) {
    return rng.int(0, 1) === 0 ? v.getTime() : v.toISOString();
  }

  // IPv6: the encoder accepts uppercase hex, "::" compression, and the
  // IPv4-mapped dotted form.
  if (type === "IPv6" && typeof v === "string") {
    const mapped = IPV4_MAPPED.exec(v);
    if (mapped) {
      const hi = parseInt(mapped[1]!, 16);
      const lo = parseInt(mapped[2]!, 16);
      return `::ffff:${hi >> 8}.${hi & 0xff}.${lo >> 8}.${lo & 0xff}`;
    }
    return v.toUpperCase();
  }

  // UUID: toValidUUID accepts uppercase hex and missing dashes.
  if (type === "UUID" && typeof v === "string") {
    return rng.int(0, 1) === 0 ? v.toUpperCase() : v.replace(/-/g, "");
  }

  return v;
}
