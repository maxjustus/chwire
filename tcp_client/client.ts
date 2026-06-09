import { randomUUID } from "node:crypto";
import * as net from "node:net";
import * as tls from "node:tls";
import {
  BlockBuffer,
  BlockUnderflowError,
  BufferReader,
  BufferUnderflowError,
  BufferWriter,
  type ColumnDef,
  decodeNativeBlockWithReader,
  type ExternalTableData,
  getCodec,
  type PartialBlockState,
  RecordBatch,
} from "@maxjustus/chwire/native";
import { type Compression, init as initCompression } from "../compression.ts";
import type { ClickHouseException } from "../errors.ts";
import type { ClickHouseSettings } from "../settings.ts";
import type { QueryParamValue } from "../types.ts";
import { type CollectableAsyncGenerator, collectable } from "../util.ts";
import { StreamingReader } from "./reader.ts";
import { transposeRowObjectsToColumns } from "./row_object_insert.ts";
import {
  type AccumulatedProgress,
  DBMS_TCP_PROTOCOL_VERSION,
  type LogEntry,
  type Packet,
  type ProfileInfo,
  type Progress,
  REVISIONS,
  type ServerHello,
  ServerPacketId,
} from "./types.ts";
import { StreamingWriter } from "./writer.ts";

export type { QueryParamValue } from "../types.ts";
export type { CollectableAsyncGenerator } from "../util.ts";

/**
 * One server packet with its payload fully consumed off the wire.
 * Parsing lives in a single place (readServerPacket) so every consumer
 * loop stays in sync: a packet type one consumer ignores is still read,
 * and the stream cannot desync.
 */
type WirePacket =
  | { id: typeof ServerPacketId.Data; batch: RecordBatch }
  | { id: typeof ServerPacketId.Totals; batch: RecordBatch }
  | { id: typeof ServerPacketId.Extremes; batch: RecordBatch }
  | { id: typeof ServerPacketId.ProfileEvents; batch: RecordBatch }
  | { id: typeof ServerPacketId.Log; batch: RecordBatch }
  | { id: typeof ServerPacketId.Progress; progress: Progress }
  | { id: typeof ServerPacketId.ProfileInfo; info: ProfileInfo }
  | { id: typeof ServerPacketId.Exception; exception: ClickHouseException }
  | { id: typeof ServerPacketId.TimezoneUpdate; timezone: string }
  | { id: typeof ServerPacketId.TableColumns }
  | { id: typeof ServerPacketId.EndOfStream }
  | { id: typeof ServerPacketId.Pong };

export interface TcpClientOptions {
  host: string;
  port: number;
  database?: string;
  user?: string;
  password?: string;
  debug?: boolean;
  /**
   * Compression: 'lz4', 'zstd', or false to disable.
   * Use `{ method: "zstd", level }` to set an explicit ZSTD level (1-22, default: 3).
   */
  compression?: Compression;
  /** Connection timeout in ms (default: 10000) */
  connectTimeout?: number;
  /** Query timeout in ms (default: 30000) */
  queryTimeout?: number;
  /** Keep-alive interval in ms. 0 or undefined = disabled. */
  keepAliveIntervalMs?: number;
  /** TLS options. true for defaults, or tls.ConnectionOptions for custom config. */
  tls?: boolean | tls.ConnectionOptions;
  /** Grace period in ms after sending CANCEL before forceful socket close (default: 2000) */
  cancelGracePeriodMs?: number;
  /** Default settings applied to all queries and inserts (can be overridden per-call) */
  settings?: ClickHouseSettings;
}

export interface ColumnSchema {
  name: string;
  type: string;
}

export interface InsertOptions {
  signal?: AbortSignal;
  /** Batch size for row object mode (default: 10000) */
  batchSize?: number;
  /** Optional schema to validate against server schema */
  schema?: ColumnDef[];
  /** Per-insert settings (merged with client defaults, overrides them) */
  settings?: ClickHouseSettings;
  /** Custom query ID for tracking in system.query_log and KILL QUERY */
  queryId?: string;
}

export type { ExternalTableData };

export interface QueryOptions {
  /** Per-query settings (merged with client defaults, overrides them) */
  settings?: ClickHouseSettings;
  /**
   * Query parameters (substitution values). Supports scalars and complex types.
   * Type is inferred from the query's {name: Type} syntax.
   * ```typescript
   * { arr: [1, 2, 3] }                // Array(UInt32)
   * { tags: ['foo', 'bar'] }          // Array(String)
   * { m: { a: 1, b: 2 } }             // Map(String, UInt32)
   * { t: [1, 'hello'] }               // Tuple(UInt32, String) - arrays work for tuples
   * ```
   */
  params?: Record<string, QueryParamValue>;
  signal?: AbortSignal;
  /** External tables to send with the query (available as temporary tables in the SQL) */
  externalTables?: Record<string, ExternalTableData>;
  /** Custom query ID for tracking in system.query_log and KILL QUERY */
  queryId?: string;
}

function createAbortError(message: string): Error {
  const err = new Error(message);
  err.name = "AbortError";
  return err;
}

/** Validates that expected schema matches server schema exactly. */
function validateSchema(expected: ColumnDef[], actual: ColumnSchema[]): void {
  if (expected.length !== actual.length) {
    throw new Error(`Schema mismatch: expected ${expected.length} columns, got ${actual.length}`);
  }
  for (let i = 0; i < expected.length; i++) {
    if (expected[i].name !== actual[i].name) {
      throw new Error(
        `Schema mismatch: column ${i} expected name '${expected[i].name}', got '${actual[i].name}'`,
      );
    }
    if (expected[i].type !== actual[i].type) {
      throw new Error(
        `Schema mismatch: column '${expected[i].name}' expected type '${expected[i].type}', got '${actual[i].type}'`,
      );
    }
  }
}

