/**
 * Both the random fuzz (fuzz/generated.ts) and the curated corpus
 * (test/type-corpus.test.ts) validate a column the same way: declare it, send
 * client-encoded rows, read them back through ClickHouse's own re-serialization,
 * and assert codec.compare() row by row. That sequence —
 *
 *   CREATE -> encodeNative -> INSERT -> SELECT FORMAT Native -> decode -> compare
 *
 * is the correctness-sensitive part, so it lives here once. It is stronger than
 * an in-process round-trip because CH re-serializes between INSERT and SELECT:
 * the decoded rows come from CH's encoder, not ours. Callers differ only in how
 * they choose the type and generate the cells.
 */

import { dataChunks, insert, query } from "../client.ts";
import type { Codec } from "../native/codecs/base.ts";
import { type ColumnDef, encodeNative, streamDecodeNative } from "../native/index.ts";
import { batchFromRows } from "../native/table.ts";
import type { Compression } from "./config.ts";
import { consume } from "./util.ts";

/** Settings required for experimental/complex types in CREATE/INSERT/SELECT. */
export const COMPLEX_TYPE_SETTINGS = {
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

export interface Conn {
  url: string;
  auth: { username: string; password: string };
}

/** Serialize a value for error output, including bigint. */
export function stringify(value: unknown): string {
  return JSON.stringify(value, (_k, v) => (typeof v === "bigint" ? `${v}n` : v)) ?? String(value);
}

interface Mismatch {
  rowIndex: number;
  expected: string;
  actual: string;
}

/**
 * Round-trip one column's pre-generated cells through ClickHouse and assert
 * codec.compare() holds for every row. Throws on the first row-count or compare
 * mismatch, tagging the message with `replayHint` so the failing case can be
 * reproduced. The INSERT itself is a zeroth check — CH rejects malformed
 * discriminator streams and bad type prefixes at parse time.
 *
 * `declaredType` is the type used both in CREATE TABLE and in the encoded
 * schema, so it must be the form CH actually stores (the caller's canonical
 * type, e.g. VariantCodec's sorted arms), not necessarily the originally
 * requested spelling.
 */
export async function roundTripCells(opts: {
  declaredType: string;
  codec: Codec;
  cells: unknown[];
  compression: Compression;
  conn: Conn;
  sessionId: string;
  insertSessionId: string;
  table: string;
  /** When true the table already exists (a Variant roll pre-creates it). */
  preCreated?: boolean;
  /** Context appended to mismatch errors so a failure can be replayed. */
  replayHint?: string;
}): Promise<void> {
  const { declaredType, codec, cells, compression, conn, table } = opts;
  const { url, auth } = conn;

  if (!opts.preCreated) {
    await consume(
      query(`CREATE TABLE ${table} (v ${declaredType}) ENGINE = Memory`, {
        url,
        auth,
        sessionId: opts.sessionId,
        compression: false,
        settings: COMPLEX_TYPE_SETTINGS,
      }),
    );
  }

  const schema: ColumnDef[] = [{ name: "v", type: declaredType }];
  const rows: unknown[][] = cells.map((c) => [c]);
  const encoded = encodeNative(batchFromRows(schema, rows));

  await insert(`INSERT INTO ${table} FORMAT Native`, encoded, {
    url,
    auth,
    sessionId: opts.insertSessionId,
    settings: COMPLEX_TYPE_SETTINGS,
  });

  const queryResult = query(`SELECT v FROM ${table} FORMAT Native`, {
    url,
    auth,
    sessionId: opts.sessionId,
    compression,
    settings: COMPLEX_TYPE_SETTINGS,
  });

  const decoded: unknown[] = [];
  for await (const block of streamDecodeNative(dataChunks(queryResult), { mapAsArray: true })) {
    for (const row of block.columnData[0]!) {
      decoded.push(row);
    }
  }

  const hint = opts.replayHint ? ` (${opts.replayHint})` : "";

  if (decoded.length !== rows.length) {
    throw new Error(
      `Row count mismatch for ${declaredType}${hint}: expected ${rows.length}, got ${decoded.length}`,
    );
  }

  const mismatches: Mismatch[] = [];
  for (let r = 0; r < rows.length; r++) {
    const expected = rows[r]![0];
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
    throw new Error(`compare mismatch for ${declaredType}${hint}:\n${detail}`);
  }
}
