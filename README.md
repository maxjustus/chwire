# chwire

ClickHouse HTTP/TCP client and Native wire format toolkit for TypeScript.

## Install

```bash
npm install @maxjustus/chwire
```

## HTTP vs TCP

| Feature | HTTP | TCP |
|---------|------|-----|
| Real-time progress | No | Yes (rows read/written, bytes, memory, CPU) |
| Server logs | No | Yes (via `send_logs_level` setting) |
| Profile events | No | Yes (detailed execution metrics) |
| Long-running queries | Timeout-prone | Robust (persistent connection) |
| Browser support | Yes | No (Node/Bun/Deno only) |

Use **HTTP** for browser apps or simple queries. Use **TCP** for observability, long-running queries, and lower latency.

## Quick Start

### HTTP Client

The HTTP client is stateless — `query()` and `insert()` are standalone functions that each make a single HTTP request.

```ts
import { insert, query, streamEncodeJsonEachRow, collectText } from "@maxjustus/chwire";

const connectionConfig = {
  url: "http://localhost:8123/",
  auth: { username: "default", password: "" },
};

// Insert
const { summary } = await insert(
  "INSERT INTO table FORMAT JSONEachRow",
  streamEncodeJsonEachRow([{ id: 1, name: "test" }]),
  connectionConfig,
);
console.log(`Wrote ${summary.written_rows} rows`);

// Query
const json = await collectText(query("SELECT * FROM table FORMAT JSON", connectionConfig));

// DDL
await query("CREATE TABLE ...", connectionConfig);
```

### TCP Client

```ts
import { TcpClient } from "@maxjustus/chwire/tcp";

const client = new TcpClient({ host: "localhost", port: 9000 });
await client.connect();

// Query
for await (const packet of client.query("SELECT * FROM table")) {
  if (packet.type === "Data") {
    for (const row of packet.batch) console.log(row.id, row.name);
  }
}

// Insert
await client.insert("INSERT INTO table", [{ id: 1, name: "alice" }]);

client.close();
```

## HTTP Client

`query()` returns a `CollectableAsyncGenerator` that yields `Data` packets (raw `Uint8Array` chunks), `Progress` packets, and a final `Summary`. Use `await` to collect all packets into an array, or pipe through helpers like `collectText` and `streamDecodeJsonEachRow` which consume the Data chunks for you.

`insert()` returns `Promise<InsertResult>` — an object with `summary` (containing `written_rows`, `written_bytes`, `elapsed_ns`, etc.) and `queryId`.

### Query Parameters

```ts
const result = await collectText(
  query("SELECT {id: UInt64} as id, {name: String} as name FORMAT JSON", {
    ...connectionConfig,
    params: { id: 42, name: "Alice" },
  }),
);
```

Parameters are type-safe and prevent SQL injection. The type annotation (e.g., `{name: String}`) tells ClickHouse how to parse the value.

Unknown root-level option keys are forwarded as raw ClickHouse URL params:

```ts
const result = await collectText(query("SELECT 42 as value", {
  ...connectionConfig,
  default_format: "TSV",
  wait_end_of_query: 1,
}));
```

The transport keys `url`, `auth`, `compression`, `compressQuery`, `signal`, `timeout`,
`clientVersion`, `settings`, `params`, `externalTables`, `queryId`, and `sessionId` are reserved
and are not forwarded as raw URL params.

### Parsing Query Results

The `query()` function yields raw `Uint8Array` chunks aligned to compression blocks, not rows. Use helpers to parse:

```ts
import {
  query,
  streamText,
  streamLines,
  streamDecodeJsonEachRow,
  collectJsonEachRow,
  collectText,
  collectBytes,
} from "@maxjustus/chwire";

// JSONEachRow - streaming parsed objects
for await (const row of streamDecodeJsonEachRow(
  query("SELECT * FROM t FORMAT JSONEachRow", connectionConfig),
)) {
  console.log(row.id, row.name);
}

const res = await collectJsonEachRow(
  query("SELECT * FROM t FORMAT JSONEachRow", connectionConfig),
);

// CSV/TSV - streaming raw lines
for await (const line of streamLines(
  query("SELECT * FROM t FORMAT CSV", connectionConfig),
)) {
  const [id, name] = line.split(",");
}

// JSON format - buffer entire response
const json = await collectText(
  query("SELECT * FROM t FORMAT JSON", connectionConfig),
);
const data = JSON.parse(json);
```

