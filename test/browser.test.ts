import { test } from "node:test";
import { strict as assert } from "node:assert";
import { createServer, type Server } from "node:http";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import * as esbuild from "esbuild";
import { chromium } from "playwright";

const ROOT = join(import.meta.dirname, "..");

// Browser test code — exercises codec + compression without Node.js Buffer
const BROWSER_TEST_CODE = `
import { init, encodeBlock, decodeBlock } from "../compression.ts";
import {
  batchFromRows,
  batchFromCols,
  encodeNative,
  decodeNativeBlock,
  getCodec,
  RecordBatch,
} from "../native/index.ts";

async function runTests() {
  const results = [];
  function ok(name, passed, detail) {
    results.push({ name, passed, detail: detail || "" });
  }

  try {
    // Verify no Node.js Buffer
    ok("no Buffer global", typeof globalThis.Buffer === "undefined",
      typeof globalThis.Buffer);

    // Init compression (WASM path)
    await init();
    ok("init() WASM compression", true);

    // LZ4 roundtrip
    const testData = new TextEncoder().encode("Hello ClickHouse from the browser! ".repeat(100));
    const lz4 = encodeBlock(testData, "lz4");
    const lz4Dec = decodeBlock(lz4, testData.length, "lz4");
    const lz4Match = lz4Dec.length === testData.length &&
      lz4Dec.every((b, i) => b === testData[i]);
    ok("LZ4 roundtrip", lz4Match, lz4.length + " compressed bytes");

    // ZSTD roundtrip
    const zstd = encodeBlock(testData, "zstd");
    const zstdDec = decodeBlock(zstd, testData.length, "zstd");
    const zstdMatch = zstdDec.length === testData.length &&
      zstdDec.every((b, i) => b === testData[i]);
    ok("ZSTD roundtrip", zstdMatch, zstd.length + " compressed bytes");

    // Native encode/decode roundtrip (simple types)
    const columns = [
      { name: "id", type: "UInt32" },
      { name: "name", type: "String" },
      { name: "score", type: "Float64" },
      { name: "active", type: "Bool" },
    ];
    const rows = [];
    for (let i = 0; i < 100; i++) {
      rows.push([i, "user_" + i, Math.random() * 100, i % 2 === 0]);
    }
    const batch = batchFromRows(columns, rows);
    const encoded = encodeNative(batch);
    const decoded = decodeNativeBlock(encoded, 0);
    ok("Native encode/decode rowCount", decoded.rowCount === 100,
      "got " + decoded.rowCount);
    const idCol = decoded.columnData[0].data;
    ok("Native roundtrip data integrity",
      idCol[0] === 0 && idCol[99] === 99,
      "first=" + idCol[0] + " last=" + idCol[99]);

    // Native with complex types (Nullable, Array)
    const complexCols = [
      { name: "ids", type: "Array(Int32)" },
      { name: "label", type: "Nullable(String)" },
    ];
    const complexRows = [
      [[1, 2, 3], "hello"],
      [[4, 5], null],
      [[], "world"],
    ];
    const complexBatch = batchFromRows(complexCols, complexRows);
    const complexEnc = encodeNative(complexBatch);
    const complexDec = decodeNativeBlock(complexEnc, 0);
    ok("Native complex types rowCount", complexDec.rowCount === 3,
      "got " + complexDec.rowCount);

    // Full pipeline: encode + compress + decompress + decode
    const pipelineEnc = encodeNative(batch);
    const compressed = encodeBlock(pipelineEnc, "lz4");
    const decompressed = decodeBlock(compressed, pipelineEnc.length, "lz4");
    const pipelineDec = decodeNativeBlock(decompressed, 0);
    ok("Full pipeline (encode+LZ4+decode)", pipelineDec.rowCount === 100,
      "rows=" + pipelineDec.rowCount);

    // Columnar API with TypedArrays
    const colBatch = batchFromCols({
      x: getCodec("Float64").fromValues(new Float64Array([1.1, 2.2, 3.3])),
      y: getCodec("Int32").fromValues(new Int32Array([10, 20, 30])),
    });
    const colEnc = encodeNative(colBatch);
    const colDec = decodeNativeBlock(colEnc, 0);
    ok("Columnar TypedArray roundtrip", colDec.rowCount === 3,
      "rows=" + colDec.rowCount);

    // RecordBatch class works (for higher-level usage)
    const rb = RecordBatch.from(decoded);
    ok("RecordBatch.from() works", rb.getColumn("id")!.data[0] === 0);

  } catch (e) {
    ok("unexpected error", false, e.message + "\\n" + e.stack);
  }

  return results;
}

(globalThis as any).__testResults = runTests();
`;

