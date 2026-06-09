/**
 * HTTP integration fuzz tests for Native format.
 *
 * The shared iteration body lives in ./integration.ts; this file only provides
 * the HTTP transport: a per-iteration session pair (the round-trip's interleaved
 * SELECT and INSERT use separate sessions to avoid HTTP session locking) and the
 * block-by-block streaming round-trip.
 */

import { collectText, dataChunks, init, insert, query } from "../client.ts";
import { type ColumnDef, encodeNative, streamDecodeNative } from "../native/index.ts";
import { startClickHouse, stopClickHouse } from "../test/setup.ts";
import { type Compression } from "./config.ts";
import { defineIntegrationFuzz, type FuzzTransport, type TransportHandle } from "./integration.ts";
import { consume, uniqueSuffix } from "./util.ts";

let server: { baseUrl: string; auth: { username: string; password: string } } | null = null;

defineIntegrationFuzz({
  testType: "http",

  async startServer(): Promise<void> {
    await init();
    const ch = await startClickHouse();
    server = { baseUrl: `${ch.url}/`, auth: { username: ch.username, password: ch.password } };
  },

  async stopServer(): Promise<void> {
    await stopClickHouse();
    server = null;
  },

  async openTransport(iter: number, compression: Compression): Promise<TransportHandle> {
    const { baseUrl, auth } = server!;
    const suffix = uniqueSuffix(iter);
    const sessionId = `native_fuzz_${compression}_${suffix}`;
    const insertSessionId = `${sessionId}_insert`;

    const transport: FuzzTransport = {
      async scalar(sql: string): Promise<string> {
        return collectText(query(`${sql} FORMAT TabSeparated`, sessionId, { baseUrl, auth }));
      },

      async exec(sql: string): Promise<void> {
        await consume(query(sql, sessionId, { baseUrl, auth, compression: false }));
      },

      async roundtrip(selectSql: string, dstTable: string): Promise<ColumnDef[]> {
        const result = query(
          `${selectSql} FORMAT Native SETTINGS output_format_native_use_flattened_dynamic_and_json_serialization=1`,
          sessionId,
          { baseUrl, auth, compression },
        );
        let columns: ColumnDef[] = [];
        for await (const block of streamDecodeNative(dataChunks(result), {
          mapAsArray: true,
          debug: false,
        })) {
          columns = block.columns;
          await insert(
            `INSERT INTO ${dstTable} FORMAT Native`,
            encodeNative(block),
            insertSessionId,
            {
              baseUrl,
              auth,
            },
          );
        }
        return columns;
      },
    };

    return { transport, close: async () => {} };
  },
});
