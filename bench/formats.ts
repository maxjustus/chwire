// Benchmark: Native vs JSONEachRow
//
// Tests encoding/decoding performance for both formats with various data types.

import { promisify } from "node:util";
import { gzip } from "node:zlib";
import { encodeBlock, init } from "../compression.ts";
import {
  batchFromCols,
  batchFromRows,
  type ColumnDef,
  decodeNativeBlock,
  encodeNative,
  getCodec,
  RecordBatch,
  streamDecodeNative,
  streamEncodeNative,
} from "../native/index.ts";
import {
  type BenchOptions,
  benchAsync,
  benchSync,
  readBenchOptions,
  reportEnvironment,
} from "./harness.ts";

const gzipAsync = promisify(gzip);

function encodeNativeRows(columns: ColumnDef[], rows: unknown[][]): Uint8Array {
  return encodeNative(batchFromRows(columns, rows));
}

async function collectByteChunks(chunks: AsyncIterable<Uint8Array>): Promise<Uint8Array> {
  const parts: Uint8Array[] = [];
  let total = 0;
  for await (const chunk of chunks) {
    parts.push(chunk);
    total += chunk.length;
  }

  const result = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

function formatResult(stats: { name: string; meanMs: number }, rows: number): string {
  const rowsPerSec = rows / (stats.meanMs / 1000);
  return `  ${stats.name.padEnd(30)} ${stats.meanMs.toFixed(3).padStart(8)}ms  ${(rowsPerSec / 1_000_000).toFixed(2).padStart(6)}M rows/sec`;
}

function formatKB(bytes: number): string {
  return `${(bytes / 1024).toFixed(1)}KB`;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function encodeJsonEachRow(rows: Record<string, unknown>[]): Uint8Array {
  let json = "";
  for (const row of rows) json += `${JSON.stringify(row)}\n`;
  return encoder.encode(json);
}

function decodeJsonEachRow<T>(data: Uint8Array): T[] {
  return decoder
    .decode(data)
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as T);
}

async function* chunkedStream(data: Uint8Array, chunkSize: number): AsyncIterable<Uint8Array> {
  for (let i = 0; i < data.length; i += chunkSize) {
    yield data.subarray(i, Math.min(i + chunkSize, data.length));
  }
}

async function collectNative(chunks: AsyncIterable<Uint8Array>): Promise<RecordBatch> {
  const blocks: RecordBatch[] = [];
  for await (const block of streamDecodeNative(chunks)) {
    blocks.push(block);
  }
  if (blocks.length === 0) {
    return RecordBatch.from({ columns: [], columnData: [], rowCount: 0 });
  }
  if (blocks.length === 1) {
    return blocks[0];
  }
  // Return first block for benchmark
  return blocks[0];
}

interface Scenario {
  name: string;
  description: string;
  columns: ColumnDef[];
  jsonData: Record<string, unknown>[];
  rowsArray: unknown[][];
}

interface CompressionSizes {
  lz4: number;
  zstd: number;
  gzip: number;
}

interface ScenarioResult {
  name: string;
  encode: { json: number; native: number };
  decode: { json: number; native: number };
  size: { json: number; native: number };
  compressed: { json: CompressionSizes; native: CompressionSizes };
}

async function runScenario(
  scenario: Scenario,
  iterations: number,
  benchOptions: BenchOptions,
): Promise<ScenarioResult> {
  const rows = scenario.rowsArray.length;
  console.log(`=== ${scenario.name} (${scenario.description}) ===\n`);

  // Pre-encode
  const jsonEncoded = encodeJsonEachRow(scenario.jsonData);
  const nativeEncoded = encodeNativeRows(scenario.columns, scenario.rowsArray);

  const pct = (val: number, base: number) => ((val / base) * 100).toFixed(1);
  console.log(
    `  Encoded sizes: JSON=${formatKB(jsonEncoded.length)}, Native=${formatKB(nativeEncoded.length)} (${pct(nativeEncoded.length, jsonEncoded.length)}%)\n`,
  );

  // Encoding
  console.log("Encoding:");
  const jsonEnc = benchSync("JSONEachRow encode", () => encodeJsonEachRow(scenario.jsonData), {
    ...benchOptions,
    iterations,
  });
  console.log(formatResult(jsonEnc, rows));
  const nativeEnc = benchSync(
    "Native encode",
    () => encodeNativeRows(scenario.columns, scenario.rowsArray),
    { ...benchOptions, iterations },
  );
  console.log(formatResult(nativeEnc, rows));

  // Decoding
  console.log("\nDecoding:");
  const jsonDec = benchSync("JSONEachRow decode", () => decodeJsonEachRow(jsonEncoded), {
    ...benchOptions,
    iterations,
  });
  console.log(formatResult(jsonDec, rows));
  const nativeDec = benchSync("Native decode", () => decodeNativeBlock(nativeEncoded, 0), {
    ...benchOptions,
    iterations,
  });
  console.log(formatResult(nativeDec, rows));

  // Compression comparison (LZ4, ZSTD, gzip)
  const jsonLz4 = encodeBlock(jsonEncoded, "lz4");
  const jsonZstd = encodeBlock(jsonEncoded, "zstd");
  const jsonGzip = new Uint8Array(await gzipAsync(jsonEncoded));
  const nativeLz4 = encodeBlock(nativeEncoded, "lz4");
  const nativeZstd = encodeBlock(nativeEncoded, "zstd");
  const nativeGzip = new Uint8Array(await gzipAsync(nativeEncoded));

  console.log("\nCompressed sizes:");
  console.log(
    `  JSON:   LZ4=${formatKB(jsonLz4.length)}, ZSTD=${formatKB(jsonZstd.length)}, gzip=${formatKB(jsonGzip.length)}`,
  );
  console.log(
    `  Native: LZ4=${formatKB(nativeLz4.length)} (${pct(nativeLz4.length, jsonLz4.length)}%), ZSTD=${formatKB(nativeZstd.length)} (${pct(nativeZstd.length, jsonZstd.length)}%), gzip=${formatKB(nativeGzip.length)} (${pct(nativeGzip.length, jsonGzip.length)}%)`,
  );

  // Full path benchmarks
  console.log("\nFull path (encode + compress):");
  const jsonLz4Full = benchSync(
    "JSONEachRow + LZ4",
    () => encodeBlock(encodeJsonEachRow(scenario.jsonData), "lz4"),
    { ...benchOptions, iterations },
  );
  console.log(formatResult(jsonLz4Full, rows));
  const nativeLz4Full = benchSync(
    "Native + LZ4",
    () => encodeBlock(encodeNativeRows(scenario.columns, scenario.rowsArray), "lz4"),
    { ...benchOptions, iterations },
  );
  console.log(formatResult(nativeLz4Full, rows));

  const jsonZstdFull = benchSync(
    "JSONEachRow + ZSTD",
    () => encodeBlock(encodeJsonEachRow(scenario.jsonData), "zstd"),
    { ...benchOptions, iterations },
  );
  console.log(formatResult(jsonZstdFull, rows));
  const nativeZstdFull = benchSync(
    "Native + ZSTD",
    () => encodeBlock(encodeNativeRows(scenario.columns, scenario.rowsArray), "zstd"),
    { ...benchOptions, iterations },
  );
  console.log(formatResult(nativeZstdFull, rows));

  const jsonGzipFull = await benchAsync(
    "JSONEachRow + gzip",
    async () => {
      await gzipAsync(encodeJsonEachRow(scenario.jsonData));
    },
    { ...benchOptions, iterations },
  );
  console.log(formatResult(jsonGzipFull, rows));
  const nativeGzipFull = await benchAsync(
    "Native + gzip",
    async () => {
      await gzipAsync(encodeNativeRows(scenario.columns, scenario.rowsArray));
    },
    { ...benchOptions, iterations },
  );
  console.log(formatResult(nativeGzipFull, rows));

  console.log("");

  return {
    name: scenario.name,
    encode: { json: jsonEnc.meanMs, native: nativeEnc.meanMs },
    decode: { json: jsonDec.meanMs, native: nativeDec.meanMs },
    size: {
      json: jsonEncoded.length,
      native: nativeEncoded.length,
    },
    compressed: {
      json: { lz4: jsonLz4.length, zstd: jsonZstd.length, gzip: jsonGzip.length },
      native: { lz4: nativeLz4.length, zstd: nativeZstd.length, gzip: nativeGzip.length },
    },
  };
}

function generateSimpleData(count: number): {
  json: Record<string, unknown>[];
  rows: unknown[][];
  columns: ColumnDef[];
} {
  const columns: ColumnDef[] = [
    { name: "id", type: "UInt32" },
    { name: "name", type: "String" },
    { name: "email", type: "String" },
    { name: "active", type: "Bool" },
    { name: "score", type: "Float64" },
    { name: "created_at", type: "DateTime" },
  ];
  const json: Record<string, unknown>[] = [];
  const rows: unknown[][] = [];
  for (let i = 0; i < count; i++) {
    const created_at = new Date("2024-01-15T10:30:00Z");
    json.push({
      id: i,
      name: `user_${i}`,
      email: `user${i}@example.com`,
      active: i % 2 === 0,
      score: Math.random() * 100,
      created_at,
    });
    rows.push([
      i,
      `user_${i}`,
      `user${i}@example.com`,
      i % 2 === 0,
      Math.random() * 100,
      created_at,
    ]);
  }
  return { json, rows, columns };
}

function generateEscapeData(count: number): {
  json: Record<string, unknown>[];
  rows: unknown[][];
  columns: ColumnDef[];
} {
  const columns: ColumnDef[] = [
    { name: "id", type: "UInt32" },
    { name: "name", type: "String" },
    { name: "desc", type: "String" },
    { name: "path", type: "String" },
  ];
  const json: Record<string, unknown>[] = [];
  const rows: unknown[][] = [];
  for (let i = 0; i < count; i++) {
    json.push({
      id: i,
      name: `user "test" ${i}`,
      desc: `Line1\nLine2\tTabbed`,
      path: `C:\\Users\\test\\file${i}.txt`,
    });
    rows.push([i, `user "test" ${i}`, `Line1\nLine2\tTabbed`, `C:\\Users\\test\\file${i}.txt`]);
  }
  return { json, rows, columns };
}

function generateComplexData(count: number): {
  json: Record<string, unknown>[];
  rows: unknown[][];
  columns: ColumnDef[];
} {
  const columns: ColumnDef[] = [
    { name: "id", type: "UInt32" },
    { name: "tags", type: "Array(String)" },
    { name: "scores", type: "Array(Float64)" },
    { name: "metadata", type: "Nullable(String)" },
  ];
  const json: Record<string, unknown>[] = [];
  const rows: unknown[][] = [];
  for (let i = 0; i < count; i++) {
    const tags = [`tag_${i % 5}`, `cat_${i % 3}`, `type_${i % 7}`];
    const scores = Array.from({ length: 50 }, () => Math.random() * 100);
    const metadata = i % 3 === 0 ? null : `meta_${i}`;
    json.push({ id: i, tags, scores, metadata });
    rows.push([i, tags, scores, metadata]);
  }
  return { json, rows, columns };
}

function generateComplexTypedData(count: number): {
  json: Record<string, unknown>[];
  rows: unknown[][];
  columns: ColumnDef[];
} {
  const columns: ColumnDef[] = [
    { name: "id", type: "UInt32" },
    { name: "tags", type: "Array(String)" },
    { name: "scores", type: "Array(Float64)" },
    { name: "metadata", type: "Nullable(String)" },
  ];
  const json: Record<string, unknown>[] = [];
  const rows: unknown[][] = [];
  for (let i = 0; i < count; i++) {
    const tags = [`tag_${i % 5}`, `cat_${i % 3}`, `type_${i % 7}`];
    const scores = new Float64Array(Array.from({ length: 50 }, () => Math.random() * 100));
    const metadata = i % 3 === 0 ? null : `meta_${i}`;
    json.push({ id: i, tags, scores, metadata });
    rows.push([i, tags, scores, metadata]);
  }
  return { json, rows, columns };
}

function generateVariantData(count: number): {
  json: Record<string, unknown>[];
  rows: unknown[][];
  columns: ColumnDef[];
} {
  const columns: ColumnDef[] = [
    { name: "id", type: "UInt32" },
    { name: "v", type: "Variant(String, Int64, Float64)" },
  ];
  const json: Record<string, unknown>[] = [];
  const rows: unknown[][] = [];
  for (let i = 0; i < count; i++) {
    // Rotate through the variant types. Raw values disambiguate naturally
    // (string -> String, bigint -> Int64, number -> Float64); explicit
    // [disc, value] tuples would need canonical (sorted-arm) indices since
    // ClickHouse canonicalizes Variant arms alphabetically.
    const variant = i % 3 === 0 ? `str_${i}` : i % 3 === 1 ? BigInt(i * 100) : Math.random() * 100;
    // JSON representation uses the raw value
    const jsonVal = i % 3 === 0 ? `str_${i}` : i % 3 === 1 ? i * 100 : Math.random() * 100;
    json.push({ id: i, v: jsonVal });
    rows.push([i, variant]);
  }
  return { json, rows, columns };
}

function generateDynamicData(count: number): {
  json: Record<string, unknown>[];
  rows: unknown[][];
  columns: ColumnDef[];
} {
  const columns: ColumnDef[] = [
    { name: "id", type: "UInt32" },
    { name: "d", type: "Dynamic" },
  ];
  const json: Record<string, unknown>[] = [];
  const rows: unknown[][] = [];
  for (let i = 0; i < count; i++) {
    // Mix of types: string, bigint, float, bool
    const val =
      i % 4 === 0
        ? `str_${i}`
        : i % 4 === 1
          ? BigInt(i)
          : i % 4 === 2
            ? Math.random() * 100
            : i % 2 === 0;
    // JSON representation
    const jsonVal = typeof val === "bigint" ? Number(val) : val;
    json.push({ id: i, d: jsonVal });
    rows.push([i, val]);
  }
  return { json, rows, columns };
}

function generateJsonColumnData(count: number): {
  json: Record<string, unknown>[];
  rows: unknown[][];
  columns: ColumnDef[];
} {
  const columns: ColumnDef[] = [
    { name: "id", type: "UInt32" },
    { name: "data", type: "JSON" },
  ];
  const json: Record<string, unknown>[] = [];
  const rows: unknown[][] = [];
  for (let i = 0; i < count; i++) {
    const obj = {
      name: `user_${i}`,
      score: Math.random() * 100,
      active: i % 2 === 0,
      ...(i % 3 === 0 ? { tags: [`tag_${i % 5}`, `cat_${i % 3}`] } : {}),
    };
    json.push({ id: i, data: obj });
    rows.push([i, obj]);
  }
  return { json, rows, columns };
}

function generateColumnarNumericData(count: number) {
  const columns: ColumnDef[] = [
    { name: "id", type: "UInt32" },
    { name: "x", type: "Float64" },
    { name: "y", type: "Float64" },
    { name: "z", type: "Float64" },
  ];

  // Columnar data as TypedArrays
  const ids = new Uint32Array(count);
  const xs = new Float64Array(count);
  const ys = new Float64Array(count);
  const zs = new Float64Array(count);

  for (let i = 0; i < count; i++) {
    ids[i] = i;
    xs[i] = Math.random();
    ys[i] = Math.random();
    zs[i] = Math.random();
  }

  // Row-oriented for comparison
  const rows: unknown[][] = [];
  for (let i = 0; i < count; i++) {
    rows.push([ids[i], xs[i], ys[i], zs[i]]);
  }

  return { columns, rows, columnar: [ids, xs, ys, zs] };
}

// --- Main ---

async function main() {
  await init();

  reportEnvironment();
  const benchOptions = readBenchOptions({ iterations: 50, warmup: 20 });
  const ROWS = 10_000;
  const ITERATIONS = benchOptions.iterations ?? 50;

  console.log(`Benchmarking with ${ROWS} rows, ${ITERATIONS} iterations each\n`);

  // Generate all test data
  const simple = generateSimpleData(ROWS);
  const escapeData = generateEscapeData(ROWS);
  const complex = generateComplexData(ROWS);
  const complexTyped = generateComplexTypedData(ROWS);
  const variant = generateVariantData(ROWS);
  const dynamic = generateDynamicData(ROWS);
  const jsonCol = generateJsonColumnData(ROWS);

  const scenarios: Scenario[] = [
    {
      name: "Simple Data",
      description: "6 columns: int, 2 strings, bool, float, datetime",
      columns: simple.columns,
      jsonData: simple.json,
      rowsArray: simple.rows,
    },
    {
      name: "Escape Data",
      description: "strings with quotes, newlines, backslashes",
      columns: escapeData.columns,
      jsonData: escapeData.json,
      rowsArray: escapeData.rows,
    },
    {
      name: "Complex Data",
      description: "arrays, nullable",
      columns: complex.columns,
      jsonData: complex.json,
      rowsArray: complex.rows,
    },
    {
      name: "Complex Data (Typed)",
      description: "arrays as TypedArrays",
      columns: complexTyped.columns,
      jsonData: complexTyped.json,
      rowsArray: complexTyped.rows,
    },
    {
      name: "Variant",
      description: "Variant(String, Int64, Float64)",
      columns: variant.columns,
      jsonData: variant.json,
      rowsArray: variant.rows,
    },
    {
      name: "Dynamic",
      description: "Dynamic with mixed types",
      columns: dynamic.columns,
      jsonData: dynamic.json,
      rowsArray: dynamic.rows,
    },
    {
      name: "JSON Column",
      description: "JSON objects with varying keys",
      columns: jsonCol.columns,
      jsonData: jsonCol.json,
      rowsArray: jsonCol.rows,
    },
  ];

  const results: ScenarioResult[] = [];
  for (const scenario of scenarios) {
    results.push(await runScenario(scenario, ITERATIONS, benchOptions));
  }

  // Summary
  console.log("=== Summary (speedup vs JSON) ===\n");
  const fmtSpeed = (json: number, native: number) => `Native ${(json / native).toFixed(2)}x`;
  const fmtSize = (json: number, native: number) => `Native ${(json / native).toFixed(2)}x smaller`;

  for (const r of results) {
    console.log(`${r.name}:`);
    console.log(`  Encode: ${fmtSpeed(r.encode.json, r.encode.native)}`);
    console.log(`  Decode: ${fmtSpeed(r.decode.json, r.decode.native)}`);
    console.log(`  Size:   ${fmtSize(r.size.json, r.size.native)}`);
    console.log(`  +LZ4:   ${fmtSize(r.compressed.json.lz4, r.compressed.native.lz4)}`);
    console.log(`  +ZSTD:  ${fmtSize(r.compressed.json.zstd, r.compressed.native.zstd)}`);
    console.log(`  +gzip:  ${fmtSize(r.compressed.json.gzip, r.compressed.native.gzip)}`);
    console.log("");
  }

  // Streaming benchmarks for Native
  console.log("=== Native Streaming vs Sync (Simple Data) ===\n");
  const simpleNativeEncoded = encodeNativeRows(simple.columns, simple.rows);

  console.log("Decoding (sync vs streaming):");
  const syncDec = benchSync("Sync decode", () => decodeNativeBlock(simpleNativeEncoded, 0), {
    ...benchOptions,
    iterations: ITERATIONS,
  });
  console.log(formatResult(syncDec, ROWS));

  const stream1 = await benchAsync(
    "Stream decode (1 chunk)",
    async () => {
      await collectNative(chunkedStream(simpleNativeEncoded, simpleNativeEncoded.length));
    },
    { ...benchOptions, iterations: ITERATIONS },
  );
  console.log(formatResult(stream1, ROWS));

  const stream64k = await benchAsync(
    "Stream decode (64KB chunks)",
    async () => {
      await collectNative(chunkedStream(simpleNativeEncoded, 64 * 1024));
    },
    { ...benchOptions, iterations: ITERATIONS },
  );
  console.log(formatResult(stream64k, ROWS));

  const stream4k = await benchAsync(
    "Stream decode (4KB chunks)",
    async () => {
      await collectNative(chunkedStream(simpleNativeEncoded, 4 * 1024));
    },
    { ...benchOptions, iterations: ITERATIONS },
  );
  console.log(formatResult(stream4k, ROWS));

  console.log("\nEncoding (sync vs streaming):");
  const syncEnc = benchSync("Sync encode", () => encodeNativeRows(simple.columns, simple.rows), {
    ...benchOptions,
    iterations: ITERATIONS,
  });
  console.log(formatResult(syncEnc, ROWS));

  async function* batchGenerator() {
    yield batchFromRows(simple.columns, simple.rows);
  }

  const streamEnc = await benchAsync(
    "Stream encode",
    async () => {
      await collectByteChunks(streamEncodeNative(batchGenerator()));
    },
    { ...benchOptions, iterations: ITERATIONS },
  );
  console.log(formatResult(streamEnc, ROWS));

  console.log("\nStreaming overhead:");
  console.log(
    `  Decode (1 chunk): ${((stream1.meanMs / syncDec.meanMs - 1) * 100).toFixed(1)}% overhead`,
  );
  console.log(
    `  Decode (64KB):    ${((stream64k.meanMs / syncDec.meanMs - 1) * 100).toFixed(1)}% overhead`,
  );
  console.log(
    `  Decode (4KB):     ${((stream4k.meanMs / syncDec.meanMs - 1) * 100).toFixed(1)}% overhead`,
  );
  console.log(
    `  Encode:           ${((streamEnc.meanMs / syncEnc.meanMs - 1) * 100).toFixed(1)}% overhead`,
  );

  // Columnar TypedArray benchmarks
  console.log("\n=== Native Columnar vs Row-based (numeric data) ===\n");
  const columnar = generateColumnarNumericData(ROWS);

  console.log("Native encode (row-based vs columnar TypedArray):");
  const nativeRowEnc = benchSync(
    "Native (row input)",
    () => encodeNativeRows(columnar.columns, columnar.rows),
    { ...benchOptions, iterations: ITERATIONS },
  );
  console.log(formatResult(nativeRowEnc, ROWS));
  const nativeColEnc = benchSync(
    "Native (TypedArray columnar)",
    () =>
      encodeNative(
        batchFromCols({
          id: getCodec("UInt32").fromValues(columnar.columnar[0]),
          x: getCodec("Float64").fromValues(columnar.columnar[1]),
          y: getCodec("Float64").fromValues(columnar.columnar[2]),
          z: getCodec("Float64").fromValues(columnar.columnar[3]),
        }),
      ),
    { ...benchOptions, iterations: ITERATIONS },
  );
  console.log(formatResult(nativeColEnc, ROWS));

  console.log(
    `\nSpeedup: ${(nativeRowEnc.meanMs / nativeColEnc.meanMs).toFixed(2)}x faster with TypedArray columnar input`,
  );
}

main().catch(console.error);
