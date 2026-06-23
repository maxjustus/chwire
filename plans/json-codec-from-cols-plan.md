# Plan: Columnar JSON `fromCols` API

## Goal

Add a columnar construction API for ClickHouse `JSON` columns so callers with already-columnar data can skip row-object shredding in `JsonCodec.fromValues()`.

```ts
const payload = getCodec("JSON(id UInt32)").fromCols({
  id: new Uint32Array([1, 2, 3]),
  meta: ["x", new DynamicValue("UInt64", 42n), null],
});

const batch = batchFromCols({ payload });
```

---

## Task list

### 1. Thread the declared JSON type through (separate commit)

Independently useful — fixes `batchFromCols` schema inference for columns from existing `fromValues`.

Files: `native/columns.ts`, `native/codecs/dynamic.ts`, `native/codecs/registry.ts`, `native/codecs.ts`

- [x] `JsonColumn`: change `type` from property initializer to constructor arg with default `"JSON"`.
- [x] `JsonCodec`: add optional `type = "JSON"` constructor param; store as `this.type`; pass it to **both** `new JsonColumn(...)` sites — `fromValues` and `decode`.
- [x] `registry.ts`: pass original type string into `JsonCodec` constructor.
- [x] `codecs.ts`: update public wrapper to forward the type param.

### 2. Add `JsonCodec.fromCols(...)` + `getCodec` overload

File: `native/codecs/dynamic.ts`, `native/codecs/registry.ts`

Local helpers:
- `isColumn(value): value is Column` — duck-type: checks `.get` (function), `.type` (string), `.length` (number). Strengthened from plan's original `.get`-only check to avoid false positives on `Map`.
- `isTypedArray(value): value is TypedArray` — added to `coercion.ts` next to `isArrayLike`, used by `isArrayLike` internally.

`fromCols(input: Record<string, Column | unknown[] | TypedArray>): JsonColumn`:
- [x] Row count: derive from any input's `.length`. Empty input = length `0`. Validate all inputs match.
- [x] Typed paths: require presence in `input`. If `Column`, validate `column.type === typedPath.type`. Otherwise call `typedPath.codec.fromValues(input)`.
- [x] Dynamic paths: `unknown[]` → `DynamicCodec.fromValues(input)`. `TypedArray` → throw with guidance. `Column` → throw with guidance.
- [x] Wire order: typed paths first (`this.typedPaths` order), dynamic paths second (sorted with `byteOrder`).
- [x] Return `new JsonColumn(paths, pathColumns, rowCount, this.type)`.
- [x] Added `getCodec` overload in `registry.ts` for `"JSON" | \`JSON(${string})\`` → `JsonCodec` return type. Re-exports through `codecs.ts` → `native/index.ts` → `index.ts` preserve the overload.

### 3. Tests

- [x] `fromCols` with typed path (raw values, TypedArray, prebuilt Column).
- [x] `batchFromCols` infers schema type from the returned column.
- [x] Missing typed path throws. Path length mismatch throws. Type mismatch throws.
- [x] Dynamic path from heterogeneous `unknown[]` (with `DynamicValue`).
- [x] Bare `TypedArray` on dynamic path throws with guidance.
- [x] Column on dynamic path throws with guidance.
- [x] Wire order of dynamic paths: `tp_10` sorts before `tp_2` (byte order).
- [x] Native encode/decode round trip with mixed typed + dynamic paths.
- [x] Empty input produces zero-length column.
- [x] Nullable typed path accepts null values.

### 4. Docs + Changelog

- [x] `CHANGELOG.md`:
  - Fixed: `JsonColumn.type` preserves declared type for `batchFromCols` inference.
  - Added: `JsonCodec.fromCols()` for path-by-path columnar JSON construction.

### 5. Validation (after each commit)

- [x] `tsc --noEmit`
- [x] `npm test`
- [x] `npm run build`

## Implementation notes

### `fromCols` must not call `fromValues`

That would reintroduce row shredding — the whole point is to build `pathColumns` directly.

### Deviations from original plan

- `isColumn` duck-type strengthened: checks `.get` + `.type` + `.length` (not just `.get`), avoiding false positives on `Map`.
- `NullableCodec.fromValues` signature widening was unnecessary — the `Codec` interface already accepts `unknown[] | TypedArray`, and the call goes through the interface.
- README example deferred — the API is self-documenting via the `getCodec` overload and test examples.
