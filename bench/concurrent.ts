import { randomUUID } from "node:crypto";
import { query as httpQuery } from "../client.ts";
import type { Compression } from "../compression.ts";
import { TcpClient } from "../tcp_client/client.ts";
import { benchAsync, formatStats, readBenchOptions, reportEnvironment } from "./harness.ts";

function readPositiveIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined) return fallback;

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid ${name}: ${raw}`);
  }
  return parsed;
}

function parseCompression(envName: string, input: string | undefined): Compression {
  if (!input) return "lz4";
  const normalized = input.toLowerCase();
  if (normalized === "none" || normalized === "false" || normalized === "0") return false;
  if (normalized === "lz4" || normalized === "zstd") return normalized;
  throw new Error(`Invalid ${envName}: ${input}`);
}

function readConfig() {
  return {
    concurrency: readPositiveIntEnv("BENCH_CONCURRENCY", 16),
    sql: process.env.BENCH_QUERY ?? "SELECT 1",
    httpBaseUrl: process.env.BENCH_HTTP_URL ?? "http://localhost:8123/",
    httpCompression: parseCompression("BENCH_HTTP_COMPRESSION", process.env.BENCH_HTTP_COMPRESSION),
    tcpHost: process.env.BENCH_TCP_HOST ?? "localhost",
    tcpPort: readPositiveIntEnv("BENCH_TCP_PORT", 9000),
    tcpCompression: parseCompression("BENCH_TCP_COMPRESSION", process.env.BENCH_TCP_COMPRESSION),
  };
}

async function drainHttpQuery(
  sql: string,
  baseUrl: string,
  compression: Compression,
): Promise<void> {
  const sessionId = randomUUID();
  for await (const _ of httpQuery(sql, sessionId, { baseUrl, compression })) {
    // Drain response
  }
}

async function runTcpOnce(
  sql: string,
  host: string,
  port: number,
  compression: Compression,
): Promise<void> {
  const client = new TcpClient({ host, port, compression });
  try {
    await client.connect();
    await client.query(sql);
  } finally {
    client.close();
  }
}

async function runConcurrent(concurrency: number, fn: () => Promise<void>): Promise<void> {
  const tasks = new Array(concurrency);
  for (let i = 0; i < concurrency; i++) {
    tasks[i] = fn();
  }
  await Promise.all(tasks);
}

function printThroughput(label: string, concurrency: number, meanMs: number): void {
  const queriesPerSecond = (concurrency * 1000) / meanMs;
  console.log(`${label.padEnd(30)} ${queriesPerSecond.toFixed(2).padStart(8)} qps`);
}

async function benchTransport(
  label: string,
  concurrency: number,
  fn: () => Promise<void>,
  options: ReturnType<typeof readBenchOptions>,
): Promise<void> {
  const stats = await benchAsync(label, () => runConcurrent(concurrency, fn), options);
  console.log(formatStats(stats));
  printThroughput(label, concurrency, stats.meanMs);
}

async function main(): Promise<void> {
  const options = readBenchOptions({ warmup: 5, iterations: 20, batchSize: 1 });
  const config = readConfig();

  reportEnvironment();
  console.log(`Mode: concurrent connect + query benchmark`);
  console.log(`Query: ${config.sql}`);
  console.log(`HTTP: ${config.httpBaseUrl} (compression=${config.httpCompression})`);
  console.log(
    `TCP:  ${config.tcpHost}:${config.tcpPort} (compression=${String(config.tcpCompression)})`,
  );
  console.log(`Concurrency: ${config.concurrency}`);
  console.log("");

  await benchTransport(
    "http connect+query",
    config.concurrency,
    () => drainHttpQuery(config.sql, config.httpBaseUrl, config.httpCompression),
    options,
  );
  console.log("");

  await benchTransport(
    "tcp connect+query",
    config.concurrency,
    () => runTcpOnce(config.sql, config.tcpHost, config.tcpPort, config.tcpCompression),
    options,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