export class TcpClient {
  private socket: net.Socket | null = null;
  private reader: StreamingReader | null = null;
  private writer: StreamingWriter = new StreamingWriter();
  private options: TcpClientOptions;
  private defaultSettings: ClickHouseSettings;
  private _serverHello: ServerHello | null = null;
  private currentSchema: ColumnSchema[] | null = null;
  private sessionTimezone: string | null = null;
  private busy: boolean = false;

  private log(...args: any[]) {
    if (this.options.debug) {
      console.log("[TcpClient]", ...args);
    }
  }

  /** Write with backpressure - waits for drain if socket buffer is full */
  private async writeWithBackpressure(data: Uint8Array): Promise<void> {
    if (!this.socket!.write(data)) {
      await new Promise<void>((resolve, reject) => {
        const socket = this.socket!;
        const cleanup = () => {
          socket.removeListener("drain", onDrain);
          socket.removeListener("error", onError);
          socket.removeListener("close", onClose);
        };
        const onDrain = () => {
          cleanup();
          resolve();
        };
        const onError = (err: Error) => {
          cleanup();
          reject(err);
        };
        const onClose = () => {
          cleanup();
          reject(new Error("Socket closed while waiting for drain"));
        };
        socket.once("drain", onDrain);
        socket.once("error", onError);
        socket.once("close", onClose);
      });
    }
  }

  /** Server info from handshake, available after connect() */
  get serverHello() {
    return this._serverHello;
  }

  private ensureConnected(): {
    socket: net.Socket;
    reader: StreamingReader;
    serverHello: ServerHello;
  } {
    if (this.busy && this.socket?.destroyed) {
      this.busy = false;
    }
    if (!this.socket || !this.reader || !this._serverHello) throw new Error("Not connected");
    return { socket: this.socket, reader: this.reader, serverHello: this._serverHello };
  }

  /** Session timezone, updated by server TimezoneUpdate packets */
  get timezone(): string | null {
    return this.sessionTimezone;
  }

  constructor(options: TcpClientOptions) {
    this.options = {
      database: "default",
      user: "default",
      password: "",
      debug: false,
      compression: false,
      ...options,
    };
    this.defaultSettings = options.settings ?? {};
  }

  async connect(options: { signal?: AbortSignal } = {}): Promise<void> {
    const signal = options.signal;
    if (signal?.aborted) throw createAbortError("Connect aborted before start");

    await initCompression();
    const timeout = this.options.connectTimeout ?? 10000;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let settled = false;

    let abortRejectFn: (() => void) | null = null;

    const cleanup = () => {
      settled = true;
      if (timeoutId) clearTimeout(timeoutId);
      if (signal && abortRejectFn) signal.removeEventListener("abort", abortRejectFn);
      signal?.removeEventListener("abort", abortHandler);
    };

    const abortHandler = () => {
      if (!settled) {
        const rejectAbort = abortRejectFn;
        cleanup();
        this.socket?.destroy();
        rejectAbort?.();
      }
    };
    signal?.addEventListener("abort", abortHandler);

    const connectPromise = new Promise<void>((resolve, reject) => {
      const onConnected = async () => {
        try {
          if (signal?.aborted) {
            reject(createAbortError("Connect aborted"));
            return;
          }
          this.reader = new StreamingReader(this.socket!);
          await this.handshake();
          this.startKeepAliveTimer();
          resolve();
        } catch (err) {
          reject(err);
        }
      };

      const tlsOpts = this.options.tls;
      if (tlsOpts) {
        const opts: tls.ConnectionOptions = {
          host: this.options.host,
          port: this.options.port,
          ...(typeof tlsOpts === "object" ? tlsOpts : {}),
        };
        this.socket = tls.connect(opts, onConnected);
      } else {
        this.socket = net.connect(this.options.port, this.options.host);
        this.socket.on("connect", onConnected);
      }

      this.socket.on("error", (err) => reject(err));
    });

    const timeoutPromise = new Promise<void>((_, reject) => {
      timeoutId = setTimeout(() => {
        this.socket?.destroy();
        reject(new Error(`Connection timeout after ${timeout}ms`));
      }, timeout);
    });

    const abortPromise = new Promise<void>((_, reject) => {
      if (signal) {
        abortRejectFn = () => reject(createAbortError("Connect aborted"));
        signal.addEventListener("abort", abortRejectFn, { once: true });
      }
    });

    try {
      await Promise.race(
        signal ? [connectPromise, timeoutPromise, abortPromise] : [connectPromise, timeoutPromise],
      );
    } finally {
      cleanup();
    }
  }

