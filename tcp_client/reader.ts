import type * as net from "node:net";
import { decodeBlock, readUInt32LE } from "../compression.ts";
import { BufferUnderflowError, Compression, readVarInt64, TEXT_DECODER } from "../native/index.ts";
import { ClickHouseException } from "./types.ts";

/**
 * A streaming byte reader for raw TCP packet framing.
 * Data block payloads may be compressed, but those are read explicitly with readCompressedBlock().
 *
 * The socket is consumed eagerly via 'data' events (flowing mode) so the kernel
 * receive buffer stays drained while the decoder works. Pulling through the
 * stream async iterator instead (paused mode) stops kernel reads every time the
 * stream buffers one highWaterMark (~64KB); on high-latency links that churn
 * keeps the TCP receive window from growing and caps throughput at roughly one
 * receive buffer per round trip.
 *
 * If the consumer falls behind and unread data exceeds PAUSE_THRESHOLD, the
 * socket is paused until the buffer drains below half the threshold, so
 * backpressure still reaches the server for genuinely slow consumers.
 */
export class StreamingReader {
  private static MAX_COMPRESSED_BLOCK_SIZE = 128 * 1024 * 1024; // 128 MiB
  private static PAUSE_THRESHOLD = 16 * 1024 * 1024;
  private static MIN_CAPACITY = 64 * 1024;

  private socket: net.Socket;
  private buffer = new Uint8Array(StreamingReader.MIN_CAPACITY);
  /** Read cursor into buffer. */
  private offset = 0;
  /** End of valid data in buffer. */
  private end = 0;
  /** Bytes before this index were already handed out via peekAll()/nextChunk(). */
  private returnedEnd = 0;
  private done = false;
  private error: Error | null = null;
  private wake: (() => void) | null = null;
  private pausedByUs = false;

  constructor(socket: net.Socket) {
    this.socket = socket;
    socket.on("data", (chunk: Uint8Array) => {
      this.append(chunk);
      if (this.available >= StreamingReader.PAUSE_THRESHOLD && !this.pausedByUs) {
        this.pausedByUs = true;
        socket.pause();
      }
      this.wakeWaiter();
    });
    const finish = () => {
      this.done = true;
      this.wakeWaiter();
    };
    socket.on("end", finish);
    // 'close' without 'end' (destroy, reset) must also unblock pending reads.
    socket.on("close", finish);
    socket.on("error", (err: Error) => {
      this.error = err;
      this.wakeWaiter();
    });
  }

  private get available(): number {
    return this.end - this.offset;
  }

  private append(chunk: Uint8Array): void {
    if (chunk.length === 0) return;
    if (this.end + chunk.length > this.buffer.length) {
      this.realloc(chunk.length);
    }
    this.buffer.set(chunk, this.end);
    this.end += chunk.length;
  }

  /**
   * Move unread bytes to a fresh buffer with headroom for `incoming` more.
   * Always a fresh allocation, never compaction in place: views handed out by
   * peekAll()/nextChunk()/readCompressedBlock() must keep their bytes.
   * Sizing from current unread data (not previous capacity) lets the buffer
   * shrink back after an unusually large block.
   */
  private realloc(incoming: number): void {
    const unread = this.available;
    const capacity = Math.max(StreamingReader.MIN_CAPACITY, (unread + incoming) * 2);
    const next = new Uint8Array(capacity);
    next.set(this.buffer.subarray(this.offset, this.end));
    this.buffer = next;
    this.returnedEnd = Math.max(this.returnedEnd - this.offset, 0);
    this.end = unread;
    this.offset = 0;
  }

  private wakeWaiter(): void {
    const wake = this.wake;
    if (wake) {
      this.wake = null;
      wake();
    }
  }

  /** Wait for more data, EOF, or error. Callers re-check state after resolution. */
  private waitForMore(): Promise<void> {
    if (this.wake) {
      throw new Error("Concurrent read on StreamingReader");
    }
    // About to sleep: reading must continue even past the pause threshold, or
    // waiting for a span larger than the threshold would deadlock.
    this.resume();
    return new Promise((resolve) => {
      this.wake = resolve;
    });
  }