### Streaming Large Inserts

The HTTP `insert` function accepts `Uint8Array`, `Uint8Array[]`, or `AsyncIterable<Uint8Array>`. Use `streamEncodeJsonEachRow` for JSON data:

```ts
// Streaming JSON objects
async function* generateRows() {
  for (let i = 0; i < 1000000; i++) {
    yield { id: i, value: `data_${i}` };
  }
}

await insert(
  "INSERT INTO large_table FORMAT JSONEachRow",
  streamEncodeJsonEachRow(generateRows()),
  {
    ...connectionConfig,
    compression: { method: "zstd", level: 6 },
    onProgress: (p) => console.log(`${p.bytesUncompressed} bytes`),
  },
);

// Streaming raw bytes (any format)
async function* generateCsvChunks() {
  const encoder = new TextEncoder();
  for (let batch = 0; batch < 1000; batch++) {
    let chunk = "";
    for (let i = 0; i < 1000; i++) {
      chunk += `${batch * 1000 + i},value_${i}\n`;
    }
    yield encoder.encode(chunk);
  }
}

await insert(
  "INSERT INTO large_table FORMAT CSV",
  generateCsvChunks(),
  {
    ...connectionConfig,
    compression: "lz4" 
  },
);
```

### External Tables

Send temporary in-memory tables with your query. Schema is auto-extracted from RecordBatch:

```ts
import { batchFromCols, getCodec, query, collectText } from "@maxjustus/chwire";

const users = batchFromCols({
  id: getCodec("UInt32").fromValues(new Uint32Array([1, 2, 3])),
  name: getCodec("String").fromValues(["Alice", "Bob", "Charlie"]),
});

const result = await collectText(query(
  "SELECT * FROM users WHERE id > 1 FORMAT JSON",
  { url, auth, externalTables: { users } }
));
```

For raw TSV/CSV/JSON data, use the explicit structure form:

```ts
const result = await collectText(query(
  "SELECT * FROM mydata ORDER BY id FORMAT JSON",
  {
    url, auth,
    externalTables: {
      mydata: {
        structure: "id UInt32, name String",
        format: "TabSeparated",  // or JSONEachRow, CSV, etc.
        data: "1\tAlice\n2\tBob\n"
      }
    }
  }
));
```

### Timeout and Cancellation

Configure with `timeout` (ms) or provide an `AbortSignal` for manual cancellation:

```ts
// Custom timeout
await insert(sql, data, { ...connectionConfig, timeout: 60_000 });

// Manual cancellation
const controller = new AbortController();
setTimeout(() => controller.abort(), 5000);
await insert(sql, data, { ...connectionConfig, signal: controller.signal });

// Both (whichever triggers first)
await insert(sql, data, {
  ...connectionConfig,
  signal: controller.signal,
  timeout: 60_000,
});
```

### Error Handling

The HTTP client throws `ClickHouseException` for server errors:

```ts
import { ClickHouseException } from "@maxjustus/chwire";

try {
  for await (const _ of query("SELECT * FROM nonexistent", config)) {}
} catch (err) {
  if (err instanceof ClickHouseException) {
    console.log(err.code);          // 60 (UNKNOWN_TABLE)
    console.log(err.exceptionName); // "DB::Exception"
    console.log(err.message);       // "Table ... doesn't exist"
  }
}
```

Insert errors follow the same pattern:

```ts
try {
  await insert("INSERT INTO t FORMAT JSONEachRow", data, config);
} catch (err) {
  if (err instanceof ClickHouseException) {
    console.log(err.code);
    console.log(err.message);
  }
}
```

## TCP Client

Uses ClickHouse's native TCP protocol. TCP Single connection per client; use separate clients for concurrent operations.
Note that the TCP protocol only sends/recieves data in Native format.

### Basic Usage

```ts
import { TcpClient } from "@maxjustus/chwire/tcp";

const client = new TcpClient({
  host: "localhost",
  port: 9000,
  database: "default",
  user: "default",
  password: "",
});
await client.connect();

for await (const packet of client.query("SELECT * FROM table")) {
  if (packet.type === "Data") {
    for (const row of packet.batch) {
      console.log(row.id, row.name);
    }
  }
}

// DDL
await client.query("CREATE TABLE ...");

// Insert (await collects and discards packets; for progress tracking see "Insert Progress Tracking" below)
await client.insert("INSERT INTO table", [{ id: 1, name: "alice" }]);

client.close();
```