  private async handshake() {
    if (!this.socket || !this.reader) throw new Error("Not connected");

    this.log("Handshake: Sending Hello...");
    const hello = this.writer.encodeHello(
      this.options.database!,
      this.options.user!,
      this.options.password!,
    );
    this.socket.write(hello);

    const packetId = Number(await this.reader.readVarint());
    if (packetId === ServerPacketId.Exception) {
      throw await this.reader.readException();
    }

    if (packetId !== ServerPacketId.Hello) {
      throw new Error(`Unexpected packet during handshake: ${packetId}`);
    }

    const serverName = await this.reader.readString();
    const major = await this.reader.readVarint();
    const minor = await this.reader.readVarint();
    const revision = await this.reader.readVarint();

    // Use minimum of our supported version and server version
    const effectiveRevision =
      revision < DBMS_TCP_PROTOCOL_VERSION ? revision : DBMS_TCP_PROTOCOL_VERSION;

    if (
      effectiveRevision >= REVISIONS.DBMS_MIN_REVISION_WITH_VERSIONED_PARALLEL_REPLICAS_PROTOCOL
    ) {
      // Server-side parallel replicas protocol version
      await this.reader.readVarint();
    }

    const timezone =
      effectiveRevision >= REVISIONS.DBMS_MIN_REVISION_WITH_SERVER_TIMEZONE
        ? await this.reader.readString()
        : "";
    const displayName =
      effectiveRevision >= REVISIONS.DBMS_MIN_REVISION_WITH_SERVER_DISPLAY_NAME
        ? await this.reader.readString()
        : "";
    const patch =
      effectiveRevision >= REVISIONS.DBMS_MIN_REVISION_WITH_VERSION_PATCH
        ? await this.reader.readVarint()
        : effectiveRevision;

    if (effectiveRevision >= REVISIONS.DBMS_MIN_PROTOCOL_VERSION_WITH_CHUNKED_PACKETS) {
      // Server sends its chunked mode preferences - read and discard
      // We always use notchunked since chunked requires server config
      await this.reader.readString(); // server send preference
      await this.reader.readString(); // server recv preference
    }

    if (effectiveRevision >= REVISIONS.DBMS_MIN_REVISION_WITH_EXOTIC_STUFF) {
      // Read rules for parameters or similar exotic metadata
      const rulesSize = Number(await this.reader.readVarint());
      for (let i = 0; i < rulesSize; i++) {
        await this.reader.readString();
        await this.reader.readString();
      }
    }

    if (effectiveRevision >= REVISIONS.DBMS_MIN_REVISION_WITH_EXTRA_U64) {
      // Extra metadata field (currently unused in most drivers)
      await this.reader.readU64LE();
    }

    if (effectiveRevision >= REVISIONS.DBMS_MIN_REVISION_WITH_PASSWORD_PARAMS_IN_HELLO) {
      // Server might send parameters for password verification (e.g. Salt)
      while (true) {
        const name = await this.reader.readString();
        if (name === "") break;
        await this.reader.readVarint(); // value type
        await this.reader.readString(); // value
      }
    }

    if (effectiveRevision >= REVISIONS.DBMS_MIN_REVISION_WITH_TCP_PROTOCOL_VERSION) {
      // Server reports its native TCP protocol version
      await this.reader.readVarint();
    }
    if (effectiveRevision >= REVISIONS.DBMS_MIN_REVISION_WITH_PARALLEL_REPLICAS_CUSTOM_KEY) {
      // Additional parallel replicas metadata
      await this.reader.readVarint();
    }

    this._serverHello = {
      serverName,
      major,
      minor,
      revision: effectiveRevision,
      timezone,
      displayName,
      patch,
    };

    if (effectiveRevision >= REVISIONS.DBMS_MIN_PROTOCOL_VERSION_WITH_QUOTA_KEY) {
      // Send addendum (quota key, etc) - await to ensure it's flushed before returning.
      // Without this, rapid connect() -> query() can fail because Query packet
      // may be written before addendum is actually sent.
      const addendum = this.writer.encodeAddendum(effectiveRevision);
      await new Promise<void>((resolve, reject) => {
        this.socket!.write(addendum, (err) => (err ? reject(err) : resolve()));
      });
    }

    this.log("Handshake: Complete!");
  }

  /** Insert a single RecordBatch. */
  insert(
    sql: string,
    data: RecordBatch,
    options?: InsertOptions,
  ): CollectableAsyncGenerator<Packet>;
  /** Insert an iterable of RecordBatches. */
  insert(
    sql: string,
    data: Iterable<RecordBatch> | AsyncIterable<RecordBatch>,
    options?: InsertOptions,
  ): CollectableAsyncGenerator<Packet>;
  /**
   * Insert row objects with auto-coercion using server schema.
   *
   * By default with `INSERT INTO table VALUES`, all columns must be provided.
   * To omit columns and use server DEFAULT expressions, specify an explicit column list:
   * ```typescript
   * client.insert("INSERT INTO table (col1, col2) VALUES", rows)
   * ```
   * Only the specified columns will be sent; omitted columns use their server-side defaults.
   */
  insert(
    sql: string,
    data: Iterable<Record<string, unknown>> | AsyncIterable<Record<string, unknown>>,
    options?: InsertOptions,
  ): CollectableAsyncGenerator<Packet>;
  insert(
    sql: string,
    data:
      | RecordBatch
      | Iterable<RecordBatch | Record<string, unknown>>
      | AsyncIterable<RecordBatch | Record<string, unknown>>,
    options: InsertOptions = {},
  ): CollectableAsyncGenerator<Packet> {
    return collectable(this.insertImpl(sql, data, options));
  }

