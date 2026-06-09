/**
 * TCP integration fuzz tests for Native format.
 *
 * The shared iteration body lives in ./integration.ts; this file only provides
 * the TCP transport: a per-iteration TcpClient (which does not support concurrent
 * operations, so each iteration gets its own) and a round-trip that collects
 * RecordBatches and re-inserts them.
 */

import { type ColumnDef, RecordBatch } from "../native/index.ts";
import { TcpClient } from "../tcp_client/client.ts";
import { startClickHouse, stopClickHouse } from "../test/setup.ts";
import { type Compression } from "./config.ts";
import { defineIntegrationFuzz, type FuzzTransport, type TransportHandle } from "./integration.ts";

let ch: Awaited<ReturnType<typeof startClickHouse>> | null = null;

defineIntegrationFuzz({
  testType: "tcp",

  async startServer(): Promise<void> {
    ch = await startClickHouse();
  },

  async stopServer(): Promise<void> {
    await stopClickHouse();
    ch = null;
  },

  async openTransport(_iter: number, compression: Compression): Promise<TransportHandle> {
    const client = new TcpClient({
      host: ch!.host,
      port: ch!.tcpPort,
      user: ch!.username,
      password: ch!.password,
      compression,
      // The describe-level test timeout is 600s; match it so the query timeout
      // does not fail before the test framework's own deadline under fuzz load.
      queryTimeout: 600000,
      debug: !!process.env.FUZZ_DEBUG,
    });
    await client.connect();

    const transport: FuzzTransport = {
      async scalar(sql: string): Promise<string> {
        for await (const packet of client.query(sql)) {
          if (packet.type === "Data" && packet.batch.rowCount > 0) {
            return String(packet.batch.getAt(0, 0));
          }
        }
        return "";
      },

      async exec(sql: string): Promise<void> {
        for await (const _packet of client.query(sql)) {
          /* drain */
        }
      },

      async roundtrip(selectSql: string, dstTable: string): Promise<ColumnDef[]> {
        const batches: RecordBatch[] = [];
        let columns: ColumnDef[] = [];
        const stream = client.query(selectSql, {
          settings: { output_format_native_use_flattened_dynamic_and_json_serialization: 1 },
        });
        for await (const packet of stream) {
          if (packet.type === "Data" && packet.batch.rowCount > 0) {
            columns = packet.batch.columns;
            batches.push(packet.batch);
          }
        }
        for (const batch of batches) {
          await client.insert(`INSERT INTO ${dstTable} VALUES`, batch);
        }
        return columns;
      },
    };

    return { transport, close: async () => client.close() };
  },
});
