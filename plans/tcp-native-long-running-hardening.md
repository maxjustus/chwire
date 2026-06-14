# TCP client and Native long-running hardening plan

## Goals

- Keep packet buffers owned and immutable once passed to the socket.
- Bound retained heap for long-running inserts/selects and many concurrent clients.
- Preserve connection reuse semantics where the protocol can be drained safely.
- Harden compression, connection startup, and codec cache behavior.

## Implementation checklist

- [x] Fix packet buffer ownership and writer high-water retention.
  - [x] Add an owned-byte finish helper to `BufferWriter`.
  - [x] Make `StreamingWriter.flush()` return owned bytes.
  - [x] Avoid routing uncompressed Data payloads through the reusable `StreamingWriter` buffer.
  - [x] Use backpressure-aware writes for query packets and Data delimiters.
- [x] Reduce SELECT-side memory retention.
  - [x] Use a smaller TCP Native decode buffer default.
  - [x] Use a smaller `streamDecodeNative()` default buffer so tiny decoded numeric blocks do not pin 2MiB backing stores.
- [x] Make abandoned-query drain cheaper where possible.
  - [x] Add a compressed-block discard method for TCP drains.
  - [x] Use discard for compressed Data/Totals/Extremes packets during drain.
  - [x] Keep uncompressed drains reusable by decoding as before, since raw Native blocks are not length-framed.
- [x] Harden lifecycle/concurrency edges.
  - [x] Prevent `connect()` from replacing an active socket.
  - [x] Serialize compression initialization with an in-flight promise.
- [x] Harden compression and codec cache behavior.
  - [x] Cap decompressed block size.
  - [x] Verify decompressed size matches the frame header.
  - [x] Do not cache stateful `Dynamic(...)` codecs.
- [x] Add regression coverage.
  - [x] Cover writer copy/alias safety.
  - [x] Cover stream decode default-buffer retention behavior.
  - [x] Cover compression init concurrency.
  - [x] Cover double-connect guard.
  - [x] Cover compressed drain discard.
- [x] Add fuzz memory observability.
  - [x] Sample child-process peak RSS in `fuzz/parallel.ts`.
  - [x] Print peak RSS per job and top peak-RSS jobs in the final summary.
  - [x] Support `FUZZ_MEMORY_POLL_MS=0` to disable sampling and `FUZZ_MEMORY_WARN_MB=N` to flag high-memory jobs.
- [x] Simplification critique pass.
  - [x] Removed the duplicate test-local `writeU32LE` helper and imported the existing `writeUInt32LE` from `compression.ts`.
  - [x] Removed an unused `BufferWriter.capacity` getter introduced during hardening.
  - [x] Simplified the compressed-frame helper to return only the frame size.
  - [x] Removed the typed-array copy heuristic after benchmarks showed decode noise/regression risk; the smaller decode buffer addresses retention without adding hot-path copying.
  - [x] Re-audited helper usage; kept the remaining small helpers because they each preserve a clear ownership, retention, or framing invariant.

## Validation checklist

- [x] `tsc --noEmit`
- [x] `npm run test:tcp`
- [x] `npm run test:native`
- [x] `npm test`
- [x] `npm run test:fuzz` — 250/250 passed; peak child RSS max was 55.4MiB in the memory-tracked run.
- [x] `npm run test:matrix` — 2/2 ClickHouse versions passed.

## Benchmark checks

- [x] Current vs base `npm run bench` with `BENCH_ITERATIONS=7 BENCH_WARMUP=3`.
  - TCP/Native-sensitive benchmark paths were within expected local-run noise; this pass prompted removal of the typed-array copy heuristic to avoid decode hot-path overhead.
- [x] Current vs base `npm run bench:compression` with `BENCH_ITERATIONS=3 BENCH_WARMUP=1`.
  - `decodeBlock()` size validation did not show a material decompression regression.
- [x] Current vs base `bench/tcp-read-profile.ts --runs 5` with 500k rows and LZ4.
  - Current median: 222.6 MB/s, base median: 230.5 MB/s (~3.4% lower, within run-to-run noise); readStop stayed at x0.
