/**
 * Native format encoder/decoder for ClickHouse.
 *
 * Native is ClickHouse's columnar wire format - data doesn't need row-to-column
 * conversion on the server.
 *
 * Note: Only Dynamic/JSON V3 format is supported at present. For ClickHouse 25.6+, enable
 * `output_format_native_use_flattened_dynamic_and_json_serialization` setting.
 */

import { getCodec } from "./codecs.ts";
import { type Column, DataColumn, EnumColumn } from "./columns.ts";
import { BlockInfoField } from "./constants.ts";
import { BlockBuffer, BufferReader, BufferUnderflowError, BufferWriter } from "./io.ts";
import { collectRows, rows } from "./rows.ts";
import {
  DEFAULT_DENSE_NODE,
  type DeserializerState,
  type SerializationNode,
} from "./serialization.ts";
import {
  batchFromCols,
  batchFromRows,
  type ExternalTableData,
  type MaterializeOptions,
  RecordBatch,
  type Row,
  validateColumnLengths,
} from "./table.ts";
import type { ColumnDef, DecodeOptions } from "./types.ts";

// Re-export types for public API
export {
  ClickHouseDateTime64,
  type ColumnDef,
  type DecodeOptions,
  DynamicValue,
  TEXT_DECODER,
} from "./types.ts";

// Re-export table helpers / types
export { type Column, RecordBatch, type Row, type MaterializeOptions, EnumColumn };
export { batchFromRows, batchFromCols, type ExternalTableData };
export { rows, collectRows };
export { getCodec, SQL_NULL } from "./codecs.ts";
// Re-export constants needed by tcp_client
export { BlockInfoField, Compression } from "./constants.ts";
// Re-export IO utilities needed by tcp_client
export {
  BlockBuffer,
  BufferReader,
  BufferUnderflowError,
  BufferWriter,
  readVarInt64,
} from "./io.ts";

export interface Block {
  columns: ColumnDef[];
  columnData: Column[];
  rowCount: number;
  decodeTimeMs?: number;
}

interface BlockResult extends Block {
  bytesConsumed: number;
  isEndMarker: boolean;
}

/**
 * Partial decode state for resumable decoding.
 * When underflow occurs mid-block, this captures completed columns
 * so retry can resume without re-parsing them.
 */
export interface PartialBlockState {
  columns: ColumnDef[];
  columnData: Column[];
  numCols: number;
  numRows: number;
  nextColIndex: number;
  resumeOffset: number;
  startOffset: number;
}

/**
 * Thrown when block decode runs out of data mid-parse.
 * Contains partial state to enable resumable decoding.
 */
export class BlockUnderflowError extends BufferUnderflowError {
  readonly partial: PartialBlockState;

  constructor(message: string, partial: PartialBlockState) {
    super(message);
    this.name = "BlockUnderflowError";
    this.partial = partial;
  }
}

/**
 * Decode a single Native format block using an existing BufferReader.
 * Supports resumable decoding: pass partial state from previous underflow to continue.
 * Throws BlockUnderflowError with partial state if more data is needed.
 */