  private resume(): void {
    if (this.pausedByUs) {
      this.pausedByUs = false;
      this.socket.resume();
    }
  }

  private advance(n: number): void {
    this.offset += n;
    if (this.pausedByUs && this.available < StreamingReader.PAUSE_THRESHOLD / 2) {
      this.resume();
    }
  }

  /** Throws on socket error, returns false on EOF, otherwise waits for new data. */
  private async waitOrEnd(): Promise<boolean> {
    if (this.error) throw this.error;
    if (this.done) return false;
    await this.waitForMore();
    return true;
  }

  private async ensure(n: number): Promise<void> {
    while (this.available < n) {
      if (!(await this.waitOrEnd())) {
        throw new Error(
          `Unexpected end of stream: needed ${n} bytes, only ${this.available} available`,
        );
      }
    }
  }

  consume(n: number): void {
    if (n > this.available) {
      throw new Error(`Cannot consume ${n} bytes, only ${this.available} available`);
    }
    this.advance(n);
  }

  /**
   * All currently buffered unread bytes. Marks them as handed out: a following
   * nextChunk() resolves only once bytes beyond these arrive.
   */
  peekAll(): Uint8Array {
    this.returnedEnd = this.end;
    return this.buffer.subarray(this.offset, this.end);
  }

  /** Buffered bytes not yet handed out by peekAll()/nextChunk(), or null on EOF. */
  async nextChunk(): Promise<Uint8Array | null> {
    while (this.end <= this.returnedEnd) {
      if (!(await this.waitOrEnd())) return null;
    }
    const chunk = this.buffer.subarray(this.returnedEnd, this.end);
    this.returnedEnd = this.end;
    return chunk;
  }

  async readVarint(): Promise<bigint> {
    while (true) {
      const cursor = { offset: this.offset };
      try {
        const val = readVarInt64(this.buffer.subarray(0, this.end), cursor);
        this.advance(cursor.offset - this.offset);
        return val;
      } catch (err) {
        if (err instanceof BufferUnderflowError) {
          if (!(await this.waitOrEnd())) {
            throw new Error("Connection closed unexpectedly while reading response");
          }
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
    this.advance(len);
    return str;
  }

  async readU8(): Promise<number> {
    await this.ensure(1);
    const val = this.buffer[this.offset]!;
    this.advance(1);
    return val;
  }

  async readInt32LE(): Promise<number> {
    await this.ensure(4);
    const view = new DataView(this.buffer.buffer, this.buffer.byteOffset + this.offset, 4);
    this.advance(4);
    return view.getInt32(0, true);
  }

  async readU64LE(): Promise<bigint> {
    await this.ensure(8);
    const view = new DataView(this.buffer.buffer, this.buffer.byteOffset + this.offset, 8);
    this.advance(8);
    return view.getBigUint64(0, true);
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
    await this.ensure(Compression.FULL_HEADER_SIZE);
    // Frame layout: 16-byte checksum, 1-byte method, u32 size counting the
    // 9-byte header plus the compressed payload, u32 decompressed size.
    const compressedSizeWithHeader = readUInt32LE(
      this.buffer,
      this.offset + Compression.CHECKSUM_SIZE + 1,
    );
    const dataSize = compressedSizeWithHeader - Compression.HEADER_SIZE;
    if (dataSize < 0 || dataSize > StreamingReader.MAX_COMPRESSED_BLOCK_SIZE) {
      throw new Error(`Invalid compressed block size: ${compressedSizeWithHeader}`);
    }
    const frameSize = Compression.CHECKSUM_SIZE + compressedSizeWithHeader;
    await this.ensure(frameSize);
    const frame = this.buffer.subarray(this.offset, this.offset + frameSize);
    const decoded = decodeBlock(frame);
    this.advance(frameSize);
    return decoded;
  }
}
