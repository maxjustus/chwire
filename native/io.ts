/**
 * Buffer I/O utilities for Native format encoding/decoding.
 */

import { type DecodeOptions, TEXT_DECODER, TEXT_ENCODER, type TypedArray } from "./types.ts";

/**
 * VarInt (LEB128) encoding constants.
 * VarInt encodes integers in 7-bit groups with continuation bit.
 *
 * Each byte: [C][D D D D D D D]
 *            ^  ^^^^^^^^^^^^^
 *            |  7 data bits (0x7F mask)
 *            continuation bit (0x80) - 1 = more bytes follow
 */
const VarInt = {
  // Number versions for 32-bit fast path
  /** Continuation bit (0x80) - if set, more bytes follow */
  CONT_BIT: 0x80,
  /** Data mask (0x7F) - lower 7 bits contain data */
  DATA_MASK_NUM: 0x7f,
  /** Bits of data per byte */
  BITS_PER_BYTE_NUM: 7,

  // BigInt versions for 64-bit operations
  /** Continuation bit threshold - if byte >= 0x80, more bytes follow */
  CONTINUATION_THRESHOLD: 0x80n,
  /** Data bits mask - lower 7 bits contain actual data */
  DATA_MASK: 0x7fn,
  /** Continuation bit to set on non-terminal bytes */
  CONTINUATION_BIT: 0x80n,
  /** Number of data bits per byte */
  BITS_PER_BYTE: 7n,

  /** Maximum bytes for a 64-bit VarInt (ceil(64/7) = 10) */
  MAX_BYTES_64: 10,
} as const;

/**
 * Buffer size constants.
 */
const BufferSize: {
  /** Default initial buffer size for BufferWriter (64KB) */
  DEFAULT_WRITER: number;
  /** Single-byte VarInt threshold - lengths < 128 fit in one byte */
  SINGLE_BYTE_VARINT_MAX: number;
  /** UTF-8 worst case bytes per character */
  UTF8_MAX_BYTES_PER_CHAR: number;
} = {
  DEFAULT_WRITER: 65536,
  SINGLE_BYTE_VARINT_MAX: 128,
  UTF8_MAX_BYTES_PER_CHAR: 3,
};

/**
 * Growable buffer for streaming decode. Replaces chunk array + flattenChunks().
 * Amortized O(n) vs O(n²) for many small chunks.
 */
/**
 * Growable byte buffer for framing blocks out of a chunked stream, with two
 * consumption modes for two ownership contracts:
 *
 * - `startNextBlock(bytes)` — stable: moves the unread remainder into a
 *   freshly allocated backing buffer, so zero-copy views handed out while
 *   decoding earlier blocks (typed array columns, string/UUID subarrays)
 *   are never mutated afterwards. Use when decoded views escape the loop.
 *
 * - `consume(bytes)` — amortized in-place: advances a read offset and
 *   compacts with copyWithin past 50% waste. No allocation in steady state,
 *   but ONLY safe when nothing that aliases this buffer outlives the call.
 *
 * Growth always allocates a fresh buffer (never compacts in place), so
 * escaped views stay valid across `append` in either mode.
 */
export class BlockBuffer {
  private buffer: Uint8Array;
  private readOffset = 0;
  private writeOffset = 0;
  private initialSize: number;

  constructor(initialSize = 2 * 1024 * 1024) {
    this.initialSize = initialSize;
    this.buffer = new Uint8Array(initialSize);
  }

  get available(): number {
    return this.writeOffset - this.readOffset;
  }

  get view(): Uint8Array {
    return this.buffer.subarray(this.readOffset, this.writeOffset);
  }

  append(chunk: Uint8Array): void {
    if (chunk.length === 0) return;
    this.ensureCapacity(this.writeOffset + chunk.length);
    this.buffer.set(chunk, this.writeOffset);
    this.writeOffset += chunk.length;
  }

  /** In-place consume. Only safe when no views into this buffer outlive the call. */
  consume(bytes: number): void {
    if (bytes < 0 || bytes > this.available) {
      throw new RangeError(`Invalid block consume length: ${bytes}`);
    }
    this.readOffset += bytes;
    if (this.readOffset > this.buffer.length / 2) {
      const remaining = this.writeOffset - this.readOffset;
      if (remaining > 0) {
        this.buffer.copyWithin(0, this.readOffset, this.writeOffset);
      }
      this.readOffset = 0;
      this.writeOffset = remaining;
    }
  }

