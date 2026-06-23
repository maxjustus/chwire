# Changelog

## 1.0.0

`@maxjustus/chwire` is the renamed successor to `@maxjustus/chttp`. This first
release includes the unreleased changes since `@maxjustus/chttp@1.15.0`.

### Added

- Added configurable ZSTD compression level via `compression: { method: "zstd", level }` (replaces the separate `zstdLevel` option).
- Added `DynamicValue` for inserting `Dynamic`-column values with an explicit ClickHouse type, bypassing runtime type inference.
- Added exported `ClickHouseException` support for structured ClickHouse server errors.
- Added `RecordBatch.isRecordBatch()` for identity-safe batch detection across module copies (ESM/CJS, source vs. bundle); insert and external-table dispatch use it instead of `instanceof`.
- Added a clear error when the server mandates the chunked TCP protocol, instead of desyncing after the handshake.
- Added TCP TLS coverage in the test suite.
- Added adaptive underflow retry backoff to `streamDecodeNative()` (configurable via `underflowRetryMinBytes` / `underflowRetryMaxBytes`) to avoid retrying partial Native blocks after every small chunk.

### Fixed

- HTTP requests now send `Accept-Encoding: identity`: the client already does its own block compression, and against ClickHouse 26.x a non-identity Accept-Encoding combined with `compress=1` made the server return empty error bodies (errors surfaced as "Unknown" with no message).
- Fixed mid-stream HTTP exception detection against ClickHouse 26.x, which frames the `__exception__` trailer with the random tag announced in `X-ClickHouse-Exception-Tag`. The old parser missed tagged trailers entirely: text formats returned silently truncated results, and Native streams surfaced decoder garbage (e.g. "Need 4 bytes at offset N") instead of the server exception.
- Native stream decoding now reports "stream ended mid-block" with byte counts when the source ends inside a block, instead of a bare buffer-underflow error.
- The TCP client now defaults to LZ4 compression. ZSTD choices are mirrored to the server as `network_compression_method` (plus `network_zstd_compression_level` when a level is set), merged below client and per-call settings. Previously the server always replied with its own default (LZ4) regardless of the configured codec, which made bulk reads over slow links carry 2-4x more wire bytes than zstd allows.
- Fixed TCP bulk-read throughput collapse on high-latency links: the reader now consumes the socket eagerly via `'data'` events (flowing mode) instead of the stream async iterator, which stopped kernel reads every ~64KB and kept the TCP receive window from growing. Backpressure still applies above a 16MB buffered threshold.
- Enabled `TCP_NODELAY` on the TCP connection; Nagle's algorithm delayed the query delimiter packet by one round trip per query.
- Fixed `RecordBatch.decodeTimeMs` reporting an absolute timestamp instead of decode duration when `debug` was off.
- Hardened TCP cancellation, abort, timeout, connection reuse, and reconnect-race behavior.
- Fixed HTTP query parameter passthrough for unmodeled ClickHouse URL parameters.
- Fixed Native and TCP partial block decoding across fragmented streams.
- Fixed TCP settings serialization revision gating so ZSTD compression mirroring works against ClickHouse 23.8/24.x instead of causing the server to close the connection mid-query.
- Fixed Native codec edge cases around decimals, tuple field parsing, sparse data, JSON, Dynamic, IPv6 (including non-ASCII rejection), and negative sub-second DateTime64 sign handling.
- Surfaced mid-stream server exceptions consistently across text and binary (Native) HTTP responses.
- Cancelled the HTTP response reader on early generator exit so the connection returns to the pool instead of being held until GC.
- Copied `Method.None` decode output so in-place HTTP buffer compaction cannot corrupt uncompressed blocks.
- Fixed TCP packet buffer ownership so queued writes cannot alias later `StreamingWriter` reuse, and large uncompressed Data packets no longer bloat the reusable writer buffer.
- Reduced retained memory for small Native/TCP result blocks by lowering stream decode buffer defaults.
- Hardened TCP lifecycle and draining: repeated `connect()` now refuses to replace an active socket, and compressed query drains can discard Data packets without materializing ignored batches.
- Hardened Native compression decode with decompressed-size caps and size verification.
- Fixed stateful `Dynamic(...)` codecs bypassing the Native codec cache, matching `Dynamic`/`JSON` cache behavior.
- Native JSON inserts now reject top-level arrays with a clear error instead of silently encoding them as empty objects.

### Changed

- **Breaking**: HTTP `query()` and `insert()` signatures changed — `sessionId` is no longer a positional parameter. It moves into the options object as `options.sessionId` and is now optional; omitting it produces a stateless request (no `session_id` URL param sent). Old: `query(sql, sessionId, options)` / `insert(sql, data, sessionId, options)`. New: `query(sql, options?)` / `insert(sql, data, options?)`.
- **Breaking**: Renamed HTTP option `baseUrl` to `url`.
- Decode short ASCII strings (<= 64 bytes) without TextDecoder, whose per-call overhead dominated string-heavy reads; cuts Native block decode time roughly in half on short-string workloads.
- Optimized `concat()` with 0/1 chunk fast paths.
- Improved fragmented Native stream decoding performance.
- Applied resumable Native block decoding more consistently across compressed and uncompressed TCP reads.
- Split Native codec internals into smaller scalar, composite, dynamic, base, and registry modules.
- Made default TCP fuzz coverage bounded and consolidated heavier generated fuzzing behind the shared `fuzz/` runner (`npm run test:fuzz`).
- Clarified collectable async generator behavior: one generator instance is single-consumer and does not replay after it is drained.
- Unexpected-packet errors now include human-readable packet names.
- Changed exported `encodeBlock()` to accept the `Compression` union (`"lz4"`, `"zstd"`, `false`, or `{ method: "zstd", level }`) instead of a method code plus separate ZSTD level.

### Package

- Renamed the published package and CLI from `@maxjustus/chttp` / `chttp` to `@maxjustus/chwire` / `chwire`.
- Declared `engines.node >= 22` (the package uses Node 22 APIs such as `Array.fromAsync`); CI tests Node 22 and 24.
- Cleaned package contents with an explicit publish allowlist.
- Removed `development` export conditions; source remains available through the `./source` export.
- Added `clean` before `build` so stale `dist` files cannot ship.
- Restored the main Native vs JSON format benchmark.
- Added `bench/tcp-read-profile.ts` (`bench:tcp`) for profiling TCP bulk-read throughput, kernel read stop/start churn, an HTTP transport comparison, and a wall-time ratio against the official clickhouse-client for regression tracking.
- Added `bench:check` to type-check benchmark code.
- Added `test:matrix` for running the suite across multiple ClickHouse versions.
- Repaired `test:integration` and removed broken benchmark script targets.