  private async *insertImpl(
    sql: string,
    data:
      | RecordBatch
      | Iterable<RecordBatch | Record<string, unknown>>
      | AsyncIterable<RecordBatch | Record<string, unknown>>,
    options: InsertOptions = {},
  ): AsyncGenerator<Packet> {
    this.ensureConnected();
    const signal = options.signal;
    const batchSize = options.batchSize ?? 10000;
    if (signal?.aborted) throw createAbortError("Insert aborted before start");
    if (this.busy)
      throw new Error("Connection busy - cannot run concurrent operations on the same TcpClient");
    this.busy = true;

    let cancelled = false;
    let reachedEndOfStream = false;
    let receivedException = false;
    let sentDataDelimiter = false; // Track if we've finished sending data

    const abortHandler = () => {
      if (!cancelled && this.socket) {
        cancelled = true;
        this.socket!.write(this.writer.encodeCancel());
      }
    };
    const throwIfAborted = () => {
      if (signal?.aborted) {
        throw createAbortError("Insert aborted");
      }
    };
    signal?.addEventListener("abort", abortHandler);
    throwIfAborted();

    const useCompression = !!this.options.compression;
    const compression = this.options.compression || "lz4";

    try {
      // Merge settings: client defaults < per-insert overrides
      const mergedSettings = { ...this.defaultSettings, ...options.settings };

      const serverSchema = await this.sendInsertQueryAndGetSchema(
        sql,
        useCompression,
        compression,
        mergedSettings,
        () => cancelled,
        options.queryId,
      );
      throwIfAborted();

      // Validate schema if provided
      if (options.schema) {
        validateSchema(options.schema, serverSchema);
      }

      let totalInserted = 0;

      const sendBatch = async (batch: RecordBatch) => {
        throwIfAborted();
        if (cancelled) throw createAbortError("Insert aborted");
        const dataPacket = this.encodeBatchAsDataPacket("", batch, useCompression, compression);
        await this.writeWithBackpressure(dataPacket);
        throwIfAborted();
        totalInserted += batch.rowCount;
      };

      const sendRowBatch = async (rows: Record<string, unknown>[]) => {
        throwIfAborted();
        if (rows.length === 0) return;
        const numCols = serverSchema.length;
        const codecs = serverSchema.map((c) => getCodec(c.type));

        const columns = transposeRowObjectsToColumns(serverSchema, rows);

        // Build Column objects via codecs (coercion happens in fromValues)
        const encodedColumns = [];
        for (let i = 0; i < numCols; i++) {
          const col = codecs[i].fromValues(columns[i]);
          const writer = new BufferWriter();
          codecs[i].writePrefix?.(writer, col);
          const encoded = codecs[i].encode(col);
          writer.write(encoded);
          encodedColumns.push({
            name: serverSchema[i].name,
            type: serverSchema[i].type,
            data: writer.finish(),
          });
        }

        const dataPacket = this.writer.encodeData(
          "",
          rows.length,
          encodedColumns,
          this.serverHello!.revision,
          useCompression,
          compression,
        );
        await this.writeWithBackpressure(dataPacket);
        throwIfAborted();
        totalInserted += rows.length;
      };

      // Single RecordBatch - fast path
      if (data instanceof RecordBatch) {
        await sendBatch(data);
      } else {
        // Get iterator (sync or async)
        const isAsync = Symbol.asyncIterator in data;
        const iterator = isAsync
          ? (data as AsyncIterable<any>)[Symbol.asyncIterator]()
          : (data as Iterable<any>)[Symbol.iterator]();

        throwIfAborted();
        const firstResult = await Promise.resolve(iterator.next());
        throwIfAborted();
        if (!firstResult.done) {
          const first = firstResult.value;

          if (first instanceof RecordBatch) {
            // RecordBatch mode
            await sendBatch(first);
            while (true) {
              throwIfAborted();
              if (cancelled) throw createAbortError("Insert aborted");
              const result = await Promise.resolve(iterator.next());
              throwIfAborted();
              if (result.done) break;
              await sendBatch(result.value as RecordBatch);
            }
          } else {
            // Row object mode with batching
            let buffer: Record<string, unknown>[] = [first as Record<string, unknown>];
            while (true) {
              throwIfAborted();
              if (cancelled) throw createAbortError("Insert aborted");
              const result = await Promise.resolve(iterator.next());
              throwIfAborted();
              if (result.done) break;
              buffer.push(result.value as Record<string, unknown>);
              if (buffer.length >= batchSize) {
                await sendRowBatch(buffer);
                buffer = [];
              }
            }
            if (buffer.length > 0) {
              await sendRowBatch(buffer);
            }
          }
        }
      }

      const delimiter = this.writer.encodeData(
        "",
        0,
        [],
        this.serverHello!.revision,
        useCompression,
        compression,
      );
      this.socket!.write(delimiter);
      sentDataDelimiter = true;
      throwIfAborted();

      const { progress: progressAccumulated, profileEvents: profileEventsAccumulated } =
        this.createAccumulators();

      // Read response packets until EndOfStream
      while (true) {
        throwIfAborted();
        const packet = await this.readServerPacket(useCompression);

        // Terminal packets win over a concurrently-fired abort: the server
        // already finished (or failed) the insert, so report that outcome.
        if (packet.id === ServerPacketId.EndOfStream) {
          reachedEndOfStream = true;
          this.log(`Successfully inserted ${totalInserted} rows.`);
          yield { type: "EndOfStream" };
          return;
        }
        if (packet.id === ServerPacketId.Exception) {
          receivedException = true;
          throw packet.exception;
        }
        throwIfAborted();

        switch (packet.id) {
          case ServerPacketId.Progress: {
            const progress = packet.progress;
            this.accumulateProgress(progress, progressAccumulated);
            yield {
              type: "Progress",
              progress,
              accumulated: this.snapshotProgress(progressAccumulated),
            };
            break;
          }
          case ServerPacketId.ProfileInfo:
            yield { type: "ProfileInfo", info: packet.info };
            break;
          case ServerPacketId.ProfileEvents: {
            this.processProfileEventsBlock(
              packet.batch,
              profileEventsAccumulated,
              progressAccumulated,
            );
            yield {
              type: "ProfileEvents",
              batch: packet.batch,
              accumulated: new Map(profileEventsAccumulated),
            };
            break;
          }
          case ServerPacketId.Log:
            if (packet.batch.rowCount > 0) {
              yield { type: "Log", entries: this.parseLogBlock(packet.batch) };
            }
            break;
          default:
            // Data echoes and other packet types carry nothing the insert
            // caller needs; payloads were already consumed off the wire.
            break;
        }
      }
    } finally {
      // If generator was abandoned early, drain remaining packets
      // But only if we've sent the delimiter - otherwise server is waiting for data, not sending responses
      if (!reachedEndOfStream && !receivedException && this.socket && this.reader) {
        if (sentDataDelimiter || cancelled) {
          try {
            if (!cancelled) {
              cancelled = true;
              await this.writeWithBackpressure(this.writer.encodeCancel());
            }
            await this.drainPackets(useCompression);
          } catch (err) {
            this.log(
              `[insert] drain failed, closing connection: ${err instanceof Error ? err.message : err}`,
            );
            this.close();
          }
        } else {
          // We're in the middle of sending data - can't drain, must close
          this.log(`[insert] error before data sent, closing connection`);
          this.close();
        }
      }
      this.busy = false;
      signal?.removeEventListener("abort", abortHandler);
    }
  }