  /** Stable consume: remainder moves to a fresh buffer so escaped views stay valid. */
  startNextBlock(bytesConsumed: number): void {
    if (bytesConsumed < 0 || bytesConsumed > this.available) {
      throw new RangeError(`Invalid block consume length: ${bytesConsumed}`);
    }
    const start = this.readOffset + bytesConsumed;
    const trailingLength = this.writeOffset - start;
    const next = new Uint8Array(Math.max(this.initialSize, trailingLength));
    if (trailingLength > 0) {
      next.set(this.buffer.subarray(start, this.writeOffset));
    }
    this.buffer = next;
    this.readOffset = 0;
    this.writeOffset = trailingLength;
  }

  private ensureCapacity(minCapacity: number): void {
    if (minCapacity <= this.buffer.length) return;
    let nextCapacity = this.buffer.length;
    while (nextCapacity < minCapacity) {
      nextCapacity = Math.max(nextCapacity * 2, minCapacity);
    }
    const next = new Uint8Array(nextCapacity);
    next.set(this.buffer.subarray(this.readOffset, this.writeOffset));
    this.buffer = next;
    this.writeOffset -= this.readOffset;
    this.readOffset = 0;
  }
}

export class BufferUnderflowError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BufferUnderflowError";
  }
}

export type TypedArrayConstructor<T extends TypedArray> = {
  new (length: number): T;
  new (buffer: ArrayBuffer, byteOffset: number, length: number): T;
  BYTES_PER_ELEMENT: number;
};

// --- Standalone optimized I/O functions ---

export function varIntSize(value: number | bigint): number {
  let v = BigInt(value);
  let size = 1;
  while (v >= VarInt.CONTINUATION_THRESHOLD) {
    size++;
    v >>= VarInt.BITS_PER_BYTE;
  }
  return size;
}

export function writeVarInt(buffer: Uint8Array, offset: number, value: number | bigint): number {
  let v = BigInt(value);
  let pos = offset;
  while (v >= VarInt.CONTINUATION_THRESHOLD) {
    buffer[pos++] = Number((v & VarInt.DATA_MASK) | VarInt.CONTINUATION_BIT);
    v >>= VarInt.BITS_PER_BYTE;
  }
  buffer[pos++] = Number(v);
  return pos - offset;
}

export function readVarInt(buffer: Uint8Array, cursor: { offset: number }): number {
  let result = 0,
    shift = 0;
  while (true) {
    if (cursor.offset >= buffer.length)
      throw new BufferUnderflowError("Buffer underflow reading varint");
    const byte = buffer[cursor.offset++]!;
    result |= (byte & VarInt.DATA_MASK_NUM) << shift;
    if ((byte & VarInt.CONT_BIT) === 0) break;
    shift += VarInt.BITS_PER_BYTE_NUM;
  }
  return result;
}

export function readVarInt64(buffer: Uint8Array, cursor: { offset: number }): bigint {
  let result = 0n,
    shift = 0n;
  while (true) {
    if (cursor.offset >= buffer.length)
      throw new BufferUnderflowError("Buffer underflow reading varint64");
    const byte = BigInt(buffer[cursor.offset++]!);
    result |= (byte & VarInt.DATA_MASK) << shift;
    if ((byte & VarInt.CONTINUATION_BIT) === 0n) break;
    shift += VarInt.BITS_PER_BYTE;
  }
  return result;
}

export class BufferWriter {
  private buffer: Uint8Array;
  private offset = 0;
  private view: DataView;

  constructor(initialSize = BufferSize.DEFAULT_WRITER) {
    this.buffer = new Uint8Array(initialSize);
    this.view = new DataView(this.buffer.buffer);
  }

  private ensure(bytes: number) {
    const needed = this.offset + bytes;
    if (needed <= this.buffer.length) return;
    const newSize = Math.max(this.buffer.length * 2, needed);
    const newBuffer = new Uint8Array(newSize);
    newBuffer.set(this.buffer.subarray(0, this.offset));
    this.buffer = newBuffer;
    this.view = new DataView(this.buffer.buffer);
  }

  write(chunk: Uint8Array) {
    this.ensure(chunk.length);
    this.buffer.set(chunk, this.offset);
    this.offset += chunk.length;
  }

  writeU8(v: number) {
    this.ensure(1);
    this.buffer[this.offset++] = v;
  }

  writeU32LE(v: number) {
    this.ensure(4);
    this.view.setUint32(this.offset, v, true);
    this.offset += 4;
  }

  writeU64LE(v: bigint) {
    this.ensure(8);
    this.view.setBigUint64(this.offset, v, true);
    this.offset += 8;
  }

  writeI32LE(v: number) {
    this.ensure(4);
    this.view.setInt32(this.offset, v, true);
    this.offset += 4;
  }

  writeVarint(value: number | bigint) {
    this.ensure(VarInt.MAX_BYTES_64);
    this.offset += writeVarInt(this.buffer, this.offset, value);
  }

