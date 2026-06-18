import { getCodec, JsonCodec } from "../native/codecs.ts";

const ROWS_PER_BATCH = 10_000;
const BATCHES = 10;

// Generate test data - consistent shape (typical real-world scenario)
function generateBatch(batchIdx: number): Record<string, unknown>[] {
  const values: Record<string, unknown>[] = [];
  const offset = batchIdx * ROWS_PER_BATCH;
  for (let i = 0; i < ROWS_PER_BATCH; i++) {
    values.push({
      name: "user_" + (offset + i),
      score: Math.random() * 100,
      active: i % 2 === 0,
      tags: ["tag_" + (i % 5), "cat_" + (i % 3)],
    });
  }
  return values;
}

console.log("=== Cross-Batch Schema Caching Test ===\n");
console.log(`Batches: ${BATCHES}, Rows per batch: ${ROWS_PER_BATCH}\n`);

// Warmup JIT first
{
  const warmupCodec = new JsonCodec([]);
  const warmupBatch = generateBatch(0);
  for (let i = 0; i < 5; i++) warmupCodec.fromValues(warmupBatch);
}

// Test 1: Consistent schema - SAME codec instance across batches (realistic)
console.log("--- Test 1: Consistent schema, same codec instance ---");
{
  const batches = Array.from({ length: BATCHES }, (_, i) => generateBatch(i));
  const jsonCodec = getCodec("JSON"); // Same instance reused

  const times: number[] = [];
  for (let i = 0; i < BATCHES; i++) {
    const t0 = performance.now();
    jsonCodec.fromValues(batches[i]!);
    times.push(performance.now() - t0);
  }

  console.log("Batch times (ms):", times.map((t) => t.toFixed(1)).join(", "));
  console.log("First batch:", times[0]!.toFixed(1), "ms (full discovery)");
  console.log(
    "Avg batches 2-10:",
    (times.slice(1).reduce((a, b) => a + b, 0) / (BATCHES - 1)).toFixed(1),
    "ms (cached)",
  );
  console.log(
    "Speedup on cached batches:",
    (times[0]! / (times.slice(1).reduce((a, b) => a + b, 0) / (BATCHES - 1))).toFixed(2) + "x",
  );
}

// Test 2: Fresh codec instances each batch (baseline - no caching benefit)
console.log("\n--- Test 2: Consistent schema, fresh codec each batch (baseline) ---");
{
  const batches = Array.from({ length: BATCHES }, (_, i) => generateBatch(i));

  const times: number[] = [];
  for (let i = 0; i < BATCHES; i++) {
    const jsonCodec = new JsonCodec([]); // Fresh instance - no cache
    const t0 = performance.now();
    jsonCodec.fromValues(batches[i]!);
    times.push(performance.now() - t0);
  }

  console.log("Batch times (ms):", times.map((t) => t.toFixed(1)).join(", "));
  console.log("Avg all batches:", (times.reduce((a, b) => a + b, 0) / BATCHES).toFixed(1), "ms");
}

// Test 3: Subset schema - later batches have fewer keys
console.log("\n--- Test 3: Subset schema (batch 1 has all keys, batch 2+ have fewer) ---");
{
  const fullBatch = generateBatch(0); // {name, score, active, tags}
  const subsetBatch = fullBatch.map(({ name, score }) => ({ name, score })); // only 2 keys

  const jsonCodec = new JsonCodec([]);

  const t0 = performance.now();
  jsonCodec.fromValues(fullBatch);
  const fullTime = performance.now() - t0;

  const t1 = performance.now();
  jsonCodec.fromValues(subsetBatch); // Should use cache, not rediscover
  const subsetTime = performance.now() - t1;

  const t2 = performance.now();
  jsonCodec.fromValues(subsetBatch); // Should still use cache
  const subsetTime2 = performance.now() - t2;

  console.log("Full schema batch:", fullTime.toFixed(1), "ms (discovery)");
  console.log("Subset batch 1:", subsetTime.toFixed(1), "ms (should use cache)");
  console.log("Subset batch 2:", subsetTime2.toFixed(1), "ms (should use cache)");
}