  /**
   * Send INSERT query and wait for schema response from server.
   * Returns the schema (column definitions) for the target table.
   */
  private async sendInsertQueryAndGetSchema(
    sql: string,
    useCompression: boolean,
    compression: Compression,
    settings: Record<string, unknown>,
    isCancelled: () => boolean,
    queryId?: string,
  ): Promise<ColumnSchema[]> {
    const queryPacket = this.writer.encodeQuery(
      queryId ?? randomUUID(),
      sql,
      this.serverHello!.revision,
      settings,
      useCompression,
      {},
    );
    this.socket!.write(queryPacket);

    const delimiter = this.writer.encodeData(
      "",
      0,
      [],
      this.serverHello!.revision,
      useCompression,
      compression,
    );
    this.socket!.write(delimiter);

    while (true) {
      if (isCancelled()) {
        throw createAbortError("Insert aborted");
      }
      const packet = await this.readServerPacket(useCompression);

      switch (packet.id) {
        case ServerPacketId.Data:
          this.currentSchema = packet.batch.columns.map((c) => ({ name: c.name, type: c.type }));
          return this.currentSchema;
        case ServerPacketId.Progress:
        case ServerPacketId.Log:
        case ServerPacketId.TableColumns:
          break;
        case ServerPacketId.Exception:
          throw packet.exception;
        default:
          throw new Error(`Unexpected packet while waiting for insert header: ${packet.id}`);
      }
    }
  }

  private async readProgress(): Promise<Progress> {
    const rev = this.serverHello!.revision;
    const progress: Progress = {
      readRows: await this.reader!.readVarint(),
      readBytes: await this.reader!.readVarint(),
      totalRowsToRead:
        rev >= REVISIONS.DBMS_MIN_REVISION_WITH_SERVER_LOGS ? await this.reader!.readVarint() : 0n,
    };
    if (rev >= REVISIONS.DBMS_MIN_REVISION_WITH_TOTAL_BYTES_TO_READ) {
      progress.totalBytesToRead = await this.reader!.readVarint();
    }
    // writtenRows/writtenBytes added between DBMS_MIN_REVISION_WITH_SERVER_LOGS and DBMS_MIN_REVISION_WITH_TOTAL_BYTES_TO_READ
    // The exact revision is 54420, which isn't in our named constants (falls in the 54401-54441 gap)
    if (rev >= 54420n) {
      progress.writtenRows = await this.reader!.readVarint();
      progress.writtenBytes = await this.reader!.readVarint();
    }
    if (rev >= REVISIONS.DBMS_MIN_PROTOCOL_VERSION_WITH_ELAPSED_NS_IN_PROGRESS) {
      progress.elapsedNs = await this.reader!.readVarint();
    }
    return progress;
  }

  private async readProfileInfo(): Promise<ProfileInfo> {
    const info: ProfileInfo = {
      rows: await this.reader!.readVarint(),
      blocks: await this.reader!.readVarint(),
      bytes: await this.reader!.readVarint(),
      appliedLimit: (await this.reader!.readU8()) !== 0,
      rowsBeforeLimit: await this.reader!.readVarint(),
      calculatedRowsBeforeLimit: (await this.reader!.readU8()) !== 0,
      appliedAggregation: false,
      rowsBeforeAggregation: 0n,
    };
    if (this.serverHello!.revision >= REVISIONS.DBMS_MIN_REVISION_WITH_APPLIED_AGGREGATION) {
      info.appliedAggregation = (await this.reader!.readU8()) !== 0;
      info.rowsBeforeAggregation = await this.reader!.readVarint();
    }
    return info;
  }

  private parseLogBlock(batch: RecordBatch): LogEntry[] {
    const entries: LogEntry[] = [];
    for (const row of batch) {
      entries.push({
        time: row.event_time as string,
        timeMicroseconds: row.event_time_microseconds as number,
        hostName: row.host_name as string,
        queryId: row.query_id as string,
        threadId: row.thread_id as bigint,
        priority: row.priority as number,
        source: row.source as string,
        text: row.text as string,
      });
    }
    return entries;
  }

  private createAccumulators() {
    return {
      progress: {
        readRows: 0n,
        readBytes: 0n,
        totalRowsToRead: 0n,
        totalBytesToRead: 0n,
        writtenRows: 0n,
        writtenBytes: 0n,
        elapsedNs: 0n,
        percent: 0,
        memoryUsage: 0n,
        peakMemoryUsage: 0n,
        cpuTimeMicroseconds: 0n,
        cpuUsage: 0,
      } as AccumulatedProgress,
      profileEvents: new Map<string, bigint>(),
    };
  }

  private snapshotProgress(progress: AccumulatedProgress): AccumulatedProgress {
    return { ...progress };
  }

  private accumulateProgress(progress: Progress, accumulated: AccumulatedProgress): void {
    accumulated.readRows += progress.readRows;
    accumulated.readBytes += progress.readBytes;
    accumulated.totalRowsToRead += progress.totalRowsToRead;
    accumulated.totalBytesToRead += progress.totalBytesToRead ?? 0n;
    accumulated.writtenRows += progress.writtenRows ?? 0n;
    accumulated.writtenBytes += progress.writtenBytes ?? 0n;
    accumulated.elapsedNs += progress.elapsedNs ?? 0n;
  }