export function decodeNativeBlockWithReader(
  reader: BufferReader,
  options?: DecodeOptions,
  partial?: PartialBlockState,
): BlockResult {
  const clientVersion = options?.clientVersion ?? 0;
  const startOffset = partial?.startOffset ?? reader.offset;
  let numCols: number;
  let numRows: number;
  let columns: ColumnDef[];
  let columnData: Column[];
  let startColIndex: number;

  if (partial) {
    // Resume from checkpoint
    numCols = partial.numCols;
    numRows = partial.numRows;
    columns = partial.columns;
    columnData = partial.columnData;
    startColIndex = partial.nextColIndex;
    reader.offset = partial.resumeOffset;
  } else {
    // Fresh decode - parse header
    if (clientVersion > 0) {
      while (true) {
        const fieldId = reader.readVarint();
        if (fieldId === BlockInfoField.End) break;
        if (fieldId === BlockInfoField.IsOverflows)
          reader.offset += 1; // is_overflows
        else if (fieldId === BlockInfoField.BucketNum) reader.offset += 4; // bucket_num
      }
    }

    numCols = reader.readVarint();
    numRows = reader.readVarint();

    // Empty block signals end of data
    if (numCols === 0 && numRows === 0) {
      return {
        columns: [],
        columnData: [],
        rowCount: 0,
        bytesConsumed: reader.offset - startOffset,
        isEndMarker: true,
      };
    }

    columns = [];
    columnData = [];
    startColIndex = 0;
  }

  // Native format: per-column [name, type, [has_custom, [kinds...]], prefix, data]
  for (let i = startColIndex; i < numCols; i++) {
    // Checkpoint: offset before parsing this column
    const colStartOffset = reader.offset;

    try {
      const name = reader.readString();
      const type = reader.readString();
      columns.push({ name, type });

      const codec = getCodec(type);

      let serNode: SerializationNode = DEFAULT_DENSE_NODE;
      if (clientVersion >= 54454) {
        const hasCustomSerialization = reader.readU8() !== 0;
        if (hasCustomSerialization) {
          serNode = codec.readKinds(reader);
        }
      }

      const state: DeserializerState = { serNode, sparseRuntime: new Map() };
      // Only read prefix and decode when there are rows - empty blocks are schema-only
      if (numRows > 0) {
        codec.readPrefix?.(reader);
        columnData.push(codec.decode(reader, numRows, state));
      } else {
        // Schema-only block: no prefix or data, create empty column
        columnData.push(new DataColumn(type, []));
      }
    } catch (err) {
      if (err instanceof BufferUnderflowError) {
        // Reset reader to column boundary and throw with partial state
        reader.offset = colStartOffset;
        throw new BlockUnderflowError(err.message, {
          columns: columns.slice(0, i),
          columnData: columnData.slice(0, i),
          numCols,
          numRows,
          nextColIndex: i,
          resumeOffset: colStartOffset,
          startOffset,
        });
      }
      throw err;
    }
  }

  return {
    columns,
    columnData,
    rowCount: numRows,
    bytesConsumed: reader.offset - startOffset,
    isEndMarker: false,
  };
}

/**
 * Decode a single Native format block from a buffer.
 * Returns the decoded data and the number of bytes consumed.
 * Use this for streaming scenarios where you need to track buffer position.
 */
export function decodeNativeBlock(
  data: Uint8Array,
  offset: number,
  options?: DecodeOptions,
): BlockResult {
  const reader = new BufferReader(data, offset, options);
  return decodeNativeBlockWithReader(reader, options);
}

/**
 * Encode a RecordBatch to Native format.
 */
export function encodeNative(batch: RecordBatch): Uint8Array {
  const { columns, columnData, rowCount } = batch;
  validateColumnLengths(
    columnData,
    columns.map((column) => column.name),
    rowCount,
  );

  // Estimate total size for pre-allocation
  let totalEstimate = 10; // header varints
  for (let i = 0; i < columns.length; i++) {
    const c = columns[i]!;
    totalEstimate += c.name.length + c.type.length + 10;
    totalEstimate += getCodec(c.type).estimateSize(rowCount);
  }
  const writer = new BufferWriter(Math.ceil(totalEstimate * 1.2));

  writer.writeVarint(columns.length);
  writer.writeVarint(rowCount);

  // Native format: per-column [name, type, prefix, data]
  for (let i = 0; i < columns.length; i++) {
    const colDef = columns[i]!;
    const codec = getCodec(colDef.type);
    const col = columnData[i]!;

    writer.writeString(colDef.name);
    writer.writeString(colDef.type);
    // Only write prefix and data when there are rows (matches decode behavior)
    if (rowCount > 0) {
      codec.writePrefix?.(writer, col);
      writer.write(codec.encode(col, codec.estimateSize(col.length)));
    }
  }

  return writer.finish();
}

/**
 * Stream encode RecordBatches to Native format.
 * Each yielded RecordBatch produces one Native block.
 */
export async function* streamEncodeNative(
  batches: AsyncIterable<RecordBatch>,
): AsyncGenerator<Uint8Array> {
  for await (const batch of batches) {
    yield encodeNative(batch);
  }
}