// Test 4: Compare fresh vs cached codec on SAME data
console.log("\n--- Test 4: Fresh codec vs reused codec comparison ---");
{
  const batch = generateBatch(99); // Different batch to avoid any caching effects

  // Multiple runs with fresh codec each time
  const freshTimes: number[] = [];
  for (let i = 0; i < 5; i++) {
    const freshCodec = new JsonCodec([]);
    const t0 = performance.now();
    freshCodec.fromValues(batch);
    freshTimes.push(performance.now() - t0);
  }

  // Multiple runs with reused codec
  const reusedCodec = new JsonCodec([]);
  const reusedTimes: number[] = [];
  for (let i = 0; i < 5; i++) {
    const t0 = performance.now();
    reusedCodec.fromValues(batch);
    reusedTimes.push(performance.now() - t0);
  }

  const avgFresh = freshTimes.reduce((a, b) => a + b, 0) / freshTimes.length;
  const avgReused = reusedTimes.slice(1).reduce((a, b) => a + b, 0) / (reusedTimes.length - 1); // Skip first

  console.log("Fresh codec (5 runs):", freshTimes.map((t) => t.toFixed(1)).join(", "), "ms");
  console.log("Reused codec (5 runs):", reusedTimes.map((t) => t.toFixed(1)).join(", "), "ms");
  console.log("Avg fresh:", avgFresh.toFixed(1), "ms");
  console.log("Avg reused (skip first):", avgReused.toFixed(1), "ms");
  console.log(
    "Savings:",
    (avgFresh - avgReused).toFixed(1),
    "ms (" + ((1 - avgReused / avgFresh) * 100).toFixed(0) + "%)",
  );
}

// Baseline: Object.keys scan vs first-row check cost
console.log("\n--- Baseline: Object.keys scan vs first-row check ---");
{
  const batch = generateBatch(0);
  const cachedPaths = ["name", "score", "active", "tags"];

  // Full Object.keys scan
  let t0 = performance.now();
  for (let iter = 0; iter < 1000; iter++) {
    const dynamicPaths = new Set<string>();
    for (const v of batch) {
      if (v && typeof v === "object" && !Array.isArray(v)) {
        for (const key of Object.keys(v)) {
          dynamicPaths.add(key);
        }
      }
    }
  }
  console.log("Full Object.keys scan (1000x):", (performance.now() - t0).toFixed(1), "ms");

  // First-row check only (current)
  t0 = performance.now();
  for (let iter = 0; iter < 1000; iter++) {
    const row = batch[0]!;
    if (row && typeof row === "object" && !Array.isArray(row)) {
      cachedPaths.every((p) => p in (row as Record<string, unknown>));
    }
  }
  console.log("First-row check - current (1000x):", (performance.now() - t0).toFixed(1), "ms");

  // First-row check with length validation (improved)
  const typedPathNames = new Set<string>();
  t0 = performance.now();
  for (let iter = 0; iter < 1000; iter++) {
    const row = batch[0] as Record<string, unknown>;
    if (row && typeof row === "object" && !Array.isArray(row)) {
      const rowKeyCount = Object.keys(row).filter((k) => !typedPathNames.has(k)).length;
      rowKeyCount === cachedPaths.length && cachedPaths.every((p) => p in row);
    }
  }
  console.log("First-row check - with length (1000x):", (performance.now() - t0).toFixed(1), "ms");

  // All-row length check (would catch varying schemas)
  t0 = performance.now();
  for (let iter = 0; iter < 1000; iter++) {
    for (const row of batch) {
      Object.keys(row).length;
    }
  }
  console.log("All-row key count only (1000x):", (performance.now() - t0).toFixed(1), "ms");

  // Sort cost breakdown
  const pathSet = new Set(["name", "score", "active", "tags"]);
  t0 = performance.now();
  for (let iter = 0; iter < 100000; iter++) {
    [...pathSet].sort();
  }
  console.log("Spread + sort 4 strings (100Kx):", (performance.now() - t0).toFixed(1), "ms");

  // Larger path set (20 paths)
  const largePaths = new Set(
    Array.from({ length: 20 }, (_, i) => `path_${String(i).padStart(2, "0")}`),
  );
  t0 = performance.now();
  for (let iter = 0; iter < 100000; iter++) {
    [...largePaths].sort();
  }
  console.log("Spread + sort 20 strings (100Kx):", (performance.now() - t0).toFixed(1), "ms");
}