### Connection Options

```ts
const client = new TcpClient({
  host: "localhost",
  port: 9000,
  database: "default",
  user: "default",
  password: "",
  compression: "lz4", // 'lz4' | 'zstd' | false | { method: 'zstd', level: 6 }
  connectTimeout: 10000, // ms
  queryTimeout: 30000, // ms
  tls: true, // or Node.js tls.ConnectionOptions for custom CA/certs. IE: tls: { ca: fs.readFileSync("/path/to/ca.pem"), rejectUnauthorized: true },
});
```

### Streaming Results

Query yields packets - handle by type:

```ts
for await (const packet of client.query(sql, { settings: { send_logs_level: "trace" } })) {
  switch (packet.type) {
    case "Data":
      console.log(`${packet.batch.rowCount} rows`);
      break;
    case "Progress":
      console.log(`${packet.progress.readRows} rows read`);
      break;
    case "Log":
      for (const entry of packet.entries) {
        console.log(`[${entry.source}] ${entry.text}`);
      }
      break;
    case "ProfileInfo":
      console.log(`${packet.info.rows} total rows`);
      break;
    case "EndOfStream":
      break;
  }
}
```

### Progress Tracking

Progress packets contain **delta values** (increments since the last packet). The client accumulates these into running totals available via `packet.accumulated`:

```ts
for await (const packet of client.query(sql)) {
  if (packet.type === "Progress") {
    const { accumulated } = packet;
    console.log(`${accumulated.percent}% complete`);
    console.log(`Read: ${accumulated.readRows} rows, ${accumulated.readBytes} bytes`);
    console.log(`Elapsed: ${Number(accumulated.elapsedNs) / 1e9}s`);
  }
}
```

### ProfileEvents and Resource Metrics

ProfileEvents provide execution metrics. Memory and CPU stats are merged into accumulated progress:

```ts
for await (const packet of client.query(sql)) {
  if (packet.type === "Progress") {
    const { accumulated } = packet;
    console.log(`Memory: ${accumulated.memoryUsage} bytes`);
    console.log(`Peak memory: ${accumulated.peakMemoryUsage} bytes`);
    console.log(`CPU time: ${accumulated.cpuTimeMicroseconds}µs`);
    console.log(`CPU cores utilized: ${accumulated.cpuUsage.toFixed(1)}`);
  }

  if (packet.type === "ProfileEvents") {
    // Raw accumulated event counters
    console.log(`Selected rows: ${packet.accumulated.get("SelectedRows")}`);
    console.log(`Read bytes: ${packet.accumulated.get("ReadCompressedBytes")}`);
  }
}
```

`memoryUsage` is the latest value; `peakMemoryUsage` is the max seen. `cpuUsage` shows equivalent CPUs utilized.

### Insert API

The `insert()` method accepts RecordBatches or row objects:

```ts
// Single batch
await client.insert("INSERT INTO t", batch);

// Multiple batches
await client.insert("INSERT INTO t", [batch1, batch2]);

// Row objects with auto-coercion. Types are inferred from server schema.
// Unknown keys ignored, omitted keys use defaults, incompatible provided types throw.
await client.insert("INSERT INTO t", [
  { id: 1, name: "alice" },
  { id: 2, name: "bob" },
]);

// Streaming rows with generator
async function* generateRows() {
  for (let i = 0; i < 1000000; i++) {
    yield { id: i, name: `user${i}` };
  }
}

// batchSize dictates number of rows per RecordBatch (native insert block) sent
await client.insert("INSERT INTO t", generateRows(), { batchSize: 10000 });

// Schema validation (fail fast if types don't match the schema the server sends for the insert table)
await client.insert("INSERT INTO t", rows, {
  schema: [
    { name: "id", type: "UInt32" },
    { name: "name", type: "String" },
  ],
});
```

#### Insert Progress Tracking

Both `query()` and `insert()` return a `CollectableAsyncGenerator<Packet>`:
- `await gen` collects all packets into an array
- `for await` streams packets one at a time
- the same generator instance is single-consumer and does not replay once drained

