/**
 * Shared configuration for fuzz tests.
 *
 * FUZZ_LEVEL controls test thoroughness:
 *   quick    - minimal iterations, no compression variants (CI/fast feedback)
 *   standard - normal iterations, one compression variant per transport
 *   thorough - more iterations, all compression variants
 *
 * Individual overrides:
 *   FUZZ_ITERATIONS - override iteration count for all test types
 *   FUZZ_ROWS - override row count for integration tests
 *   FUZZ_COMPRESSION - single compression to test (for CI matrix jobs)
 */

import {
  getLevelDefaults,
  parseCompression,
  parseFuzzLevel,
  type Compression,
} from "./defaults.ts";

export type { Compression, FuzzLevel } from "./defaults.ts";

function readIntEnv(name: string, fallback: number): number {
  const value = process.env[name];
  if (value === undefined) return fallback;

  const parsed = parseInt(value, 10);
  if (Number.isNaN(parsed)) return fallback;
  return parsed;
}

export const FUZZ_LEVEL = parseFuzzLevel(process.env.FUZZ_LEVEL);

const defaults = getLevelDefaults(FUZZ_LEVEL);
const compressionOverride = parseCompression(process.env.FUZZ_COMPRESSION);

let httpCompressions = defaults.httpCompressions;
let tcpCompressions = defaults.tcpCompressions;
if (compressionOverride !== undefined) {
  httpCompressions = [compressionOverride];
  tcpCompressions = [compressionOverride];
}

export const config = {
  unitIterations: readIntEnv("FUZZ_ITERATIONS", defaults.unitIterations),
  integrationIterations: readIntEnv("FUZZ_ITERATIONS", defaults.integrationIterations),
  tcpIterations: readIntEnv("FUZZ_ITERATIONS", defaults.tcpIterations),
  rows: readIntEnv("FUZZ_ROWS", defaults.rows),
  maxConcurrentProcesses: readIntEnv("FUZZ_MAX_CONCURRENT", defaults.maxConcurrentProcesses),
  httpCompressions,
  tcpCompressions,
};

/**
 * Get the iteration index for this process.
 * Returns null if not running as a single iteration (process-based model).
 */
export function getIterationIndex(): number | null {
  const envVal = process.env.FUZZ_ITERATION_INDEX;
  if (!envVal) return null;

  const parsed = parseInt(envVal, 10);
  if (Number.isNaN(parsed) || parsed < 0) {
    throw new Error(`Invalid FUZZ_ITERATION_INDEX: ${envVal}`);
  }
  return parsed;
}

export interface FuzzErrorContext {
  testType: "tcp" | "http";
  iteration: number;
  totalIterations: number;
  compression: Compression;
  rows: number;
  structure?: string;
  jsonType?: string;
  srcTable?: string;
  dstTable?: string;
}

export function logFuzzError(ctx: FuzzErrorContext, err: unknown): void {
  let compression = String(ctx.compression);
  if (ctx.compression === false) {
    compression = "none";
  }

  const lines = [
    ``,
    `${"=".repeat(60)}`,
    `FUZZ TEST FAILURE`,
    `${"=".repeat(60)}`,
    `Test:        ${ctx.testType} fuzz`,
    `Iteration:   ${ctx.iteration + 1}/${ctx.totalIterations}`,
    `Compression: ${compression}`,
    `Rows:        ${ctx.rows.toLocaleString()}`,
  ];

  if (ctx.structure) {
    lines.push(`Structure:   ${ctx.structure}`);
  }
  if (ctx.jsonType) {
    lines.push(`JSON Type:   ${ctx.jsonType}`);
  }
  if (ctx.srcTable) {
    lines.push(`Src Table:   ${ctx.srcTable}`);
  }
  if (ctx.dstTable) {
    lines.push(`Dst Table:   ${ctx.dstTable}`);
  }

  lines.push(`${"─".repeat(60)}`);

  if (err instanceof Error) {
    lines.push(`Error:       ${err.message}`);
    if (err.stack) {
      lines.push(`Stack:`);
      lines.push(err.stack.split("\n").slice(1).join("\n"));
    }
  } else {
    lines.push(`Error:       ${String(err)}`);
  }

  lines.push(`${"=".repeat(60)}`);
  console.error(lines.join("\n"));
}

export function logConfig(testType: "unit" | "http" | "tcp"): void {
  let iterations = config.unitIterations;
  let compressions: Array<Compression | "n/a"> = ["n/a"];

  if (testType === "http") {
    iterations = config.integrationIterations;
    compressions = config.httpCompressions;
  } else if (testType === "tcp") {
    iterations = config.tcpIterations;
    compressions = config.tcpCompressions;
  }

  let mode = `iterations=${iterations}`;
  const iterIdx = getIterationIndex();
  if (iterIdx !== null) {
    mode = `iteration=${iterIdx + 1}/${iterations}`;
  }

  console.log(
    `[fuzz ${testType}] level=${FUZZ_LEVEL}, ${mode}, compressions=${JSON.stringify(compressions)}, rows=${config.rows}`,
  );
}
