# Stateless Dynamic/JSON codecs — IMPLEMENTED

Landed on `json-from-cols` (commits `d710a1a`..`f5c022e`).

- `DynamicCodec`/`JsonCodec` hold no per-block state; wire metadata read by
  `readPrefix` lives in `DeserializerState.prefix` (a `PrefixNode` tree keyed
  like serialization children, grown lazily by `childState`).
- `Codec.readPrefix` signature is now `(reader, state)`.
- `readKinds` for Dynamic/JSON reads self (+ typed paths for JSON) only —
  dynamic children depend on prefix content and are not in the static kinds
  tree.
- The `getCodec` cache is universal; the `includes("Dynamic")/includes("JSON")`
  bypass is gone. JSON dynamic paths share one `Dynamic` codec instance.
- Pinned by `test/native/stateless_codecs.test.ts` (sequential reuse,
  intra-block sibling sharing, readKinds byte-count independence) and
  `test/native/codec_cache.test.ts` (cache identity for composites).
- Bench (M4 Max, 1M rows): Dynamic encode 77.4→75.2ms, decode 24.5→23.8ms;
  JSON encode 445.2→422.8ms, decode 139.9→138.3ms.
