/**
 * Type-only oracle for the offline type generator (fuzz/gen-type.ts).
 *
 * Sweeps many genType outputs through a real ClickHouse WITHOUT generating any
 * row data, so it covers the type grammar far faster than the data round-trip
 * fuzz (fuzz/generated.ts) and isolates grammar/canonicalization bugs from value
 * bugs. For each generated type T:
 *
 *   1. Legality: CH must accept `CREATE TABLE (... T ...)`. A rejection means
 *      genType proposed a type CH considers illegal (a generator legality bug).
 *   2. Parser accepts it: `getCodec(T)` must build, since the data fuzz relies on
 *      decoding every type genType can emit.
 *   3. Fixed point: CH's normalized form (read back from system.columns) must
 *      re-parse to itself — `getCodec(chType).type === chType` — so our parser
 *      round-trips every shape the server emits.
 *
 * We deliberately do NOT require `getCodec(T).type === chType` (our spelling of
 * the original input equals CH's). Some equivalent spellings are not part of our
 * canonical form and need not be: CH sorts Enum members into ascending value
 * order, but member order never affects Enum serialization (the wire stores the
 * value), so re-sorting in the codec would be churn. The fixed-point check is the
 * real canonicalization-agreement guarantee.
 *
 * Types are batched into one multi-column table (one CREATE + one system.columns
 * read per batch); on a batch CREATE failure each type is retried alone to name
 * the offender. Sweep size is FUZZ_TYPE_ORACLE_TYPES (default 500).
 */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { collectText, init, type QueryPacket, query } from "../client.ts";
import { startClickHouse, stopClickHouse } from "./setup.ts";
import { getCodec } from "../native/index.ts";
import { genType } from "../fuzz/gen-type.ts";
import { makeRng } from "../fuzz/rng.ts";

const TYPE_COUNT = Number(process.env.FUZZ_TYPE_ORACLE_TYPES ?? 500);
const BATCH = 50;

interface Failure {
  type: string;
  reason: string;
  chType?: string;
  ourType?: string;
}

describe("genType type-only oracle", { timeout: 120000 }, () => {
  let url: string;
  let auth: { username: string; password: string };
  const sid = "type-oracle";
  let table = 0;

  before(async () => {
    await init();
    const ch = await startClickHouse();
    url = `${ch.url}/`;
    auth = { username: ch.username, password: ch.password };
  });

  after(async () => {
    await stopClickHouse();
  });

  const consume = async (it: AsyncIterable<QueryPacket>): Promise<void> => {
    for await (const _ of it) {
    }
  };
  const run = (sql: string) =>
    consume(query(sql, { url, auth, sessionId: sid, compression: false }));
  const drop = (name: string) => run(`DROP TABLE IF EXISTS ${name} SYNC`);

  /** name -> CH-normalized type for every column of `name`, system.columns TSV unescaped. */
  async function readColumns(name: string): Promise<Map<string, string>> {
    const tsv = await collectText(
      query(
        `SELECT name, type FROM system.columns WHERE database = currentDatabase() AND table = '${name}' FORMAT TabSeparated`,
        { url, auth, sessionId: sid },
      ),
    );
    const map = new Map<string, string>();
    for (const line of tsv.split("\n")) {
      if (!line) continue;
      const tab = line.indexOf("\t");
      if (tab === -1) continue;
      map.set(line.slice(0, tab), line.slice(tab + 1).replace(/\\'/g, "'"));
    }
    return map;
  }

  /** CH's canonical form for one type, or null if CH rejects it at CREATE. */
  async function canonicalizeOne(type: string): Promise<string | null> {
    const name = `type_oracle_one_${table++}`;
    try {
      await run(`CREATE TABLE ${name} (c0 ${type}) ENGINE = Memory`);
      const got = (await readColumns(name)).get("c0") ?? null;
      await drop(name);
      return got;
    } catch {
      await drop(name);
      return null;
    }
  }

  /** CH's canonical form for each type in `batch`; positionally aligned, null = rejected. */
  async function canonicalizeBatch(batch: string[]): Promise<(string | null)[]> {
    const name = `type_oracle_${table++}`;
    const cols = batch.map((t, i) => `c${i} ${t}`).join(", ");
    try {
      await run(`CREATE TABLE ${name} (${cols}) ENGINE = Memory`);
      const map = await readColumns(name);
      await drop(name);
      return batch.map((_, i) => map.get(`c${i}`) ?? null);
    } catch {
      // One illegal type fails the whole CREATE; retry each alone to isolate it.
      await drop(name);
      const out: (string | null)[] = [];
      for (const t of batch) out.push(await canonicalizeOne(t));
      return out;
    }
  }

  it("genType output is CH-legal and round-trips our parser", async () => {
    const types = Array.from({ length: TYPE_COUNT }, (_, i) => genType(makeRng(0x5bd1e995 + i)));
    const failures: Failure[] = [];

    for (let start = 0; start < types.length; start += BATCH) {
      const batch = types.slice(start, start + BATCH);
      const chTypes = await canonicalizeBatch(batch);

      for (let j = 0; j < batch.length; j++) {
        const type = batch[j]!;
        const chType = chTypes[j]!;
        if (chType === null) {
          failures.push({ type, reason: "CH rejected at CREATE" });
          continue;
        }
        // Our parser must build what genType emits (the data fuzz decodes it).
        try {
          getCodec(type);
        } catch (err) {
          failures.push({ type, chType, reason: `our parse threw: ${(err as Error).message}` });
          continue;
        }
        // CH's canonical form must be a fixed point of our parser.
        try {
          const reparsed = getCodec(chType).type;
          if (reparsed !== chType) {
            failures.push({
              type,
              chType,
              ourType: reparsed,
              reason: "CH form not a parser fixed point",
            });
          }
        } catch (err) {
          failures.push({
            type,
            chType,
            reason: `reparse of CH form threw: ${(err as Error).message}`,
          });
        }
      }
    }

    if (failures.length > 0) {
      const sample = failures
        .slice(0, 20)
        .map((f) => `  ${f.reason}: ${JSON.stringify(f)}`)
        .join("\n");
      assert.fail(`${failures.length}/${types.length} type-oracle failures:\n${sample}`);
    }
  });
});
