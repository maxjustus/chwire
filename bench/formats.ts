// Benchmark: Native vs JSONEachRow
//
// Tests encoding/decoding performance for both formats with various data types.

import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
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
import { encodeNativeRows } from "../test/test_utils.ts";

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

function formatResult(
  stats: { name: string; meanMs: number; warmup: number; iterations: number },
  rows: number,
): string {
  const rowsPerSec = rows / (stats.meanMs / 1000);
  const meta = `w=${stats.warmup} n=${stats.iterations}`;
  return `  ${stats.name.padEnd(30)} ${stats.meanMs.toFixed(3).padStart(8)}ms  ${(rowsPerSec / 1_000_000).toFixed(2).padStart(6)}M rows/sec  ${meta}`;
}

function formatKB(bytes: number): string {
  return `${(bytes / 1024).toFixed(1)}KB`;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function encodeJsonEachRow(rows: Record<string, unknown>[]): Uint8Array {
  const chunks: Uint8Array[] = [];
  let totalLength = 0;
  let batch = "";
  for (const row of rows) {
    batch += JSON.stringify(row) + "\n";
    if (batch.length >= 50_000_000) {
      const encoded = encoder.encode(batch);
      chunks.push(encoded);
      totalLength += encoded.length;
      batch = "";
    }
  }
  if (batch.length > 0) {
    const encoded = encoder.encode(batch);
    chunks.push(encoded);
    totalLength += encoded.length;
  }
  if (chunks.length === 1) return chunks[0]!;
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

function decodeJsonEachRow<T>(data: Uint8Array): T[] {
  const CHUNK = 64 * 1024 * 1024;
  const results: T[] = [];
  let carry = "";
  for (let offset = 0; offset < data.length; offset += CHUNK) {
    const slice = data.subarray(offset, Math.min(offset + CHUNK, data.length));
    const text = carry + decoder.decode(slice, { stream: offset + CHUNK < data.length });
    const lines = text.split("\n");
    carry = lines.pop()!;
    for (const line of lines) {
      if (line) results.push(JSON.parse(line) as T);
    }
  }
  if (carry) results.push(JSON.parse(carry) as T);
  return results;
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
    return blocks[0]!;
  }
  // Return first block for benchmark
  return blocks[0]!;
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

function runScenario(scenario: Scenario, benchOptions: BenchOptions): ScenarioResult {
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
  const jsonEnc = benchSync(
    "JSONEachRow encode",
    () => encodeJsonEachRow(scenario.jsonData),
    benchOptions,
  );
  console.log(formatResult(jsonEnc, rows));
  const nativeEnc = benchSync(
    "Native encode",
    () => encodeNativeRows(scenario.columns, scenario.rowsArray),
    benchOptions,
  );
  console.log(formatResult(nativeEnc, rows));

  // Decoding
  console.log("\nDecoding:");
  const jsonDec = benchSync(
    "JSONEachRow decode",
    () => decodeJsonEachRow(jsonEncoded),
    benchOptions,
  );
  console.log(formatResult(jsonDec, rows));
  const nativeDec = benchSync(
    "Native decode",
    () => decodeNativeBlock(nativeEncoded, 0),
    benchOptions,
  );
  console.log(formatResult(nativeDec, rows));

  // Compression comparison (LZ4, ZSTD, gzip)
  const jsonLz4 = encodeBlock(jsonEncoded, "lz4");
  const jsonZstd = encodeBlock(jsonEncoded, "zstd");
  const jsonGzip = new Uint8Array(gzipSync(jsonEncoded));
  const nativeLz4 = encodeBlock(nativeEncoded, "lz4");
  const nativeZstd = encodeBlock(nativeEncoded, "zstd");
  const nativeGzip = new Uint8Array(gzipSync(nativeEncoded));

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
    benchOptions,
  );
  console.log(formatResult(jsonLz4Full, rows));
  const nativeLz4Full = benchSync(
    "Native + LZ4",
    () => encodeBlock(encodeNativeRows(scenario.columns, scenario.rowsArray), "lz4"),
    benchOptions,
  );
  console.log(formatResult(nativeLz4Full, rows));

  const jsonZstdFull = benchSync(
    "JSONEachRow + ZSTD",
    () => encodeBlock(encodeJsonEachRow(scenario.jsonData), "zstd"),
    benchOptions,
  );
  console.log(formatResult(jsonZstdFull, rows));
  const nativeZstdFull = benchSync(
    "Native + ZSTD",
    () => encodeBlock(encodeNativeRows(scenario.columns, scenario.rowsArray), "zstd"),
    benchOptions,
  );
  console.log(formatResult(nativeZstdFull, rows));

  const jsonGzipFull = benchSync(
    "JSONEachRow + gzip",
    () => gzipSync(encodeJsonEachRow(scenario.jsonData)),
    benchOptions,
  );
  console.log(formatResult(jsonGzipFull, rows));
  const nativeGzipFull = benchSync(
    "Native + gzip",
    () => gzipSync(encodeNativeRows(scenario.columns, scenario.rowsArray)),
    benchOptions,
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
  const baseTime = new Date("2024-01-15T10:30:00Z").getTime();
  for (let i = 0; i < count; i++) {
    const score = Math.random() * 100;
    const created_at = new Date(baseTime + i * 1000);
    json.push({
      id: i,
      name: `user_${i}`,
      email: `user${i}@example.com`,
      active: i % 2 === 0,
      score,
      created_at,
    });
    rows.push([i, `user_${i}`, `user${i}@example.com`, i % 2 === 0, score, created_at]);
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
    const row = { id: i, tags, scores, metadata };
    json.push(row);
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
    json.push({ id: i, tags, scores: Array.from(scores), metadata });
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
    const f = Math.random() * 100;
    const variant = i % 3 === 0 ? `str_${i}` : i % 3 === 1 ? BigInt(i * 100) : f;
    const jsonVal = i % 3 === 0 ? `str_${i}` : i % 3 === 1 ? i * 100 : f;
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
    const f = Math.random() * 100;
    const val = i % 4 === 0 ? `str_${i}` : i % 4 === 1 ? BigInt(i) : i % 4 === 2 ? f : i % 2 === 0;
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
    json.push({ id: i, data: { ...obj } });
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

function generateJsonColumnarData(count: number) {
  const type = "JSON(id UInt32, score Float64)";

  const ids = new Uint32Array(count);
  const scores = new Float64Array(count);
  const names: unknown[] = new Array(count);
  const rowObjects: Record<string, unknown>[] = new Array(count);

  for (let i = 0; i < count; i++) {
    ids[i] = i;
    scores[i] = Math.random() * 100;
    names[i] = `user_${i}`;
    rowObjects[i] = { id: i, score: scores[i], name: `user_${i}` };
  }

  return { type, ids, scores, names, rowObjects };
}

// --- Main ---

interface ScenarioDef {
  name: string;
  description: string;
  generate: (count: number) => {
    json: Record<string, unknown>[];
    rows: unknown[][];
    columns: ColumnDef[];
  };
}

const FORMAT_SCENARIOS: ScenarioDef[] = [
  {
    name: "Simple Data",
    description: "6 columns: int, 2 strings, bool, float, datetime",
    generate: generateSimpleData,
  },
  {
    name: "Escape Data",
    description: "strings with quotes, newlines, backslashes",
    generate: generateEscapeData,
  },
  { name: "Complex Data", description: "arrays, nullable", generate: generateComplexData },
  {
    name: "Complex Data (Typed)",
    description: "arrays as TypedArrays",
    generate: generateComplexTypedData,
  },
  {
    name: "Variant",
    description: "Variant(String, Int64, Float64)",
    generate: generateVariantData,
  },
  { name: "Dynamic", description: "Dynamic with mixed types", generate: generateDynamicData },
  {
    name: "JSON Column",
    description: "JSON objects with varying keys",
    generate: generateJsonColumnData,
  },
];

const EXTRA_SECTIONS = ["Streaming", "Columnar", "JSON fromCols"] as const;

const ROWS = 1_000_000;

// Each section runs in its own child process: live data from earlier scenarios
// otherwise pressures the heap and skews the allocation-heavy encode paths of
// later ones (measured 10x slowdown for Variant encode late in a shared run).
function runSectionInChild(section: string, resultFile?: string): void {
  const args = [fileURLToPath(import.meta.url), "--section", section];
  if (resultFile) args.push("--result-file", resultFile);
  const res = spawnSync(process.execPath, [...process.execArgv, ...args], { stdio: "inherit" });
  if (res.status !== 0) {
    throw new Error(`Section '${section}' failed with exit code ${res.status}`);
  }
}

async function runSection(section: string, resultFile?: string) {
  await init();
  const benchOptions = readBenchOptions();

  const scenario = FORMAT_SCENARIOS.find((s) => s.name === section);
  if (scenario) {
    const data = scenario.generate(ROWS);
    const result = runScenario(
      {
        name: scenario.name,
        description: scenario.description,
        columns: data.columns,
        jsonData: data.json,
        rowsArray: data.rows,
      },
      benchOptions,
    );
    if (resultFile) writeFileSync(resultFile, JSON.stringify(result));
    return;
  }

  if (section === "Streaming") return runStreamingSection(benchOptions);
  if (section === "Columnar") return runColumnarSection(benchOptions);
  if (section === "JSON fromCols") return runJsonColsSection(benchOptions);
  throw new Error(`Unknown bench section: ${section}`);
}

async function main() {
  const sectionArg = process.argv.indexOf("--section");
  if (sectionArg !== -1) {
    const resultArg = process.argv.indexOf("--result-file");
    return runSection(
      process.argv[sectionArg + 1]!,
      resultArg === -1 ? undefined : process.argv[resultArg + 1],
    );
  }

  reportEnvironment();
  console.log(`Benchmarking with ${ROWS} rows (one process per section)\n`);

  const tmpDir = mkdtempSync(path.join(tmpdir(), "chttp-bench-"));
  const results: ScenarioResult[] = [];
  try {
    for (const scenario of FORMAT_SCENARIOS) {
      const resultFile = path.join(tmpDir, `${results.length}.json`);
      runSectionInChild(scenario.name, resultFile);
      results.push(JSON.parse(readFileSync(resultFile, "utf8")) as ScenarioResult);
    }
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
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

  for (const section of EXTRA_SECTIONS) runSectionInChild(section);
}

async function runStreamingSection(benchOptions: BenchOptions) {
  const simple = generateSimpleData(ROWS);

  // Streaming benchmarks for Native
  console.log("=== Native Streaming vs Sync (Simple Data) ===\n");
  const simpleNativeEncoded = encodeNativeRows(simple.columns, simple.rows);

  console.log("Decoding (sync vs streaming):");
  const syncDec = benchSync(
    "Sync decode",
    () => decodeNativeBlock(simpleNativeEncoded, 0),
    benchOptions,
  );
  console.log(formatResult(syncDec, ROWS));

  const stream1 = await benchAsync(
    "Stream decode (1 chunk)",
    () => collectNative(chunkedStream(simpleNativeEncoded, simpleNativeEncoded.length)),
    benchOptions,
  );
  console.log(formatResult(stream1, ROWS));

  const stream64k = await benchAsync(
    "Stream decode (64KB chunks)",
    () => collectNative(chunkedStream(simpleNativeEncoded, 64 * 1024)),
    benchOptions,
  );
  console.log(formatResult(stream64k, ROWS));

  const stream4k = await benchAsync(
    "Stream decode (4KB chunks)",
    () => collectNative(chunkedStream(simpleNativeEncoded, 4 * 1024)),
    { warmup: 1, iterations: 5 },
  );
  console.log(formatResult(stream4k, ROWS));

  console.log("\nEncoding (sync vs streaming):");
  const syncEnc = benchSync(
    "Sync encode",
    () => encodeNativeRows(simple.columns, simple.rows),
    benchOptions,
  );
  console.log(formatResult(syncEnc, ROWS));

  async function* batchGenerator() {
    yield batchFromRows(simple.columns, simple.rows);
  }

  const streamEnc = await benchAsync(
    "Stream encode",
    () => collectByteChunks(streamEncodeNative(batchGenerator())),
    benchOptions,
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
}

function runColumnarSection(benchOptions: BenchOptions) {
  console.log("\n=== Native Columnar vs Row-based (numeric data) ===\n");
  const columnar = generateColumnarNumericData(ROWS);

  console.log("Native encode (row-based vs columnar TypedArray):");
  const nativeRowEnc = benchSync(
    "Native (row input)",
    () => encodeNativeRows(columnar.columns, columnar.rows),
    benchOptions,
  );
  console.log(formatResult(nativeRowEnc, ROWS));
  const nativeColEnc = benchSync(
    "Native (TypedArray columnar)",
    () =>
      encodeNative(
        batchFromCols({
          id: getCodec("UInt32").fromValues(columnar.columnar[0]!),
          x: getCodec("Float64").fromValues(columnar.columnar[1]!),
          y: getCodec("Float64").fromValues(columnar.columnar[2]!),
          z: getCodec("Float64").fromValues(columnar.columnar[3]!),
        }),
      ),
    benchOptions,
  );
  console.log(formatResult(nativeColEnc, ROWS));

  console.log(
    `\nSpeedup: ${(nativeRowEnc.meanMs / nativeColEnc.meanMs).toFixed(2)}x faster with TypedArray columnar input`,
  );
}

function runJsonColsSection(benchOptions: BenchOptions) {
  console.log("\n=== JSON fromCols vs fromValues ===\n");
  const jsonColumnar = generateJsonColumnarData(ROWS);
  const jsonCodec = getCodec("JSON(id UInt32, score Float64)");

  console.log("Column construction only:");
  const jsonFromValues = benchSync(
    "fromValues (row objects)",
    () => jsonCodec.fromValues(jsonColumnar.rowObjects),
    benchOptions,
  );
  console.log(formatResult(jsonFromValues, ROWS));

  const jsonFromCols = benchSync(
    "fromCols (columnar)",
    () =>
      jsonCodec.fromCols({
        id: jsonColumnar.ids,
        score: jsonColumnar.scores,
        name: jsonColumnar.names,
      }),
    benchOptions,
  );
  console.log(formatResult(jsonFromCols, ROWS));

  console.log(
    `\nSpeedup: ${(jsonFromValues.meanMs / jsonFromCols.meanMs).toFixed(2)}x faster with fromCols`,
  );

  console.log("\nFull encode path (construct + encodeNative):");
  const jsonFvEncode = benchSync(
    "fromValues + encode",
    () => encodeNative(batchFromCols({ data: jsonCodec.fromValues(jsonColumnar.rowObjects) })),
    benchOptions,
  );
  console.log(formatResult(jsonFvEncode, ROWS));

  const jsonFcEncode = benchSync(
    "fromCols + encode",
    () =>
      encodeNative(
        batchFromCols({
          data: jsonCodec.fromCols({
            id: jsonColumnar.ids,
            score: jsonColumnar.scores,
            name: jsonColumnar.names,
          }),
        }),
      ),
    benchOptions,
  );
  console.log(formatResult(jsonFcEncode, ROWS));

  console.log(
    `\nFull path speedup: ${(jsonFvEncode.meanMs / jsonFcEncode.meanMs).toFixed(2)}x faster with fromCols`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