```ts
// Collect all packets
const packets = await client.insert("INSERT INTO t", rows);
const progress = packets.findLast(p => p.type === "Progress");
if (progress?.type === "Progress") {
  console.log(`Wrote ${progress.accumulated.writtenRows} rows`);
}

// Stream packets (useful for real-time progress on large inserts)
for await (const packet of client.insert("INSERT INTO t", generateRows())) {
  if (packet.type === "Progress") {
    console.log(`Written: ${packet.accumulated.writtenRows} rows`);
  }
}
```

### Query Parameters

```ts
for await (const packet of client.query(
  "SELECT * FROM users WHERE age > {min_age: UInt32}",
  { params: { min_age: 18 } }
)) { /* ... */ }
```

Same `{name: Type}` syntax as HTTP. Parameters are type-safe and prevent SQL injection.

### External Tables

Pass RecordBatches directly:

```ts
import { batchFromCols, getCodec } from "@maxjustus/chwire";

const users = batchFromCols({
  id: getCodec("UInt32").fromValues(new Uint32Array([1, 2, 3])),
  name: getCodec("String").fromValues(["Alice", "Bob", "Charlie"]),
});

for await (const packet of client.query(
  "SELECT * FROM users WHERE id > 1",
  { externalTables: { users } }
)) {
  if (packet.type === "Data") {
    for (const row of packet.batch) console.log(row.name);
  }
}
```

Supports streaming via iterables/async iterables of RecordBatch:

```ts
async function* generateBatches() {
  for (let i = 0; i < 10; i++) {
    yield batchFromCols({ id: getCodec("UInt32").fromValues([i]) });
  }
}

await client.query("SELECT sum(id) FROM data", {
  externalTables: { data: generateBatches() }
});
```

### Streaming Between Tables

Use separate connections for concurrent read/write:

```ts
import { TcpClient, recordBatches } from "@maxjustus/chwire/tcp";

const readClient = new TcpClient(options);
const writeClient = new TcpClient(options);
await readClient.connect();
await writeClient.connect();

// Stream RecordBatches from one table to another
await writeClient.insert(
  "INSERT INTO dst",
  // recordBatches extracts record batch objects from Data packets in the result packet stream.
  recordBatches(readClient.query("SELECT * FROM src")),
);
```

### Cancellation

```ts
const controller = new AbortController();
setTimeout(() => controller.abort(), 5000);

await client.connect({ signal: controller.signal });

for await (const p of client.query(sql, { signal: controller.signal })) {
  // ...
}
```

### Auto-Close on Scope Exit

```ts
await using client = await TcpClient.connect(options);
// automatically closed when scope exits
```

### Error Handling

The TCP client throws `ClickHouseException` for server errors:

```ts
import { TcpClient, ClickHouseException } from "@maxjustus/chwire/tcp";

try {
  for await (const _ of client.query("SELECT * FROM nonexistent")) {}
} catch (err) {
  if (err instanceof ClickHouseException) {
    console.log(err.code);            // 60 (UNKNOWN_TABLE)
    console.log(err.exceptionName);   // "DB::Exception"
    console.log(err.message);         // "Table ... doesn't exist"
    console.log(err.serverStackTrace); // Full server-side stack trace
    console.log(err.nested);          // Nested exception if present
  }
}
```

Connection and protocol errors throw standard `Error`:

```ts
try {
  await client.connect();
} catch (err) {
  // err.message: "Connection timeout after 10000ms"
  // err.message: "Not connected"
  // err.message: "Connection busy - cannot run concurrent operations..."
}
```

## Native Format

Native is ClickHouse's columnar binary wire format. It's generally faster and smaller to serialize/deserialize vs JSON (see Performance below). Data arrives as RecordBatch objects. RecordBatch wraps typed column arrays you can iterate by row or access by column. Use it when throughput matters; use JSON when you want plain objects and don't need the speed.

### RecordBatch Construction

