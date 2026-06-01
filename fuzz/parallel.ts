#!/usr/bin/env tsx
/**
 * Parallel fuzz test runner.
 *
 * Usage:
 *   tsx fuzz/parallel.ts [options]
 *
 * Options:
 *   --unit       Run unit tests
 *   --http       Run HTTP integration tests
 *   --tcp        Run TCP integration tests
 *   --generated  Run client-generated CH-anchored tests
 *   --all        Run all tests (default if none specified)
 *   --verbose    Stream test output in real-time
 *
 * Environment:
 *   FUZZ_ITERATIONS - number of iterations (default: 25)
 *   FUZZ_ROWS - row count for integration tests (default: 10000)
 *
 * Examples:
 *   tsx fuzz/parallel.ts --all
 *   FUZZ_ITERATIONS=5 tsx fuzz/parallel.ts --http
 *   tsx fuzz/parallel.ts --tcp --verbose
 */

import { spawn } from "node:child_process";
import { startClickHouse, stopClickHouse } from "../test/setup.ts";
import { config } from "./config.ts";

interface Job {
  name: string;
  file: string;
  env: Record<string, string>;
}

interface JobResult {
  job: Job;
  success: boolean;
  duration: number;
  output: string;
}

type Suite = "unit" | "http" | "tcp" | "generated";

function parseArgs(): {
  suites: Suite[];
  verbose: boolean;
} {
  const args = process.argv.slice(2);
  const suites: Suite[] = [];
  let verbose = false;

  for (const arg of args) {
    if (arg === "--unit") {
      suites.push("unit");
    } else if (arg === "--http") {
      suites.push("http");
    } else if (arg === "--tcp") {
      suites.push("tcp");
    } else if (arg === "--generated") {
      suites.push("generated");
    } else if (arg === "--all") {
      suites.push("unit", "http", "tcp", "generated");
    } else if (arg === "--verbose" || arg === "-v") {
      verbose = true;
    }
  }

  if (suites.length === 0) {
    suites.push("unit", "http", "tcp", "generated");
  }

  return { suites: [...new Set(suites)], verbose };
}

function buildJobs(suites: Suite[]): Job[] {
  const jobs: Job[] = [];

  for (const suite of suites) {
    if (suite === "unit") {
      for (let i = 0; i < config.iterations; i++) {
        jobs.push({
          name: `unit[${i}]`,
          file: "fuzz/unit.ts",
          env: { FUZZ_ITERATION_INDEX: String(i) },
        });
      }
    } else {
      for (const comp of config.compressions) {
        for (let i = 0; i < config.iterations; i++) {
          const compName = comp === false ? "none" : comp;
          jobs.push({
            name: `${suite}:${compName}[${i}]`,
            file: `fuzz/${suite}.ts`,
            env: {
              FUZZ_COMPRESSION: String(comp),
              FUZZ_ITERATION_INDEX: String(i),
            },
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
      console.log(`\n--- ${job.name} output ---\n${result.output}\n---\n`);
    }

    if (pending.length > 0) {
      running.push(startNext());
    }
  }

  for (let i = 0; i < Math.min(maxConcurrency, jobs.length); i++) {
    running.push(startNext());
  }

  while (running.length > 0) {
    await running.shift();
  }

  return results;
}

async function main() {
  const { suites, verbose } = parseArgs();
  const jobs = buildJobs(suites);

  console.log(`Fuzz test runner`);
  console.log(`  Suites: ${suites.join(", ")}`);
  console.log(`  Iterations: ${config.iterations}`);
  console.log(`  Total jobs: ${jobs.length}`);
  console.log();

  // Start one ClickHouse server shared by every worker process (each connects
  // via FUZZ_CH_URL instead of starting its own container). "unit" needs none.
  const needsClickHouse = suites.some((s) => s !== "unit") && !process.env.FUZZ_CH_URL;
  if (needsClickHouse) {
    const ch = await startClickHouse();
    process.env.FUZZ_CH_URL = ch.url;
    process.env.FUZZ_CH_TCP_PORT = String(ch.tcpPort);
  }

  try {
    const startTime = Date.now();
    const results = await runParallel(jobs, config.maxConcurrentProcesses, verbose);
    const totalDuration = ((Date.now() - startTime) / 1000).toFixed(1);

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
      process.exitCode = 1;
    }
  } finally {
    if (needsClickHouse) await stopClickHouse();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