  private processProfileEventsBlock(
    batch: RecordBatch,
    profileEventsAccumulated: Map<string, bigint>,
    progressAccumulated: AccumulatedProgress,
  ): void {
    const nameCol = batch.getColumn("name");
    const valueCol = batch.getColumn("value");
    const typeCol = batch.getColumn("type");
    const threadIdCol = batch.getColumn("thread_id");
    if (!nameCol || !valueCol || !typeCol) return;

    for (let i = 0; i < batch.rowCount; i++) {
      const name = nameCol.get(i) as string;
      const value = valueCol.get(i) as bigint;
      const eventType = typeCol.get(i) as string;
      const threadId = threadIdCol ? (threadIdCol.get(i) as bigint) : 0n;

      if (eventType === "increment") {
        profileEventsAccumulated.set(name, (profileEventsAccumulated.get(name) ?? 0n) + value);
      } else {
        profileEventsAccumulated.set(name, value);
      }

      // Extract memory/CPU metrics for query-level aggregates only
      if (threadId === 0n) {
        switch (name) {
          case "MemoryTrackerUsage":
            progressAccumulated.memoryUsage = value;
            break;
          case "MemoryTrackerPeakUsage":
            if (value > progressAccumulated.peakMemoryUsage) {
              progressAccumulated.peakMemoryUsage = value;
            }
            break;
          case "UserTimeMicroseconds":
          case "SystemTimeMicroseconds":
            if (eventType === "increment") {
              progressAccumulated.cpuTimeMicroseconds += value;
            }
            break;
        }
      }
    }

    // Recalculate CPU usage
    if (progressAccumulated.elapsedNs > 0n) {
      const elapsedMicros = progressAccumulated.elapsedNs / 1000n;
      progressAccumulated.cpuUsage =
        elapsedMicros > 0n
          ? Number(progressAccumulated.cpuTimeMicroseconds) / Number(elapsedMicros)
          : 0;
    }
  }

  private async decodeNativePayload(
    readNextChunk: () => Promise<Uint8Array | null>,
    options: { clientVersion: number },
    afterDecode?: (bytesConsumed: number) => void,
  ): Promise<RecordBatch> {
    const debug = this.options.debug;
    const start = debug ? performance.now() : 0;
    const buffer = new BlockBuffer();
    const reader = new BufferReader(buffer.view, 0, options);
    let partial: PartialBlockState | undefined;
    let chunksRead = 0;
    let readTimeMs = 0;
    let decodeTimeMs = 0;
    let resumedFromCol = -1;

    while (true) {
      const readStart = debug ? performance.now() : 0;
      const chunk = await readNextChunk();
      if (!chunk) throw new Error("EOF while decoding Native block");
      if (debug) readTimeMs += performance.now() - readStart;
      chunksRead++;
      buffer.append(chunk);
      reader.replaceBuffer(buffer.view);
      if (!partial) reader.offset = 0;

      const decodeStart = debug ? performance.now() : 0;
      try {
        const result = decodeNativeBlockWithReader(reader, options, partial);
        if (debug) {
          decodeTimeMs += performance.now() - decodeStart;
          result.decodeTimeMs = performance.now() - start;
          if (chunksRead > 1) {
            const resumeInfo = resumedFromCol >= 0 ? ` resumed@col${resumedFromCol}` : "";
            this.log(
              `block: ${chunksRead} chunks, ${buffer.available} bytes, ` +
                `read=${readTimeMs.toFixed(1)}ms decode=${decodeTimeMs.toFixed(1)}ms${resumeInfo}`,
            );
          }
        } else {
          result.decodeTimeMs = performance.now() - decodeStart;
        }
        afterDecode?.(result.bytesConsumed);
        return RecordBatch.from(result);
      } catch (err) {
        if (debug) decodeTimeMs += performance.now() - decodeStart;
        if (err instanceof BlockUnderflowError) {
          partial = err.partial;
          resumedFromCol = partial.nextColIndex;
          continue;
        }
        if (err instanceof BufferUnderflowError) {
          partial = undefined;
          reader.offset = 0;
          continue;
        }
        throw err;
      }
    }
  }

  private async readBlock(compressed: boolean = false): Promise<RecordBatch> {
    // Block name is always raw TCP framing; only the Native block payload may be compressed.
    await this.reader!.readString();

    const options = { clientVersion: Number(this.serverHello!.revision) };

    if (compressed) {
      return this.decodeNativePayload(() => this.reader!.readCompressedBlock(), options);
    }

    let firstRead = true;
    return this.decodeNativePayload(
      async () => {
        if (firstRead) {
          firstRead = false;
          const buffered = this.reader!.peekAll();
          if (buffered.length > 0) return buffered;
        }
        return this.reader!.nextChunk();
      },
      options,
      (bytesConsumed) => this.reader!.consume(bytesConsumed),
    );
  }

  /** Read one server packet, fully consuming its payload off the wire. */
  private async readServerPacket(useCompression: boolean): Promise<WirePacket> {
    const id = Number(await this.reader!.readVarint());
    switch (id) {
      case ServerPacketId.Data:
        return { id: ServerPacketId.Data, batch: await this.readBlock(useCompression) };
      case ServerPacketId.Totals:
        return { id: ServerPacketId.Totals, batch: await this.readBlock(useCompression) };
      case ServerPacketId.Extremes:
        return { id: ServerPacketId.Extremes, batch: await this.readBlock(useCompression) };
      case ServerPacketId.ProfileEvents:
        // Always uncompressed (diagnostic metadata)
        return { id: ServerPacketId.ProfileEvents, batch: await this.readBlock(false) };
      case ServerPacketId.Log:
        // Always uncompressed (diagnostic metadata)
        return { id: ServerPacketId.Log, batch: await this.readBlock(false) };
      case ServerPacketId.Progress:
        return { id: ServerPacketId.Progress, progress: await this.readProgress() };
      case ServerPacketId.ProfileInfo:
        return { id: ServerPacketId.ProfileInfo, info: await this.readProfileInfo() };
      case ServerPacketId.Exception:
        return { id: ServerPacketId.Exception, exception: await this.reader!.readException() };
      case ServerPacketId.TimezoneUpdate: {
        this.sessionTimezone = await this.reader!.readString();
        return { id: ServerPacketId.TimezoneUpdate, timezone: this.sessionTimezone };
      }
      case ServerPacketId.TableColumns:
        await this.reader!.readString();
        await this.reader!.readString();
        return { id: ServerPacketId.TableColumns };
      case ServerPacketId.EndOfStream:
        return { id: ServerPacketId.EndOfStream };
      case ServerPacketId.Pong:
        return { id: ServerPacketId.Pong };
      default:
        throw new Error(`Unknown packet ID: ${id}. Cannot proceed.`);
    }
  }