```ts
import {
  insert,
  query,
  encodeNative,
  streamDecodeNative,
  rows,
  collectRows,
  batchFromRows,
  batchFromCols,
  getCodec,
  DynamicValue,
} from "@maxjustus/chwire";

const schema = [
  { name: "id", type: "UInt32" },
  { name: "name", type: "String" },
];

// From row arrays
const batch = batchFromRows(schema, [
  [1, "alice"],
  [2, "bob"],
  [3, "charlie"],
]);

// From pre-built columns (zero-copy for TypedArrays)
const batch2 = batchFromCols({
  id: getCodec("UInt32").fromValues(new Uint32Array([1, 2, 3])),
  name: getCodec("String").fromValues(["alice", "bob", "charlie"]),
});

// From generators (streaming row construction)
function* generateRows() {
  yield [1, "alice"];
  yield [2, "bob"];
  yield [3, "charlie"];
}
const batch3 = batchFromRows(schema, generateRows());

// Encode and insert (HTTP)
await insert(
  "INSERT INTO t FORMAT Native",
  encodeNative(batch),
  connectionConfig,
);

// Query returns columnar data as RecordBatch - stream rows directly
for await (const row of rows(
  streamDecodeNative(query("SELECT * FROM t FORMAT Native", connectionConfig)),
)) {
  console.log(row.id, row.name);
}

// Or collect all rows at once (materialized to plain objects)
const allRows = await collectRows(
  streamDecodeNative(query("SELECT * FROM t FORMAT Native", connectionConfig)),
);

// Work with batches directly for columnar access
for await (const batch of streamDecodeNative(
  query("SELECT * FROM t FORMAT Native", connectionConfig),
)) {
  const ids = batch.getColumn("id")!;
  for (let i = 0; i < ids.length; i++) {
    console.log(ids.get(i));
  }
}
```

For highly fragmented byte streams, `streamDecodeNative()` backs off retries after repeated underflows: the retry wait starts at the observed chunk size (or `underflowRetryMinBytes` when set), then doubles up to `underflowRetryMaxBytes` (default 1 MiB). This improves throughput by reducing repeated partial column decode work, at the cost of potentially delaying a batch until more bytes arrive (or the stream ends). Set the max to `0` to disable backoff:

```ts
streamDecodeNative(chunks, { underflowRetryMaxBytes: 0 });
```

String-heavy reads can opt into lazy string materialization with `lazyStrings: true` in Native decode options. The decoder stores wire bytes plus offsets and decodes each `String` on first `get()`, memoizing by default. This is fastest when you filter, project, or re-encode batches without reading every string value; if you immediately materialize every row, eager and lazy decode are roughly tied.

```ts
for await (const batch of streamDecodeNative(
  query("SELECT * FROM events FORMAT Native", connectionConfig),
  { lazyStrings: true },
)) {
  // String values decode only when accessed.
  console.log(batch.getColumn("message")?.get(0));
}
```

### Building Columns from Values

Build columns independently with `getCodec().fromValues()`:

```ts
const idCol = getCodec("UInt32").fromValues([1, 2, 3]);
const nameCol = getCodec("String").fromValues(["alice", "bob", "charlie"]);

// Columns carry their type - schema is derived automatically
const batch = batchFromCols({ id: idCol, name: nameCol });
// batch.schema = [{ name: "id", type: "UInt32" }, { name: "name", type: "String" }]
```

For numeric columns, pass TypedArrays (e.g., `Uint32Array`, `Float64Array`) for zero-copy construction.

### Complex Types

```ts
// Array(Int32)
batchFromCols({
  tags: getCodec("Array(Int32)").fromValues([[1, 2], [3, 4, 5], [6]]),
});

// Tuple(Float64, Float64) - positional
batchFromCols({
  point: getCodec("Tuple(Float64, Float64)").fromValues([[1.0, 2.0], [3.0, 4.0]]),
});

// Tuple(x Float64, y Float64) - named tuples use objects
batchFromCols({
  point: getCodec("Tuple(x Float64, y Float64)").fromValues([
    { x: 1.0, y: 2.0 },
    { x: 3.0, y: 4.0 },
  ]),
});

// Map(String, Int32)
batchFromCols({
  meta: getCodec("Map(String, Int32)").fromValues([{ a: 1, b: 2 }, new Map([["c", 3]])]),
});

// Nullable(String)
batchFromCols({
  note: getCodec("Nullable(String)").fromValues(["hello", null, "world"]),
});

// Variant(String, Int64, Bool) - type inferred from values
batchFromCols({
  val: getCodec("Variant(String, Int64, Bool)").fromValues(["hello", 42n, true, null]),
});

// Variant with explicit discriminators (for ambiguous cases)
batchFromCols({
  val: getCodec("Variant(String, Int64, Bool)").fromValues([
    [0, "hello"], [1, 42n], [2, true], null
  ]),
});

// Dynamic - types inferred automatically
batchFromCols({
  dyn: getCodec("Dynamic").fromValues(["hello", 42, true, [1, 2, 3], null]),
});

// Dynamic with an explicit per-value type (skips inference) via DynamicValue
batchFromCols({
  dyn: getCodec("Dynamic").fromValues([new DynamicValue("Int8", 5), new DynamicValue("Float64", 3)]),
});

// JSON - plain objects
batchFromCols({
  data: getCodec("JSON").fromValues([{ a: 1, b: "x" }, { a: 2, c: true }]),
});

// Nested(a UInt32, b String) - encoded as Array(Tuple(a UInt32, b String)).
// A top-level Nested column only round-trips when the target table was created
// with flatten_nested=0 (see the note below).
batchFromCols({
  n: getCodec("Nested(a UInt32, b String)").fromValues([
    [{ a: 1, b: "x" }, { a: 2, b: "y" }],
    [],
  ]),
});
```

