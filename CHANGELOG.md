# Changelog

## 1.0.0 - Unreleased

`@maxjustus/chwire` is the renamed successor to `@maxjustus/chttp`. This first
release includes the unreleased changes since `@maxjustus/chttp@1.15.0`.

### Added

- Added configurable ZSTD compression level via `compression: { method: "zstd", level }` (replaces the separate `zstdLevel` option).
- Added `DynamicValue` for inserting `Dynamic`-column values with an explicit ClickHouse type, bypassing runtime type inference.
- Added exported `ClickHouseException` support for structured ClickHouse server errors.
- Added `RecordBatch.isRecordBatch()` for identity-safe batch detection across module copies (ESM/CJS, source vs. bundle); insert and external-table dispatch use it instead of `instanceof`.
- Added a clear error when the server mandates the chunked TCP protocol, instead of desyncing after the handshake.
- Added TCP TLS coverage in the test suite.

### Removed

- Removed RowBinary encode/decode support; Native is now the only binary wire-format codec.

### Fixed

- HTTP requests now send `Accept-Encoding: identity`: the client already does its own block compression, and against ClickHouse 26.x a non-identity Accept-Encoding combined with `compress=1` made the server return empty error bodies (errors surfaced as "Unknown" with no message).
- Fixed mid-stream HTTP exception detection against ClickHouse 26.x, which frames the `__exception__` trailer with the random tag announced in `X-ClickHouse-Exception-Tag`. The old parser missed tagged trailers entirely: text formats returned silently truncated results, and Native streams surfaced decoder garbage (e.g. "Need 4 bytes at offset N") instead of the server exception.
- Native stream decoding now reports "stream ended mid-block" with byte counts when the source ends inside a block, instead of a bare buffer-underflow error.
- The TCP client's `compression` choice now applies to both directions: it is mirrored to the server as `network_compression_method` (plus `network_zstd_compression_level` when a level is set), merged below client and per-call settings. Previously the server always replied with its own default (LZ4) regardless of the configured codec, which made bulk reads over slow links carry 2-4x more wire bytes than zstd allows.
- Fixed TCP bulk-read throughput collapse on high-latency links: the reader now consumes the socket eagerly via `'data'` events (flowing mode) instead of the stream async iterator, which stopped kernel reads every ~64KB and kept the TCP receive window from growing. Backpressure still applies above a 16MB buffered threshold.
- Enabled `TCP_NODELAY` on the TCP connection; Nagle's algorithm delayed the query delimiter packet by one round trip per query.
- Fixed `RecordBatch.decodeTimeMs` reporting an absolute timestamp instead of decode duration when `debug` was off.
- Hardened TCP cancellation, abort, timeout, connection reuse, and reconnect-race behavior.
- Fixed HTTP query parameter passthrough for unmodeled ClickHouse URL parameters.
- Fixed Native and TCP partial block decoding across fragmented streams.
- Fixed Native codec edge cases around decimals, tuple field parsing, sparse data, JSON, Dynamic, IPv6 (including non-ASCII rejection), and negative sub-second DateTime64 sign handling.
- Surfaced mid-stream server exceptions consistently across text and binary (Native) HTTP responses.
- Cancelled the HTTP response reader on early generator exit so the connection returns to the pool instead of being held until GC.
- Copied `Method.None` decode output so in-place HTTP buffer compaction cannot corrupt uncompressed blocks.
- Fixed TCP packet buffer ownership so queued writes cannot alias later `StreamingWriter` reuse, and large uncompressed Data packets no longer bloat the reusable writer buffer.
- Reduced retained memory for small Native/TCP result blocks by lowering stream decode buffer defaults.
- Hardened TCP lifecycle and draining: repeated `connect()` now refuses to replace an active socket, and compressed query drains can discard Data packets without materializing ignored batches.
- Hardened Native compression decode with decompressed-size caps and size verification.
- Fixed stateful `Dynamic(...)` codecs bypassing the Native codec cache, matching `Dynamic`/`JSON` cache behavior.

### Changed

- Decode short ASCII strings (<= 64 bytes) without TextDecoder, whose per-call overhead dominated string-heavy reads; cuts Native block decode time roughly in half on short-string workloads.
- Improved fragmented Native stream decoding performance.
- Applied resumable Native block decoding more consistently across compressed and uncompressed TCP reads.
- Split Native codec internals into smaller scalar, composite, dynamic, base, and registry modules.
- Made default TCP fuzz coverage bounded and moved heavier fuzzing to `test:tcp:stress`.
- Clarified collectable async generator behavior: one generator instance is single-consumer and does not replay after it is drained.
- Unexpected-packet errors now include human-readable packet names.

### Package

- Declared `engines.node >= 22` (the package uses Node 22 APIs such as `Array.fromAsync`); CI tests Node 22 and 24.
- Cleaned package contents with an explicit publish allowlist.
- Added `clean` before `build` so stale `dist` files cannot ship.
- Restored the main Native vs JSON format benchmark.
- Added `bench/tcp-read-profile.ts` (`bench:tcp`) for profiling TCP bulk-read throughput, kernel read stop/start churn, an HTTP transport comparison, and a wall-time ratio against the official clickhouse-client for regression tracking.
- Added `bench:check` to type-check benchmark code.
- Repaired `test:integration` and removed broken benchmark script targets.