export async function* streamDecodeNative(
  chunks: AsyncIterable<Uint8Array>,
  options?: DecodeOptions & {
    debug?: boolean;
    minBufferSize?: number;
    /** Initial bytes to buffer after an underflow before retrying decode. Defaults to observed chunk size. */
    underflowRetryMinBytes?: number;
    /** Double the underflow retry wait up to this byte cap; set 0 to disable backoff. */
    underflowRetryMaxBytes?: number;
  },
): AsyncGenerator<RecordBatch> {
  const minBuffer = options?.minBufferSize ?? 64 * 1024;
  // After an underflow, wait for `retryWaitBytes` more buffered bytes before retrying,
  // doubling each retry up to `retryMaxBytes` (0 disables). Initial wait is the
  // observed chunk size (or `underflowRetryMinBytes` when set), so small blocks
  // still flush promptly while huge variable-width columns back off quickly.
  const retryMaxBytes = Math.max(0, options?.underflowRetryMaxBytes ?? 1024 * 1024);
  const retryMinBytes = options?.underflowRetryMinBytes;
  const initialRetryWait = (chunkLength: number): number =>
    retryMinBytes !== undefined
      ? Math.min(retryMinBytes, retryMaxBytes)
      : retryMaxBytes > 0
        ? Math.min(chunkLength, retryMaxBytes)
        : 0;
  const blockBuffer = new BlockBuffer(minBuffer);
  let columns: ColumnDef[] = [];
  let totalBytesReceived = 0;
  let blocksDecoded = 0;
  let underruns = 0;

  // Persistent partial state for resumable decoding across chunks.
  // When a block spans multiple chunks, BlockUnderflowError captures
  // completed columns so the retry resumes from the last column boundary
  // instead of re-parsing everything from scratch.
  let partial: PartialBlockState | undefined;
  let retryAfterAvailable = 0;
  let retryWaitBytes = 0;

  for await (const chunk of chunks) {
    blockBuffer.append(chunk);
    totalBytesReceived += chunk.length;

    while (blockBuffer.available >= 2) {
      if (retryAfterAvailable > 0 && blockBuffer.available < retryAfterAvailable) break;
      retryAfterAvailable = 0;

      const reader = new BufferReader(blockBuffer.view, 0, options);

      try {
        const block = decodeNativeBlockWithReader(reader, options, partial);
        blockBuffer.startNextBlock(block.bytesConsumed);
        partial = undefined;
        retryWaitBytes = 0;

        if (block.isEndMarker) continue;
        if (columns.length === 0) columns = block.columns;
        blocksDecoded++;
        yield RecordBatch.from({
          columns,
          columnData: block.columnData,
          rowCount: block.rowCount,
        });
      } catch (e) {
        if (!(e instanceof BufferUnderflowError)) throw e;
        if (e instanceof BlockUnderflowError) {
          // Resume from the last completed column. Reset the backoff when we've
          // made column progress (or on the first underflow for this block).
          const prevCol = partial?.nextColIndex;
          partial = e.partial;
          if (prevCol !== partial.nextColIndex || retryWaitBytes === 0)
            retryWaitBytes = initialRetryWait(chunk.length);
        } else if (retryWaitBytes === 0) {
          // Header underflow (no partial yet).
          retryWaitBytes = initialRetryWait(chunk.length);
        }
        underruns++;
        if (retryWaitBytes > 0) {
          retryAfterAvailable = blockBuffer.available + retryWaitBytes;
          retryWaitBytes = Math.min(retryWaitBytes * 2, retryMaxBytes);
        }
        break; // need more data
      }
    }
  }

  // Final: decode remaining data (no more chunks coming)
  retryAfterAvailable = 0;
  while (blockBuffer.available > 0) {
    const reader = new BufferReader(blockBuffer.view, 0, options);
    let block: ReturnType<typeof decodeNativeBlockWithReader>;
    try {
      block = decodeNativeBlockWithReader(reader, options, partial);
    } catch (e) {
      if (e instanceof BlockUnderflowError || e instanceof BufferUnderflowError) {
        // The source is done but a block is incomplete: the stream was
        // truncated (or an earlier block desynced the parser). Name the
        // condition instead of surfacing a bare buffer-underflow.
        throw new Error(
          `Native stream ended mid-block after ${blocksDecoded} blocks ` +
            `(${blockBuffer.available} unconsumed bytes, ${totalBytesReceived} received): ${e.message}`,
        );
      }
      throw e;
    }
    blockBuffer.startNextBlock(block.bytesConsumed);
    partial = undefined;

    if (block.isEndMarker) continue;
    if (columns.length === 0) columns = block.columns;
    blocksDecoded++;
    yield RecordBatch.from({
      columns,
      columnData: block.columnData,
      rowCount: block.rowCount,
    });
  }

  if (options?.debug) {
    console.log(
      `[streamDecodeNative] ${blocksDecoded} blocks, ${totalBytesReceived} bytes, ${underruns} underruns`,
    );
  }
}

/**
 * Iterate rows from RecordBatches.
 *
 * `RecordBatch` implements the iterable protocol, so you can iterate rows
 * directly from each batch yielded by `streamDecodeNative()`.
 *
 * @example
 * for await (const batch of streamDecodeNative(query(...))) {
 *   for (const row of batch) {
 *     console.log(row.id, row.name);
 *   }
 * }
 */