### Streaming Native Insert

```ts
import { insert, streamEncodeNative, batchFromCols, getCodec } from "@maxjustus/chwire";

async function* generateBatches() {
  const batchSize = 10000;
  for (let i = 0; i < 100; i++) {
    const ids = new Uint32Array(batchSize);
    const values = new Float64Array(batchSize);
    for (let j = 0; j < batchSize; j++) {
      ids[j] = i * batchSize + j;
      values[j] = Math.random();
    }
    yield batchFromCols({
      id: getCodec("UInt32").fromValues(ids),
      value: getCodec("Float64").fromValues(values),
    });
  }
}

await insert(
  "INSERT INTO t FORMAT Native",
  streamEncodeNative(generateBatches()),
  connectionConfig,
);
```

Supports all ClickHouse types, with the two caveats below.

**Limitation**: `Dynamic` and `JSON` types require V3 flattened format. On ClickHouse 25.6+, set `output_format_native_use_flattened_dynamic_and_json_serialization=1`.

**Limitation**: A top-level `Nested` column is encoded as a single `Array(Tuple(...))` column. It only round-trips when the target table was created with `flatten_nested=0`. Under the default `flatten_nested=1`, ClickHouse stores the group as separate `<name>.<field>` Array columns; inserting the single Nested column then matches no physical column and the rows are silently stored as empty arrays (no error). `Nested` used inside another type is unaffected.

### BigInt Handling

ClickHouse 64-bit+ integers (Int64, UInt64, Int128, etc.) are returned as JavaScript BigInt. Pass `{ bigIntAsString: true }` to convert to strings for consumer code / JSON serialization:

```ts
const row = batch.get(0, { bigIntAsString: true });
const obj = row.toObject({ bigIntAsString: true });
const allRows = batch.toArray({ bigIntAsString: true });
```

