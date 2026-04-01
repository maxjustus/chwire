#!/usr/bin/env tsx
/**
 * Parallel fuzz test runner.
 *
 * Usage:
 *   tsx fuzz/parallel.ts [options]
 *
 * Options:
 *   --level=quick|standard|thorough  Set fuzz level (default: standard)
 *   --unit                           Run unit tests
 *   --http                           Run HTTP integration tests
 *   --tcp                            Run TCP integration tests
 *   --all                            Run all tests (default if none specified)
 *   --compression=false,lz4,zstd     Specific compressions to test
 *   --verbose                        Stream test output in real-time
 *
 * Examples:
 *   tsx fuzz/parallel.ts --level=thorough --all
 *   tsx fuzz/parallel.ts --http --compression=lz4
 *   tsx fuzz/parallel.ts --unit --verbose
 */

import { spawn } from "node:child_process";
import {
  getLevelDefaults,
  parseCompression,
  parseFuzzLevel,
  type Compression,
  type FuzzLevel,
} from "./defaults.ts";

interface Job {
  name: string;
  file: string;
  env: Record<string, string>;
  iterationIndex?: number;
}

interface JobResult {
  job: Job;
  success: boolean;
  duration: number;
  output: string;
}

function parseArgs(): {
  level: FuzzLevel;
  suites: ("unit" | "http" | "tcp")[];
  compressions: Compression[] | null;
  verbose: boolean;
} {
  const args = process.argv.slice(2);
  let level: FuzzLevel = "standard";
  const suites: ("unit" | "http" | "tcp")[] = [];
  let compressions: Compression[] | null = null;
  let verbose = false;

  for (const arg of args) {
    if (arg.startsWith("--level=")) {
      level = parseFuzzLevel(arg.slice(8));
    } else if (arg === "--unit") {
      suites.push("unit");
    } else if (arg === "--http") {
      suites.push("http");
    } else if (arg === "--tcp") {
      suites.push("tcp");
    } else if (arg === "--all") {
      suites.push("unit", "http", "tcp");
    } else if (arg.startsWith("--compression=")) {
      compressions = [];
      for (const value of arg.slice(14).split(",")) {
        const compression = parseCompression(value);
        if (compression === undefined) {
          throw new Error(`Invalid compression: ${value}`);
        }
        compressions.push(compression);
      }
    } else if (arg === "--verbose" || arg === "-v") {
      verbose = true;
    }
  }

  if (suites.length === 0) {
    suites.push("unit", "http", "tcp");
  }

  return { level, suites: [...new Set(suites)], compressions, verbose };
}

function readIntEnv(name: string, fallback: number): number {
  const value = process.env[name];
  if (value === undefined) return fallback;

  const parsed = parseInt(value, 10);
  if (Number.isNaN(parsed)) return fallback;
  return parsed;
}

function buildJobs(
  level: FuzzLevel,
  suites: Array<"unit" | "http" | "tcp">,
  compressions: Compression[] | null,
): Job[] {
  const jobs: Job[] = [];
  const defaults = getLevelDefaults(level);

  for (const suite of suites) {
    if (suite === "unit") {
      const iterations = readIntEnv("FUZZ_ITERATIONS", defaults.unitIterations);
      for (let i = 0; i < iterations; i++) {
        jobs.push({
          name: `unit[${i}]`,
          file: "fuzz/unit.ts",
          env: { FUZZ_LEVEL: level, FUZZ_ITERATION_INDEX: String(i) },
          iterationIndex: i,
        });
      }
    } else {
      let iterations = readIntEnv("FUZZ_ITERATIONS", defaults.tcpIterations);
      let suiteCompressions = defaults.tcpCompressions;

      if (suite === "http") {
        iterations = readIntEnv("FUZZ_ITERATIONS", defaults.integrationIterations);
        suiteCompressions = defaults.httpCompressions;
      }
      if (compressions !== null) {
        suiteCompressions = compressions;
      }

      for (const comp of suiteCompressions) {
        for (let i = 0; i < iterations; i++) {
          let compName = comp;
          if (comp === false) {
            compName = "none";
          }

          jobs.push({
            name: `${suite}:${compName}[${i}]`,
            file: `fuzz/${suite}.ts`,
            env: {
              FUZZ_LEVEL: level,
              FUZZ_COMPRESSION: String(comp),
              FUZZ_ITERATION_INDEX: String(i),
            },
            iterationIndex: i,
          });
        }
      }
    }
  }

  return jobs;
}

