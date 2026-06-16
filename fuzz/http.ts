/**
 * HTTP integration fuzz tests for Native format.
 *
 * The shared iteration body lives in ./integration.ts; this file only provides
 * the HTTP transport: a per-iteration session pair (the round-trip's interleaved
 * SELECT and INSERT use separate sessions to avoid HTTP session locking) and the
 * block-by-block streaming round-trip.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { collectText, dataChunks, init, insert, query } from "../client.ts";
import { type ColumnDef, encodeNative, streamDecodeNative } from "../native/index.ts";
import { startClickHouse, stopClickHouse } from "../test/setup.ts";
import type { Compression } from "./config.ts";
import { defineIntegrationFuzz, type FuzzTransport, type TransportHandle } from "./integration.ts";
import { consume, uniqueSuffix } from "./util.ts";

let server: { url: string; auth: { username: string; password: string } } | null = null;

defineIntegrationFuzz({
  testType: "http",

  async startServer(): Promise<void> {
    await init();
    const ch = await startClickHouse();
    server = { url: `${ch.url}/`, auth: { username: ch.username, password: ch.password } };
  },

  async stopServer(): Promise<void> {
    await stopClickHouse();
    server = null;
  },

  async openTransport(iter: number, compression: Compression): Promise<TransportHandle> {
    const { url, auth } = server!;
    const suffix = uniqueSuffix(iter);
    const sessionId = `native_fuzz_${compression}_${suffix}`;
    const insertSessionId = `${sessionId}_insert`;

    const transport: FuzzTransport = {
      async scalar(sql: string): Promise<string> {
        return collectText(query(`${sql} FORMAT TabSeparated`, { url, auth, sessionId }));
      },

      async exec(sql: string): Promise<void> {
        await consume(query(sql, { url, auth, sessionId, compression: false }));
      },

      async roundtrip(selectSql: string, dstTable: string): Promise<ColumnDef[]> {
        const result = query(
          `${selectSql} FORMAT Native SETTINGS output_format_native_use_flattened_dynamic_and_json_serialization=1`,
          { url, auth, sessionId, compression },
        );
        // Decode failures here are usually data-dependent (unseeded
        // generateRandom), so capture the exact bytes the decoder saw for
        // offline analysis - a replay of the structure alone won't reproduce.
        const captured: Uint8Array[] = [];
        let capturedBytes = 0;
        const CAPTURE_CAP = 256 * 1024 * 1024;
        async function* tee(src: AsyncIterable<Uint8Array>): AsyncGenerator<Uint8Array> {
          for await (const chunk of src) {
            if (capturedBytes < CAPTURE_CAP) {
              captured.push(chunk);
              capturedBytes += chunk.length;
            }
            yield chunk;
          }
        }
        let columns: ColumnDef[] = [];
        try {
          for await (const block of streamDecodeNative(tee(dataChunks(result)), {
            mapAsArray: true,
            debug: false,
          })) {
            columns = block.columns;
            await insert(`INSERT INTO ${dstTable} FORMAT Native`, encodeNative(block), {
              url,
              auth,
              sessionId: insertSessionId,
            });
          }
        } catch (err) {
          const dir = ".tmp/fuzz-artifacts";
          const file = path.join(dir, `${dstTable}.nativestream`);
          try {
            fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(file, Buffer.concat(captured));
            console.error(
              `[http fuzz] select stream failed after ${capturedBytes} bytes; raw decoder input saved to ${file}`,
            );
          } catch {
            /* artifact capture must never mask the real error */
          }
          throw err;
        }
        return columns;
      },
    };

    return { transport, close: async () => {} };
  },
});
