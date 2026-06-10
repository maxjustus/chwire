/**
 * Shared integration fuzz body for the Native format.
 *
 * The HTTP and TCP suites run the identical test: ask ClickHouse to generate
 * random data, read it back through the Native codec, re-insert it, and assert
 * the round-trip is lossless via cityHash64. Only the transport differs — how a
 * statement is run, how a scalar is read, and whether the round-trip streams
 * blocks (HTTP) or collects RecordBatches (TCP). Those three operations are the
 * `FuzzTransport` seam; everything else lives here once.
 *
 *   generateRandomStructure -> CREATE … generateRandom -> read Native -> re-INSERT
 *   -> cityHash64(src) EXCEPT cityHash64(dst) == 0 (both directions)
 */

import { describe, it } from "node:test";
import type { ColumnDef } from "../native/index.ts";
import { type Compression, config, getIterationIndex, logConfig, logFuzzError } from "./config.ts";
import { randomInt, sqlQuote, uniqueSuffix, unTsvEscape } from "./util.ts";

/**
 * If FUZZ_STRUCTURE is set, returns that structure string for replay.
 * Useful for re-running a specific failing structure without modifying test code.
 */
function replayStructure(): string | null {
  const s = process.env.FUZZ_STRUCTURE?.trim();
  return s && s.length > 0 ? s : null;
}

/**
 * The three transport-specific operations an integration fuzz iteration needs.
 * Sessions/connections, how settings and compression are applied, and streaming
 * vs batched insert all live behind this seam.
 */
export interface FuzzTransport {
  /** First cell of the first non-empty row as text; "" if no rows. */
  scalar(sql: string): Promise<string>;
  /** Run a statement (DDL / INSERT … SELECT) and discard its output. */
  exec(sql: string): Promise<void>;
  /**
   * Read `selectSql` in the Native format with flattened dynamic/json
   * serialization, re-encode it, and INSERT into `dstTable`. Returns the columns
   * observed so a mismatch can be narrowed to the first differing column.
   */
  roundtrip(selectSql: string, dstTable: string): Promise<ColumnDef[]>;
}

/** A per-iteration transport plus its teardown (e.g. closing a TCP client). */
export interface TransportHandle {
  transport: FuzzTransport;
  close(): Promise<void>;
}

export interface IntegrationConfig {
  testType: "http" | "tcp";
  /** Start (or attach to) the shared ClickHouse server for a test. */
  startServer(): Promise<void>;
  /** Stop / release the server. */
  stopServer(): Promise<void>;
  /** Build a transport for one iteration at the given compression. */
  openTransport(iter: number, compression: Compression): Promise<TransportHandle>;
}

interface IterationContext {
  testType: "http" | "tcp";
  iter: number;
  totalIterations: number;
  compression: Compression;
  rowCount: number;
}

type IterationBody = (transport: FuzzTransport, ctx: IterationContext) => Promise<void>;

/** DROP both throwaway tables, ignoring cleanup failures so they never mask a test error. */
async function dropTables(transport: FuzzTransport, ...tables: string[]): Promise<void> {
  for (const table of tables) {
    try {
      await transport.exec(`DROP TABLE IF EXISTS ${table} SYNC`);
    } catch {
      /* ignore cleanup errors */
    }
  }
}

/** Round-trip ClickHouse-generated random data and verify with cityHash64. */
async function randomDataIteration(transport: FuzzTransport, ctx: IterationContext): Promise<void> {
  const { testType, iter, totalIterations: N, compression, rowCount } = ctx;
  const suffix = uniqueSuffix(iter);
  const srcTable = `${testType}_fuzz_src_${suffix}`;
  const dstTable = `${testType}_fuzz_dst_${suffix}`;
  let structure = "";

  try {
    structure =
      replayStructure() ?? (await transport.scalar(`SELECT generateRandomStructure()`)).trim();
    console.log(`[${testType} fuzz ${iter + 1}/${N} compression=${compression}] ${structure}`);

    const escapedStructure = sqlQuote(unTsvEscape(structure));
    await transport.exec(
      `CREATE TABLE ${srcTable} ENGINE = MergeTree ORDER BY tuple() AS SELECT * FROM generateRandom('${escapedStructure}') LIMIT ${rowCount}`,
    );
    await transport.exec(`CREATE TABLE ${dstTable} EMPTY AS ${srcTable}`);

    const columns = await transport.roundtrip(`SELECT * FROM ${srcTable}`, dstTable);

    const diff1 = (
      await transport.scalar(
        `SELECT count() FROM (SELECT cityHash64(*) AS h FROM ${srcTable} EXCEPT SELECT cityHash64(*) AS h FROM ${dstTable})`,
      )
    ).trim();
    const diff2 = (
      await transport.scalar(
        `SELECT count() FROM (SELECT cityHash64(*) AS h FROM ${dstTable} EXCEPT SELECT cityHash64(*) AS h FROM ${srcTable})`,
      )
    ).trim();

    if (diff1 !== "0" || diff2 !== "0") {
      let firstDiffCol = "";
      for (const col of columns) {
        const colDiff = (
          await transport.scalar(
            `SELECT count() FROM (SELECT cityHash64(\`${col.name}\`) AS h FROM ${srcTable} EXCEPT SELECT cityHash64(\`${col.name}\`) AS h FROM ${dstTable})`,
          )
        ).trim();
        if (colDiff !== "0") {
          firstDiffCol = `${col.name} (${col.type})`;
          break;
        }
      }
      throw new Error(
        `Native fuzz mismatch: ${diff1}/${diff2} rows differ. First differing column: ${firstDiffCol || "unknown"}`,
      );
    }
  } catch (err) {
    logFuzzError(
      {
        testType,
        iteration: iter,
        totalIterations: N,
        compression,
        rows: rowCount,
        structure,
        srcTable,
        dstTable,
      },
      err,
    );
    throw err;
  } finally {
    await dropTables(transport, srcTable, dstTable);
  }
}