async function runJob(job: Job, verbose: boolean): Promise<JobResult> {
  const start = Date.now();
  let output = "";

  return new Promise((resolve) => {
    const proc = spawn("tsx", ["--test", job.file], {
      env: { ...process.env, ...job.env },
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "pipe"],
    });

    proc.stdout?.on("data", (data) => {
      const text = data.toString();
      output += text;
      if (verbose) {
        process.stdout.write(`[${job.name}] ${text}`);
      }
    });
    proc.stderr?.on("data", (data) => {
      const text = data.toString();
      output += text;
      if (verbose) {
        process.stderr.write(`[${job.name}] ${text}`);
      }
    });

    proc.on("close", (code) => {
      resolve({
        job,
        success: code === 0,
        duration: Date.now() - start,
        output,
      });
    });

    proc.on("error", (err) => {
      output += `\nProcess error: ${err.message}`;
      resolve({
        job,
        success: false,
        duration: Date.now() - start,
        output,
      });
    });
  });
}

async function runParallel(
  jobs: Job[],
  maxConcurrency: number,
  verbose: boolean,
): Promise<JobResult[]> {
  const results: JobResult[] = [];
  const pending = [...jobs];
  const running: Promise<void>[] = [];

  console.log(
    `Running ${jobs.length} jobs with concurrency ${maxConcurrency}${verbose ? " (verbose)" : ""}\n`,
  );

  async function startNext(): Promise<void> {
    const job = pending.shift();
    if (!job) return;

    console.log(`[start] ${job.name}`);
    const result = await runJob(job, verbose);
    results.push(result);

    const status = result.success ? "pass" : "FAIL";
    const duration = (result.duration / 1000).toFixed(1);
    console.log(`[${status}] ${job.name} (${duration}s)`);

    if (!result.success && !verbose) {
      // Print failure output (unless already shown via verbose)
      console.log(`\n--- ${job.name} output ---\n${result.output}\n---\n`);
    }

    // Start next job if available
    if (pending.length > 0) {
      running.push(startNext());
    }
  }

  // Start initial batch
  for (let i = 0; i < Math.min(maxConcurrency, jobs.length); i++) {
    running.push(startNext());
  }

  // Wait for all to complete
  while (running.length > 0) {
    await running.shift();
  }

  return results;
}

function getMaxConcurrency(level: FuzzLevel): number {
  return readIntEnv("FUZZ_MAX_CONCURRENT", getLevelDefaults(level).maxConcurrentProcesses);
}

async function main() {
  const { level, suites, compressions, verbose } = parseArgs();
  const jobs = buildJobs(level, suites, compressions);

  console.log(`Fuzz test runner`);
  console.log(`  Level: ${level}`);
  console.log(`  Suites: ${suites.join(", ")}`);
  console.log(`  Total jobs: ${jobs.length}`);
  console.log();

  const maxConcurrency = getMaxConcurrency(level);

  const startTime = Date.now();
  const results = await runParallel(jobs, maxConcurrency, verbose);
  const totalDuration = ((Date.now() - startTime) / 1000).toFixed(1);

  // Summary
  console.log("\n=== Summary ===");
  const passed = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;
  console.log(`Passed: ${passed}/${results.length}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total time: ${totalDuration}s`);

  if (failed > 0) {
    console.log("\nFailed jobs:");
    for (const r of results.filter((r) => !r.success)) {
      console.log(`  - ${r.job.name}`);
    }
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
