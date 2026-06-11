// Test importing from the bundled dist directly
// This simulates what happens when someone npm installs the package

console.log("=== Testing full build (dist/chwire.js) ===\n");

const full = await import("../dist/chwire.js");

try {
  console.log("Calling init()...");
  await full.init();
  console.log("init() succeeded!\n");

  // Test compression by encoding some data
  console.log("Testing compression via encodeBlock...");
  const testData = new TextEncoder().encode("Hello, World! This is a test string for compression.");

  // LZ4 compression
  const lz4Compressed = full.encodeBlock(testData, "lz4");
  console.log(`LZ4: ${testData.length} bytes -> ${lz4Compressed.length} bytes`);

  // ZSTD compression
  const zstdCompressed = full.encodeBlock(testData, "zstd");
  console.log(`ZSTD: ${testData.length} bytes -> ${zstdCompressed.length} bytes`);

  console.log("\nFull build PASSED!\n");
} catch (err) {
  console.error("ERROR:", err.message);
  console.error("Stack:", err.stack);
  process.exit(1);
}

console.log("=== Testing LZ4-only build (dist/chwire-lz4.js) ===\n");

const lz4Only = await import("../dist/chwire-lz4.js");

try {
  console.log("Calling init()...");
  await lz4Only.init();
  console.log("init() succeeded!\n");

  console.log("Testing LZ4 compression...");
  const testData = new TextEncoder().encode("Hello, World! This is a test string for compression.");
  const compressed = lz4Only.encodeBlock(testData, "lz4");
  console.log(`LZ4: ${testData.length} bytes -> ${compressed.length} bytes`);

  console.log("\nLZ4-only build PASSED!\n");
} catch (err) {
  console.error("ERROR:", err.message);
  console.error("Stack:", err.stack);
  process.exit(1);
}

console.log("=== Testing RecordBatch dual-package hazard ===\n");

// Resolve via the package's published subpaths (self-reference), exactly as a
// consumer would, so this exercises the build's native-externalization and the
// real ESM/CJS export conditions — not a direct dist/ file import.
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

try {
  const esmNative = await import("@maxjustus/chwire/native");
  const esmMain = await import("@maxjustus/chwire");
  const cjsNative = require("@maxjustus/chwire/native");

  const batch = esmNative.batchFromCols({
    id: esmNative.getCodec("Int64").fromValues([10n, 20n]),
    value: esmNative.getCodec("String").fromValues(["val_1", "val_2"]),
  });

  // 1. Cross-subpath (all ESM): /native and the main bundle externalize the
  //    codec layer, so they share one RecordBatch class. instanceof must hold —
  //    this is what the tcp client's insert dispatch relies on.
  if (esmNative.RecordBatch !== esmMain.RecordBatch) {
    throw new Error("ESM /native and main bundle have different RecordBatch classes");
  }
  if (!(batch instanceof esmMain.RecordBatch)) {
    throw new Error("native batch not instanceof main-bundle RecordBatch (subpath split)");
  }

  // 2. Cross-format (ESM vs CJS): the two formats are necessarily separate class
  //    objects, so instanceof CANNOT bridge them. The Symbol.for brand can, which
  //    is why insert dispatch uses RecordBatch.isRecordBatch, not instanceof.
  if (batch instanceof cjsNative.RecordBatch) {
    throw new Error("ESM/CJS RecordBatch unexpectedly shared identity — test assumption stale");
  }
  if (!cjsNative.RecordBatch.isRecordBatch(batch)) {
    throw new Error("isRecordBatch failed to recognize ESM batch from the CJS copy");
  }
  if (!esmNative.RecordBatch.isRecordBatch(batch)) {
    throw new Error("isRecordBatch failed on the same-copy batch");
  }

  // 3. Round-trip sanity.
  const decoded = esmNative.decodeNativeBlock(esmNative.encodeNative(batch), 0);
  if (decoded.rowCount !== 2) {
    throw new Error(`Decoded rowCount should be 2, got ${decoded.rowCount}`);
  }

  console.log("cross-subpath instanceof (ESM): PASSED");
  console.log("cross-format isRecordBatch brand (ESM batch <-> CJS class): PASSED");
  console.log("round-trip encode/decode: PASSED");
  console.log("\nRecordBatch dual-package hazard test PASSED!\n");
} catch (err) {
  console.error("ERROR:", err.message);
  console.error("Stack:", err.stack);
  process.exit(1);
}

console.log("=== All bundle tests PASSED! ===");