/** Round-trip a JSON column with 1-3 random typed paths and verify with cityHash64. */
async function jsonPathsIteration(transport: FuzzTransport, ctx: IterationContext): Promise<void> {
  const { testType, iter, totalIterations: N, compression, rowCount } = ctx;
  const suffix = uniqueSuffix(iter);
  const srcTable = `${testType}_json_src_${suffix}`;
  const dstTable = `${testType}_json_dst_${suffix}`;
  let jsonType = "";

  try {
    const numPaths = randomInt(1, 3);
    const typedPathDefs: string[] = [];
    const pathTypes: string[] = [];
    for (let p = 0; p < numPaths; p++) {
      const result = (await transport.scalar(`SELECT generateRandomStructure(1, 1)`)).trim();
      const match = result.match(/^\S+\s+(.+)$/);
      if (match) {
        const idx = typedPathDefs.length;
        typedPathDefs.push(`tp_${idx} Nullable(${match[1]})`);
        pathTypes.push(`Nullable(${match[1]})`);
      }
    }

    if (typedPathDefs.length === 0) return;

    jsonType = `JSON(${typedPathDefs.join(", ")})`;
    console.log(`[${testType} json fuzz ${iter + 1}/${N} compression=${compression}] ${jsonType}`);

    const helperCols = pathTypes.map((t, i) => `tp_${i} ${t}`).join(", ");
    const pathSelect = pathTypes.map((_, i) => `'tp_${i}', tp_${i}`).join(", ");

    await transport.exec(`CREATE TABLE ${srcTable} (id UInt64, data ${jsonType}) ENGINE = Memory`);
    await transport.exec(
      `INSERT INTO ${srcTable} SELECT rowNumberInAllBlocks() as id, map(${pathSelect})::${jsonType} as data ` +
        `FROM generateRandom('${sqlQuote(helperCols)}') LIMIT ${rowCount}`,
    );
    await transport.exec(`CREATE TABLE ${dstTable} (id UInt64, data ${jsonType}) ENGINE = Memory`);

    await transport.roundtrip(`SELECT * FROM ${srcTable} ORDER BY id`, dstTable);

    const srcCount = (await transport.scalar(`SELECT count() FROM ${srcTable}`)).trim();
    const dstCount = (await transport.scalar(`SELECT count() FROM ${dstTable}`)).trim();
    if (srcCount !== dstCount) {
      throw new Error(`Row count mismatch: src=${srcCount}, dst=${dstCount} for ${jsonType}`);
    }

    const pathList = typedPathDefs.map((_, i) => `data.tp_${i}`).join(", ");
    const diff1 = (
      await transport.scalar(
        `SELECT count() FROM (SELECT id, cityHash64(${pathList}) AS h FROM ${srcTable} EXCEPT SELECT id, cityHash64(${pathList}) AS h FROM ${dstTable})`,
      )
    ).trim();
    const diff2 = (
      await transport.scalar(
        `SELECT count() FROM (SELECT id, cityHash64(${pathList}) AS h FROM ${dstTable} EXCEPT SELECT id, cityHash64(${pathList}) AS h FROM ${srcTable})`,
      )
    ).trim();
    if (diff1 !== "0" || diff2 !== "0") {
      throw new Error(`Hash mismatch: ${diff1}/${diff2} rows differ for ${jsonType}`);
    }
  } catch (err) {
    logFuzzError(
      {
        testType,
        iteration: iter,
        totalIterations: N,
        compression,
        rows: rowCount,
        jsonType,
        srcTable,
        dstTable,
      },
      err,
    );
    throw err;
  } finally {
    await dropTables(transport, srcTable, dstTable);
  }
}

/** Run one body across the configured iterations, one transport per iteration. */
async function runIterations(
  cfg: IntegrationConfig,
  compression: Compression,
  body: IterationBody,
): Promise<void> {
  await cfg.startServer();
  try {
    const iterationIndex = getIterationIndex();
    const N = config.iterations;
    const count = iterationIndex !== null ? 1 : N;
    const startIdx = iterationIndex ?? 0;

    for (let iter = startIdx; iter < startIdx + count; iter++) {
      const handle = await cfg.openTransport(iter, compression);
      try {
        await body(handle.transport, {
          testType: cfg.testType,
          iter,
          totalIterations: N,
          compression,
          rowCount: config.rows,
        });
      } finally {
        await handle.close();
      }
    }
  } finally {
    await cfg.stopServer();
  }
}

/** Register the random-data and JSON integration fuzz tests for a transport. */
export function defineIntegrationFuzz(cfg: IntegrationConfig): void {
  logConfig(cfg.testType);
  describe(
    `Native ${cfg.testType.toUpperCase()} Integration Fuzz Tests`,
    { timeout: 600000 },
    () => {
      for (const compression of config.compressions) {
        it(`round-trips random data (compression=${compression})`, () =>
          runIterations(cfg, compression, randomDataIteration));
        it(`round-trips JSON with random typed paths (compression=${compression})`, () =>
          runIterations(cfg, compression, jsonPathsIteration));
      }
    },
  );
}
