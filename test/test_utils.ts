import assert from "node:assert";
import type { QueryPacket } from "../client.ts";
import {
  batchFromRows,
  type ColumnDef,
  type DecodeOptions,
  encodeNative,
  RecordBatch,
  streamDecodeNative,
} from "../native/index.ts";
import { TcpClient } from "../tcp_client/client.ts";
import { BufferWriter } from "../native/io.ts";
import { BlockInfoField } from "../native/constants.ts";

// Async iterable helpers
export async function consume(input: AsyncIterable<QueryPacket>): Promise<void> {
  for await (const _ of input) {
  }
}

export async function collect<T>(gen: AsyncIterable<T>): Promise<T[]> {
  const results: T[] = [];
  for await (const item of gen) results.push(item);
  return results;
}

export async function* toAsync<T>(iter: Iterable<T>): AsyncIterable<T> {
  for (const item of iter) yield item;
}

// Assertion helpers
export function assertArrayEqual(
  actual: ArrayLike<unknown>,
  expected: unknown[],
  message?: string,
): void {
  assert.strictEqual(
    actual.length,
    expected.length,
    message
      ? `${message}: length mismatch`
      : `length mismatch: ${actual.length} vs ${expected.length}`,
  );
  for (let i = 0; i < expected.length; i++) {
    assert.strictEqual(
      actual[i],
      expected[i],
      message ? `${message}: mismatch at index ${i}` : `mismatch at index ${i}`,
    );
  }
}

// Encoding helpers
export function encodeNativeRows(columns: ColumnDef[], rows: unknown[][]): Uint8Array {
  return encodeNative(batchFromRows(columns, rows));
}

/**
 * Convert a batch to array-of-arrays format (for test assertions).
 */
export function toArrayRows(batch: RecordBatch): unknown[][] {
  const { columnData, rowCount } = batch;
  const numCols = columnData.length;
  const rows: unknown[][] = new Array(rowCount);
  for (let i = 0; i < rowCount; i++) {
    const row = new Array(numCols);
    for (let j = 0; j < numCols; j++) {
      row[j] = columnData[j].get(i);
    }
    rows[i] = row;
  }
  return rows;
}

/**
 * Decode a single Native block from bytes. Convenience for tests.
 */
export async function decodeBatch(data: Uint8Array, options?: DecodeOptions): Promise<RecordBatch> {
  const batches: RecordBatch[] = [];
  for await (const batch of streamDecodeNative(toAsync([data]), options)) {
    batches.push(batch);
  }
  if (batches.length === 0) {
    return RecordBatch.from({ columns: [], columnData: [], rowCount: 0 });
  }
  if (batches.length === 1) {
    return batches[0];
  }
  throw new Error("decodeBatch: expected single batch, got multiple");
}

export function generateSessionId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

// TCP client helpers

export type TcpConfig = {
  host: string;
  tcpPort: number;
  username: string;
  password: string;
};

/** Convert TcpConfig to TcpClient options format */
export function toClientOptions(config: TcpConfig): {
  host: string;
  port: number;
  user: string;
  password: string;
} {
  return {
    host: config.host,
    port: config.tcpPort,
    user: config.username,
    password: config.password,
  };
}

export function connectTcpClient(
  config: TcpConfig,
  opts?: Omit<Parameters<typeof TcpClient.connect>[0], "host" | "port" | "user" | "password">,
) {
  return TcpClient.connect({
    host: config.host,
    port: config.tcpPort,
    user: config.username,
    password: config.password,
    ...opts,
  });
}

export async function collectQueryResults(
  client: TcpClient,
  sql: string,
  options?: Parameters<TcpClient["query"]>[1],
): Promise<unknown[][]> {
  const allRows: unknown[][] = [];
  for await (const packet of client.query(sql, options)) {
    if (packet.type === "Data") {
      allRows.push(...toArrayRows(packet.batch));
    }
  }
  return allRows;
}

export async function collectRows(
  client: TcpClient,
  sql: string,
  options?: Parameters<TcpClient["query"]>[1],
): Promise<Record<string, unknown>[]> {
  const allRows: Record<string, unknown>[] = [];
  for await (const packet of client.query(sql, options)) {
    if (packet.type === "Data") {
      for (const row of packet.batch) {
        allRows.push(row.toObject());
      }
    }
  }
  return allRows;
}

export async function withClient<T>(
  config: TcpConfig,
  fn: (client: TcpClient) => Promise<T>,
): Promise<T> {
  const client = await connectTcpClient(config);
  try {
    return await fn(client);
  } finally {
    client.close();
  }
}

// Native block building helpers

export { BufferWriter } from "../native/io.ts";

/**
 * Build a Native format block for testing.
 * Consolidates common boilerplate: block info, header, column metadata.
 */
export function buildTestBlock(opts: {
  colName: string;
  colType: string;
  rows: number;
  /** Optional custom serialization (writes hasCustom=1 + callback) */
  customSerialization?: (w: BufferWriter) => void;
  /** Optional prefix before data (e.g., LowCardinality version) */
  prefix?: (w: BufferWriter) => void;
  /** Required: writes the column data */
  data: (w: BufferWriter) => void;
}): Uint8Array {
  const writer = new BufferWriter(4096);

  // Block info (required when clientVersion > 0)
  writer.writeVarint(BlockInfoField.End);

  // Header: 1 column, N rows
  writer.writeVarint(1);
  writer.writeVarint(opts.rows);

  // Column metadata
  writer.writeString(opts.colName);
  writer.writeString(opts.colType);

  // Custom serialization flag
  if (opts.customSerialization) {
    writer.writeU8(1);
    opts.customSerialization(writer);
  } else {
    writer.writeU8(0);
  }

  // Prefix (codec-specific)
  opts.prefix?.(writer);

  // Data
  opts.data(writer);

  return writer.finish();
}