  // TODO: we should make the use flattened v3 setting automatically enabled until we support the other dynamic encodings
  query(sql: string, options: QueryOptions = {}): CollectableAsyncGenerator<Packet> {
    return collectable(this.queryImpl(sql, options));
  }

  private async *queryImpl(sql: string, options: QueryOptions = {}): AsyncGenerator<Packet> {
    this.ensureConnected();
    const { settings = {}, signal } = options;
    if (signal?.aborted) throw createAbortError("Query aborted before start");
    if (this.busy)
      throw new Error("Connection busy - cannot run concurrent operations on the same TcpClient");
    this.busy = true;

    const useCompression = !!this.options.compression;
    const compression = this.options.compression || "lz4";
    const queryTimeout = this.options.queryTimeout ?? 30000;
    const cancelGracePeriod = this.options.cancelGracePeriodMs ?? 2000;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let graceTimeoutId: ReturnType<typeof setTimeout> | null = null;
    let timedOut = false;
    let cancelled = false;

    let reachedEndOfStream = false;
    let receivedException = false;

    const startTimeout = () => {
      if (queryTimeout > 0) {
        timeoutId = setTimeout(() => {
          timedOut = true;
          // First try graceful cancel
          if (this.socket && !cancelled) {
            cancelled = true;
            this.socket!.write(this.writer.encodeCancel());
          }
          // Give server grace period to respond, then force close
          graceTimeoutId = setTimeout(() => {
            if (timedOut) {
              this.socket?.destroy();
            }
          }, cancelGracePeriod);
        }, queryTimeout);
      }
    };

    const clearQueryTimeout = () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      if (graceTimeoutId) {
        clearTimeout(graceTimeoutId);
        graceTimeoutId = null;
      }
    };

    const abortHandler = () => {
      if (!cancelled && this.socket) {
        cancelled = true;
        this.socket!.write(this.writer.encodeCancel());
      }
    };

    const throwIfAborted = () => {
      if (signal?.aborted) {
        throw createAbortError("Query aborted");
      }
    };
    const throwIfTimedOut = () => {
      if (timedOut) {
        throw new Error(`Query timeout after ${queryTimeout}ms`);
      }
    };

    signal?.addEventListener("abort", abortHandler);
    throwIfAborted();

