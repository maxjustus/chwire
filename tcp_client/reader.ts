import type * as net from "node:net";
import {
  BufferUnderflowError,
  Compression,
  readVarInt64,
  TEXT_DECODER,
} from "@maxjustus/chwire/native";
import { decodeBlock } from "../compression.ts";
import { ClickHouseException } from "./types.ts";

/**
 * Wraps a socket's async iterator to ensure errors are propagated to pending next() calls.
 * Without this wrapper, socket errors may be emitted as events without rejecting pending reads.
 */
function createErrorPropagatingIterator(socket: net.Socket): AsyncIterator<Uint8Array> {
  const baseIterator = (socket as AsyncIterable<Uint8Array>)[Symbol.asyncIterator]();
  let pendingReject: ((err: Error) => void) | null = null;
  let socketError: Error | null = null;

  socket.on("error", (err) => {
    socketError = err;
    if (pendingReject) {
      pendingReject(err);
      pendingReject = null;
    }
  });

  return {
    async next(): Promise<IteratorResult<Uint8Array>> {
      // If socket already errored, reject immediately
      if (socketError) {
        throw socketError;
      }
      if (pendingReject) {
        throw new Error("Concurrent read on socket iterator");
      }

      // Race the base iterator with error handling
      return new Promise((resolve, reject) => {
        pendingReject = reject;
        baseIterator.next().then(
          (result) => {
            pendingReject = null;
            resolve(result);
          },
          (err) => {
            pendingReject = null;
            reject(err);
          },
        );
      });
    },
  };
}

/**
 * A streaming byte reader for raw TCP packet framing.
 * Data block payloads may be compressed, but those are read explicitly with readCompressedBlock().
 * Optimized to avoid O(N^2) copies during buffering.
 */
export class StreamingReader {
  private static MAX_COMPRESSED_BLOCK_SIZE = 128 * 1024 * 1024; // 128 MiB
  private source: AsyncIterator<Uint8Array>;
  private buffer: Uint8Array = new Uint8Array(0);
  private offset: number = 0;
  private done: boolean = false;

  constructor(socket: net.Socket) {
    this.source = createErrorPropagatingIterator(socket);
  }

  private async ensure(n: number): Promise<void> {
    while (this.buffer.length - this.offset < n) {
      if (this.done) {
        throw new Error(
          `Unexpected end of stream: needed ${n} bytes, only ${this.buffer.length - this.offset} available`,
        );
      }
      await this.pullRawChunk();
    }
  }

  private async pullRawChunk(): Promise<void> {
    const { value, done } = await this.source.next();
    if (done) {
      this.done = true;
      return;
    }
    this.feed(value);
  }

  private feed(chunk: Uint8Array) {
    if (this.offset === this.buffer.length) {
      this.buffer = chunk;
      this.offset = 0;
    } else {
      // Consolidate remaining data with new chunk.
      // For very large buffers, we might want a chunk list, but for typical
      // ClickHouse blocks, this is acceptable compared to the previous version.
      const remaining = this.buffer.length - this.offset;
      const next = new Uint8Array(remaining + chunk.length);
      next.set(this.buffer.subarray(this.offset), 0);
      next.set(chunk, remaining);
      this.buffer = next;
      this.offset = 0;
    }
  }

  async peek(n: number): Promise<Uint8Array> {
    await this.ensure(n);
    return this.buffer.subarray(this.offset, this.offset + n);
  }

  consume(n: number): void {
    if (this.offset + n > this.buffer.length) {
      throw new Error(
        `Cannot consume ${n} bytes, only ${this.buffer.length - this.offset} available`,
      );
    }
    this.offset += n;
  }

  peekAll(): Uint8Array {
    return this.buffer.subarray(this.offset);
  }

  async nextChunk(): Promise<Uint8Array | null> {
    if (this.done) return null;
    const { value, done } = await this.source.next();
    if (done) {
      this.done = true;
      return null;
    }
    this.feed(value);
    return value;
  }

  async readVarint(): Promise<bigint> {
    // Reuse shared logic by providing a cursor-like object
    while (true) {
      const cursor = { offset: this.offset };
      try {
        const val = readVarInt64(this.buffer, cursor);
        this.offset = cursor.offset;
        return val;
      } catch (err) {
        if (err instanceof BufferUnderflowError) {
          if (this.done) {
            throw new Error("Connection closed unexpectedly while reading response");
          }
          await this.pullRawChunk();
          continue;
        }
        throw err;
      }
    }
  }

  async readString(): Promise<string> {
    const len = Number(await this.readVarint());
    if (len === 0) return "";
    await this.ensure(len);
    const str = TEXT_DECODER.decode(this.buffer.subarray(this.offset, this.offset + len));
    this.offset += len;
    return str;
  }

  async readFixed(n: number): Promise<Uint8Array> {
    await this.ensure(n);
    const bytes = this.buffer.slice(this.offset, this.offset + n);
    this.offset += n;
    return bytes;
  }

  async readU8(): Promise<number> {
    await this.ensure(1);
    return this.buffer[this.offset++];
  }

  async readU32LE(): Promise<number> {
    await this.ensure(4);
    const view = new DataView(this.buffer.buffer, this.buffer.byteOffset + this.offset, 4);
    const val = view.getUint32(0, true);
    this.offset += 4;
    return val;
  }

  async readInt32LE(): Promise<number> {
    await this.ensure(4);
    const view = new DataView(this.buffer.buffer, this.buffer.byteOffset + this.offset, 4);
    const val = view.getInt32(0, true);
    this.offset += 4;
    return val;
  }

  async readU64LE(): Promise<bigint> {
    await this.ensure(8);
    const view = new DataView(this.buffer.buffer, this.buffer.byteOffset + this.offset, 8);
    const val = view.getBigUint64(0, true);
    this.offset += 8;
    return val;
  }

  async readException(): Promise<ClickHouseException> {
    const code = await this.readInt32LE();
    const name = await this.readString();
    const message = await this.readString();
    const stackTrace = await this.readString();
    const hasNested = (await this.readU8()) !== 0;
    const nested = hasNested ? await this.readException() : undefined;
    return new ClickHouseException(code, name, message, stackTrace, hasNested, nested);
  }

  async readCompressedBlock(): Promise<Uint8Array> {
    const checksum = await this.readFixed(Compression.CHECKSUM_SIZE);
    const header = await this.readFixed(Compression.HEADER_SIZE);
    const compressedData = await this.readFixed(this.compressedDataSize(header));
    return this.assembleAndDecodeBlock(checksum, header, compressedData);
  }

  private compressedDataSize(header: Uint8Array): number {
    const compressedSizeWithHeader = new DataView(
      header.buffer,
      header.byteOffset + 1,
      4,
    ).getUint32(0, true);
    const dataSize = compressedSizeWithHeader - Compression.HEADER_SIZE;
    if (dataSize < 0 || dataSize > StreamingReader.MAX_COMPRESSED_BLOCK_SIZE) {
      throw new Error(`Invalid compressed block size: ${compressedSizeWithHeader}`);
    }
    return dataSize;
  }

  private assembleAndDecodeBlock(
    checksum: Uint8Array,
    header: Uint8Array,
    compressedData: Uint8Array,
  ): Uint8Array {
    const fullBlock = new Uint8Array(Compression.FULL_HEADER_SIZE + compressedData.length);
    fullBlock.set(checksum, 0);
    fullBlock.set(header, Compression.CHECKSUM_SIZE);
    fullBlock.set(compressedData, Compression.FULL_HEADER_SIZE);
    return decodeBlock(fullBlock);
  }
}
