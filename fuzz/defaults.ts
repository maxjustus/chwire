import { cpus } from "node:os";

export type FuzzLevel = "quick" | "standard" | "thorough";
export type Compression = false | "lz4" | "zstd";

const CPU_COUNT = cpus().length;
const INTEGRATION_MAX_CONCURRENT = Math.max(4, Math.min(8, Math.floor(CPU_COUNT / 2)));

const LEVEL_DEFAULTS = {
  quick: {
    unitIterations: 10,
    integrationIterations: 3,
    tcpIterations: 3,
    rows: 1000,
    maxConcurrentProcesses: Math.max(2, Math.floor(CPU_COUNT / 2)),
    httpCompressions: [false] as Compression[],
    tcpCompressions: [false] as Compression[],
  },
  standard: {
    unitIterations: 50,
    integrationIterations: 25,
    tcpIterations: 25,
    rows: 20000,
    maxConcurrentProcesses: INTEGRATION_MAX_CONCURRENT,
    httpCompressions: [false, "lz4"] as Compression[],
    tcpCompressions: [false, "lz4"] as Compression[],
  },
  thorough: {
    unitIterations: 100,
    integrationIterations: 50,
    tcpIterations: 50,
    rows: 50000,
    maxConcurrentProcesses: INTEGRATION_MAX_CONCURRENT,
    httpCompressions: [false, "lz4", "zstd"] as Compression[],
    tcpCompressions: [false, "lz4", "zstd"] as Compression[],
  },
};

export function parseFuzzLevel(value: string | undefined): FuzzLevel {
  if (value === "quick") return value;
  if (value === "thorough") return value;
  return "standard";
}

export function parseCompression(value: string | undefined): Compression | undefined {
  if (value === undefined) return undefined;
  if (value === "false" || value === "none") return false;
  if (value === "lz4" || value === "zstd") return value;
  return undefined;
}

export function getLevelDefaults(level: FuzzLevel) {
  return LEVEL_DEFAULTS[level];
}