    try {
      // The compression flag in the query packet enables bidirectional compression:
      // - When 1: client sends compressed Data blocks, server sends compressed Data blocks
      // - When 0: both sides send uncompressed
      // Settings merge order: hardcoded < client defaults < per-call overrides
      const baseSettings: ClickHouseSettings = {
        ...this.defaultSettings,
        ...settings,
      };
      const queryPacket = this.writer.encodeQuery(
        options.queryId ?? randomUUID(),
        sql,
        this.serverHello!.revision,
        baseSettings,
        useCompression,
        options.params ?? {},
      );
      this.log(
        `[query] sending query packet (${queryPacket.length} bytes), compression=${useCompression}`,
      );
      this.socket!.write(queryPacket);
      throwIfAborted();

      // Send external tables if provided
      if (options.externalTables) {
        await this.sendExternalTables(options.externalTables, useCompression, compression);
      }
      throwIfAborted();

      // Send delimiter (compressed if compression is enabled)
      const delimiter = this.writer.encodeData(
        "",
        0,
        [],
        this.serverHello!.revision,
        useCompression,
        compression,
      );
      this.log(
        `[query] sending delimiter (${delimiter.length} bytes, compressed=${useCompression})`,
      );
      this.socket!.write(delimiter);
      startTimeout();
      throwIfAborted();

      this.currentSchema = null;
      this.log(`[query] waiting for response...`);

      const { progress: progressAccumulated, profileEvents: profileEventsAccumulated } =
        this.createAccumulators();

      while (true) {
        throwIfAborted();
        throwIfTimedOut();
        const packet = await this.readServerPacket(useCompression);
        this.log(`[query] packetId=${packet.id}, useCompression=${useCompression}`);

        // Terminal packets win over a concurrently-fired abort: the server
        // already finished (or failed) the query, so report that outcome.
        if (packet.id === ServerPacketId.EndOfStream) {
          reachedEndOfStream = true;
          yield { type: "EndOfStream" };
          return;
        }
        if (packet.id === ServerPacketId.Exception) {
          receivedException = true;
          throw packet.exception;
        }
        throwIfAborted();
        throwIfTimedOut();

        switch (packet.id) {
          case ServerPacketId.Data: {
            const batch = packet.batch;
            this.log(`[query] got Data block with ${batch.rowCount} rows`);
            if (this.currentSchema === null) {
              this.currentSchema = batch.columns.map((c) => ({ name: c.name, type: c.type }));
            }
            if (batch.rowCount > 0) {
              yield { type: "Data", batch };
            }
            break;
          }
          case ServerPacketId.Progress: {
            const progress = packet.progress;
            this.accumulateProgress(progress, progressAccumulated);
            // Calculate percent for queries (based on read progress)
            const progressDenom =
              progressAccumulated.readRows > progressAccumulated.totalRowsToRead
                ? progressAccumulated.readRows
                : progressAccumulated.totalRowsToRead;
            progressAccumulated.percent =
              progressDenom > 0n
                ? Number((progressAccumulated.readRows * 100n) / progressDenom)
                : 0;
            yield {
              type: "Progress",
              progress,
              accumulated: this.snapshotProgress(progressAccumulated),
            };
            break;
          }
          case ServerPacketId.ProfileInfo:
            yield { type: "ProfileInfo", info: packet.info };
            break;
          case ServerPacketId.ProfileEvents: {
            this.processProfileEventsBlock(
              packet.batch,
              profileEventsAccumulated,
              progressAccumulated,
            );
            yield {
              type: "ProfileEvents",
              batch: packet.batch,
              accumulated: new Map(profileEventsAccumulated),
            };
            break;
          }
          case ServerPacketId.Totals:
            yield { type: "Totals", batch: packet.batch };
            break;
          case ServerPacketId.Extremes:
            yield { type: "Extremes", batch: packet.batch };
            break;
          case ServerPacketId.Log:
            if (packet.batch.rowCount > 0) {
              yield { type: "Log", entries: this.parseLogBlock(packet.batch) };
            }
            break;
          case ServerPacketId.TimezoneUpdate:
            this.log(`[query] timezone updated to: ${packet.timezone}`);
            break;
          default:
            throw new Error(`Unexpected packet ID during query: ${packet.id}`);
        }
      }
    } catch (err: any) {
      if (err?.name === "AbortError") {
        throw err;
      }
      if (
        timedOut &&
        (err.message === "Premature close" || err.code === "ERR_STREAM_PREMATURE_CLOSE")
      ) {
        throw new Error(`Query timeout after ${queryTimeout}ms`);
      }
      throw err;
    } finally {
      // If generator was abandoned early (before EndOfStream), drain remaining packets
      // to keep the connection in a clean state for subsequent queries.
      // Skip draining if we received an exception - server sends nothing after exception.
      if (!reachedEndOfStream && !receivedException && this.socket && this.reader) {
        try {
          if (!cancelled) {
            cancelled = true;
            await this.writeWithBackpressure(this.writer.encodeCancel());
          }
          await this.drainPackets(useCompression);
        } catch (err) {
          // Drain failed - connection is in unknown state, close it to prevent corruption
          this.log(
            `[query] drain failed, closing connection: ${err instanceof Error ? err.message : err}`,
          );
          this.close();
        }
      }
      this.busy = false;
      clearQueryTimeout();
      signal?.removeEventListener("abort", abortHandler);
    }
  }

  /** Encode a RecordBatch as a Data packet with the given table name. */
  private encodeBatchAsDataPacket(
    tableName: string,
    batch: RecordBatch,
    compress: boolean,
    compression: Compression,
  ): Uint8Array {
    const encodedColumns = [];
    for (let i = 0; i < batch.columns.length; i++) {
      const colDef = batch.columns[i];
      const colData = batch.columnData[i];
      const codec = getCodec(colDef.type);
      const writer = new BufferWriter();
      codec.writePrefix?.(writer, colData);
      writer.write(codec.encode(colData));
      encodedColumns.push({ name: colDef.name, type: colDef.type, data: writer.finish() });
    }
    return this.writer.encodeData(
      tableName,
      batch.rowCount,
      encodedColumns,
      this.serverHello!.revision,
      compress,
      compression,
    );
  }

  /** Send external tables as Data packets before the query delimiter. */
  private async sendExternalTables(
    tables: Record<string, ExternalTableData>,
    compress: boolean,
    compression: Compression,
  ): Promise<void> {
    for (const [name, data] of Object.entries(tables)) {
      if (data instanceof RecordBatch) {
        const packet = this.encodeBatchAsDataPacket(name, data, compress, compression);
        await this.writeWithBackpressure(packet);
      } else if (Symbol.asyncIterator in data) {
        for await (const batch of data as AsyncIterable<RecordBatch>) {
          const packet = this.encodeBatchAsDataPacket(name, batch, compress, compression);
          await this.writeWithBackpressure(packet);
        }
      } else {
        for (const batch of data as Iterable<RecordBatch>) {
          const packet = this.encodeBatchAsDataPacket(name, batch, compress, compression);
          await this.writeWithBackpressure(packet);
        }
      }
    }
  }

  /** Drain remaining packets until EndOfStream or Exception. Used when query is abandoned early. */
  private async drainPackets(useCompression: boolean): Promise<void> {
    if (!this.reader) return;
    const timer = setTimeout(() => {
      this.socket?.destroy(new Error("Drain timeout"));
    }, 5000);
    try {
      while (true) {
        const packet = await this.readServerPacket(useCompression);
        if (packet.id === ServerPacketId.EndOfStream) return;
        if (packet.id === ServerPacketId.Exception) {
          this.log(`Exception during drain: ${packet.exception.message}`);
          return;
        }
        // All other packets: payload already consumed, keep draining.
      }
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Send a ping packet and wait for pong response.
   * Useful for checking connection health.
   */
  async ping(): Promise<void> {
    this.ensureConnected();
    if (this.busy) {
      throw new Error("Connection busy - cannot ping during an active operation");
    }
    this.busy = true;
    try {
      await this.writeWithBackpressure(this.writer.encodePing());
      const packet = await this.readServerPacket(false);
      if (packet.id !== ServerPacketId.Pong) {
        throw new Error(`Expected Pong (4), got packet ${packet.id}`);
      }
    } finally {
      this.busy = false;
    }
  }

  private startKeepAliveTimer(): void {
    const interval = this.options.keepAliveIntervalMs;
    if (interval && interval > 0 && this.socket) {
      // Use TCP-level keep-alive - this is the proper way to maintain connections
      // The interval is in milliseconds, setKeepAlive expects milliseconds for initialDelay
      this.socket.setKeepAlive(true, interval);
    }
  }

  close() {
    this.busy = false;
    this.socket?.destroy();
    this.socket = null;
  }

  /**
   * Async disposable support for "await using" syntax.
   * Automatically closes connection when scope exits.
   */
  async [Symbol.asyncDispose](): Promise<void> {
    this.close();
  }

  /**
   * Static factory that connects and returns a disposable client.
   * Usage: await using client = await TcpClient.connect(options);
   */
  // biome-ignore lint/suspicious/useAdjacentOverloadSignatures: static factory, not an overload
  static async connect(
    options: TcpClientOptions,
    connectOptions: { signal?: AbortSignal } = {},
  ): Promise<TcpClient> {
    const client = new TcpClient(options);
    await client.connect(connectOptions);
    return client;
  }
}
