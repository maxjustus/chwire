# Changelog

## 1.0.0 - 2026-05-30

`@maxjustus/chwire` is the renamed successor to `@maxjustus/chttp`. This first
release includes the unreleased changes since `@maxjustus/chttp@1.15.0`.

### Added

- Added configurable ZSTD compression level via `compression: { method: "zstd", level }` (replaces the separate `zstdLevel` option).
- Added `DynamicValue` for inserting `Dynamic`-column values with an explicit ClickHouse type, bypassing runtime type inference.
- Added exported `ClickHouseException` support for structured ClickHouse server errors.
- Added TCP TLS coverage in the test suite.

### Fixed

- Hardened TCP cancellation, abort, timeout, and connection reuse behavior.
- Fixed HTTP query parameter passthrough for unmodeled ClickHouse URL parameters.
- Fixed Native and TCP partial block decoding across fragmented streams.
- Fixed Native codec edge cases around decimals, tuple field parsing, sparse data, JSON, Dynamic, and IPv6 handling.
- Fixed HTTP streaming error handling so server exceptions are surfaced consistently.

### Changed

- Improved fragmented Native stream decoding performance.
- Applied resumable Native block decoding more consistently across compressed and uncompressed TCP reads.
- Split Native codec internals into smaller scalar, composite, dynamic, base, and registry modules.
- Made default TCP fuzz coverage bounded and moved heavier fuzzing to `test:tcp:stress`.
- Clarified collectable async generator behavior: one generator instance is single-consumer and does not replay after it is drained.

### Package

- Cleaned package contents with an explicit publish allowlist.
- Added `clean` before `build` so stale `dist` files cannot ship.
- Restored the main Native, RowBinary, and JSON format benchmark.
- Added `bench:check` to type-check benchmark code.
- Repaired `test:integration` and removed broken benchmark script targets.