  writeString(val: string) {
    // Worst case: UTF-8 max bytes per char + varint length prefix
    const maxLen = val.length * BufferSize.UTF8_MAX_BYTES_PER_CHAR;
    this.ensure(maxLen + VarInt.MAX_BYTES_64);

    // Reserve 1 byte for length (common case: strings < 128 bytes)
    const { written } = TEXT_ENCODER.encodeInto(
      val,
      this.buffer.subarray(this.offset + 1, this.offset + 1 + maxLen),
    );

    if (written < BufferSize.SINGLE_BYTE_VARINT_MAX) {
      this.buffer[this.offset] = written;
      this.offset += 1 + written;
    } else {
      // Multi-byte varint: shift the encoded string
      const vSize = varIntSize(written);
      this.buffer.copyWithin(this.offset + vSize, this.offset + 1, this.offset + 1 + written);
      writeVarInt(this.buffer, this.offset, written);
      this.offset += vSize + written;
    }
  }

  reset() {
    this.offset = 0;
  }

  finish(): Uint8Array {
    return this.buffer.subarray(0, this.offset);
  }
}

export class BufferReader {
  buffer: Uint8Array;
  offset: number;
  view: DataView;
  options?: DecodeOptions;

  constructor(buffer: Uint8Array, offset = 0, options?: DecodeOptions) {
    this.buffer = buffer;
    this.offset = offset;
    this.view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    if (options !== undefined) this.options = options;
  }

  readVarint(): number {
    return readVarInt(this.buffer, this);
  }

  readVarInt64(): bigint {
    return readVarInt64(this.buffer, this);
  }

  readString(): string {
    const len = this.readVarint();
    this.ensureAvailable(len);
    const start = this.offset;
    this.offset += len;
    // TextDecoder has a high fixed cost per call; short ASCII strings (the
    // common case for row data) decode ~2.5x faster char by char.
    if (len <= 64) {
      const buffer = this.buffer;
      const end = start + len;
      let str = "";
      for (let i = start; i < end; i++) {
        const code = buffer[i]!;
        if (code > 127) return TEXT_DECODER.decode(buffer.subarray(start, end));
        str += String.fromCharCode(code);
      }
      return str;
    }
    return TEXT_DECODER.decode(this.buffer.subarray(start, start + len));
  }

  // Zero-copy if aligned, copy otherwise
  readTypedArray<T extends TypedArray>(Ctor: TypedArrayConstructor<T>, count: number): T {
    const elementSize = Ctor.BYTES_PER_ELEMENT;
    const byteLength = count * elementSize;
    this.ensureAvailable(byteLength);
    const currentOffset = this.buffer.byteOffset + this.offset;

    let res: T;
    if (currentOffset % elementSize === 0) {
      res = new Ctor(this.buffer.buffer as ArrayBuffer, currentOffset, count);
    } else {
      const copy = new Uint8Array(this.buffer.subarray(this.offset, this.offset + byteLength));
      res = new Ctor(copy.buffer as ArrayBuffer, 0, count);
    }
    this.offset += byteLength;
    return res;
  }

  readBytes(length: number): Uint8Array {
    this.ensureAvailable(length);
    const res = this.buffer.subarray(this.offset, this.offset + length);
    this.offset += length;
    return res;
  }

  ensureAvailable(bytes: number): void {
    if (this.offset + bytes > this.buffer.length) {
      throw new BufferUnderflowError(
        `Need ${bytes} bytes at offset ${this.offset}, only ${this.buffer.length - this.offset} available`,
      );
    }
  }

  readU8(): number {
    this.ensureAvailable(1);
    return this.buffer[this.offset++]!;
  }

  readU32LE(): number {
    this.ensureAvailable(4);
    const val = this.view.getUint32(this.offset, true);
    this.offset += 4;
    return val;
  }

  readU64LE(): bigint {
    this.ensureAvailable(8);
    const val = this.view.getBigUint64(this.offset, true);
    this.offset += 8;
    return val;
  }

  readI32LE(): number {
    this.ensureAvailable(4);
    const val = this.view.getInt32(this.offset, true);
    this.offset += 4;
    return val;
  }

  readI64LE(): bigint {
    this.ensureAvailable(8);
    const val = this.view.getBigInt64(this.offset, true);
    this.offset += 8;
    return val;
  }

  /**
   * Replace the underlying buffer while preserving read offset.
   * Used for progressive decoding: when more data arrives, swap in
   * the larger buffer and continue reading from where we left off.
   * The idea being that we keep decoding from where we left off.
   */
  replaceBuffer(newBuffer: Uint8Array): void {
    this.buffer = newBuffer;
    this.view = new DataView(newBuffer.buffer, newBuffer.byteOffset, newBuffer.byteLength);
    // offset is intentionally preserved
  }
}