async function buildAndServe(): Promise<{ dir: string; cleanup: () => void }> {
  const dir = mkdtempSync(join(tmpdir(), "chwire-browser-test-"));

  // Write test entrypoint inside project so relative imports resolve
  const entrypoint = join(ROOT, "test", "_browser_entry.ts");
  writeFileSync(entrypoint, BROWSER_TEST_CODE);

  try {
    // Build single self-contained browser bundle
    await esbuild.build({
      entryPoints: [entrypoint],
      bundle: true,
      format: "esm",
      platform: "browser",
      outfile: join(dir, "test.js"),
      target: "es2022",
      external: ["lz4-napi", "zstd-napi"],
      define: { BUILD_WITH_ZSTD: "true" },
    });
  } finally {
    rmSync(entrypoint, { force: true });
  }

  // Copy zstd WASM (loaded via import.meta.url at runtime)
  const wasmSrc = join(ROOT, "node_modules/@bokuweb/zstd-wasm/dist/common/zstd.wasm");
  writeFileSync(join(dir, "zstd.wasm"), readFileSync(wasmSrc));

  // Write HTML
  writeFileSync(
    join(dir, "index.html"),
    `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body><script type="module" src="./test.js"></script></body></html>`,
  );

  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

function startServer(dir: string): Promise<{ server: Server; port: number }> {
  return new Promise((resolve) => {
    const MIME: Record<string, string> = {
      ".html": "text/html",
      ".js": "application/javascript",
      ".wasm": "application/wasm",
    };
    const server = createServer((req, res) => {
      const url = req.url === "/" ? "/index.html" : req.url!;
      const ext = url.slice(url.lastIndexOf("."));
      const filePath = join(dir, url);
      try {
        const data = readFileSync(filePath);
        res.writeHead(200, {
          "Content-Type": MIME[ext] || "application/octet-stream",
          "Cross-Origin-Opener-Policy": "same-origin",
          "Cross-Origin-Embedder-Policy": "require-corp",
        });
        res.end(data);
      } catch {
        res.writeHead(404);
        res.end("not found");
      }
    });
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address() as { port: number };
      resolve({ server, port: addr.port });
    });
  });
}

test("browser: native codec + WASM compression", async () => {
  const { dir, cleanup } = await buildAndServe();
  const { server, port } = await startServer(dir);

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();

    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });

    await page.goto(`http://127.0.0.1:${port}/`);

    const results = await page.evaluate(async () => {
      return await (globalThis as any).__testResults;
    });

    if (errors.length > 0) {
      assert.fail(`Browser errors:\n${errors.join("\n")}`);
    }

    assert.ok(Array.isArray(results), "Expected test results array");
    assert.ok(results.length > 0, "Expected at least one test result");

    let passed = 0;
    for (const r of results as { name: string; passed: boolean; detail: string }[]) {
      if (!r.passed) {
        assert.fail(`FAIL: ${r.name} — ${r.detail}`);
      }
      passed++;
    }
    console.log(`  ${passed} browser assertions passed`);
  } finally {
    await browser.close();
    server.close();
    cleanup();
  }
});