> **Global alternative**: Add `BigInt.prototype.toJSON = function() { return this.toString(); };` at startup. See [MDN](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/BigInt#use_within_json).

## Compression

Set `compression` in HTTP or TCP options:

- `"lz4"` - default. Fast.
- `"zstd"` - ~2x better compression. Default level is 3.
- `false` - no compression for query results or insert data
- `{ method: "zstd", level: number }` - ZSTD with an explicit level (1-22, default: 3)

LZ4 and ZSTD use native Node addons (`lz4-napi`, `zstd-napi`) installed automatically as optional dependencies. In browsers and Deno, where native addons aren't supported, a bundled WASM implementation is used instead.

`compressQuery` compresses the HTTP request body (your SQL and any external table data) using HTTP `Content-Encoding`. This is independent of `compression`, which controls ClickHouse block compression on responses — they apply to different directions and don't double-compress. Set `compressQuery` to `"zstd"`, `"lz4"`, or `{ method: "zstd", level }`; requires the server setting `enable_http_compression=1`.

## Performance

Benchmarks on Apple M4 Max / Node v25.9.0, 100k rows, adaptive iterations (the benchmark output prints warmup/sample counts).

### Encode (raw, no compression)

| Scenario | JSON | Native | Speedup |
|----------|------|--------|---------|
| Simple (6 cols) | 98ms | 23ms | 4.2x |
| Escape-heavy strings | 21ms | 20ms | 1.1x |
| Arrays (50 floats/row) | 182ms | 65ms | 2.8x |
| Arrays typed (50 floats/row) | 179ms | 67ms | 2.7x |
| Variant | 5.6ms | 7.9ms | 0.7x |
| Dynamic | 5.0ms | 6.8ms | 0.7x |
| JSON column | 11ms | 36ms | 0.3x |

### Decode (raw)

| Scenario | JSON | Native | Speedup |
|----------|------|--------|---------|
| Simple (6 cols) | 45ms | 26ms | 1.8x |
| Escape-heavy strings | 49ms | 82ms | 0.6x |
| Arrays (50 floats/row) | 238ms | 50ms | 4.8x |
| Arrays typed (50 floats/row) | 232ms | 52ms | 4.5x |
| Variant | 21ms | 1.5ms | 13.6x |
| Dynamic | 21ms | 1.2ms | 17.7x |
| JSON column | 46ms | 7.8ms | 5.9x |

### Encode + Compress (full path)

| Scenario | JSON+LZ4 | Native+LZ4 | JSON+ZSTD | Native+ZSTD | JSON+gzip | Native+gzip |
|----------|----------|------------|-----------|-------------|-----------|-------------|
| Simple (6 cols) | 123ms | 30ms | 135ms | 33ms | 179ms | 100ms |
| Escape-heavy strings | 47ms | 26ms | 40ms | 28ms | 49ms | 64ms |
| Arrays (50 floats/row) | 362ms | 87ms | 735ms | 119ms | 2879ms | 1097ms |
| Arrays typed (50 floats/row) | 363ms | 118ms | 723ms | 180ms | 2834ms | 1121ms |
| Variant | 9.3ms | 10ms | 12ms | 12ms | 50ms | 52ms |
| Dynamic | 7.8ms | 9.7ms | 9.4ms | 8.8ms | 36ms | 44ms |
| JSON column | 35ms | 43ms | 46ms | 44ms | 97ms | 103ms |

### Compressed Size (Native as % of JSONEachRow compressed with same codec, lower = smaller)

| Scenario | LZ4 | ZSTD | gzip |
|----------|-----|------|------|
| Simple (6 cols) | 66% | 65% | 65% |
| Escape-heavy strings | 93% | 158%* | 81% |
| Arrays (50 floats/row) | 48% | 82% | 85% |
| Arrays typed (50 floats/row) | 48% | 82% | 85% |
| Variant | 70% | 81% | 68% |
| Dynamic | 72% | 93% | 61% |
| JSON column | 56% | 63% | 65% |

*Escape-heavy strings with ZSTD: JSON's escaping creates repetitive byte patterns that ZSTD exploits.

Run `make bench` (or `npm run bench`) to reproduce.

## Development

Requires Node.js 22+. The default test suite includes browser coverage; after `npm ci`, install the Playwright browser once with `npx playwright install chromium` (CI uses `--with-deps`).

```bash
make test              # build + run full test matrix across ClickHouse versions
make test-tcp          # TCP client tests only
make fuzz              # generated/native fuzz suite
make format            # run Biome formatter
make bench                  # Native vs JSON encode/compress benchmark
make bench-formats          # Same benchmark via direct node runner
make bench-concurrent       # HTTP vs TCP connect+query throughput under concurrency
make profile-json-caching   # JSON codec schema caching across batches
npm run bench:tcp            # TCP bulk-read throughput + wall-time ratio vs official clickhouse-client
make bench-profile ARGS="-f native -o encode -d complex"  # CPU profile a specific scenario
make update-settings   # regenerate ClickHouseSettings types from latest CH source
```

For a quick single-version test run: `npm test` (or `CH_VERSION=26.4 npm test`).

## CLI test client

Run queries directly from the command line via the bundled TCP client:

```bash
# Single query (outputs NDJSON packets)
npx @maxjustus/chwire 'SELECT version()'
bunx @maxjustus/chwire 'SELECT 1 + 1'

# Interactive REPL with history
npx @maxjustus/chwire

# Deno (with Node compatibility)
deno run -A npm:@maxjustus/chwire 'SELECT now()'
```

Configure via environment variables:

```bash
CH_HOST=clickhouse.example.com CH_PORT=9000 npx @maxjustus/chwire 'SELECT 1'
```

| Variable | Default | Description |
|----------|---------|-------------|
| CH_HOST | localhost | ClickHouse host |
| CH_PORT | 9000 | TCP native port |
| CH_USER | default | Username |
| CH_PASSWORD | "" | Password |

The REPL supports `\load file.jsonl INTO table` for bulk inserts from NDJSON files.
