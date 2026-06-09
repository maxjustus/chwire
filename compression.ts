import { cityhash_102_128 } from "./vendor/cityhash/cityhash.js";

// Build-time constant set by esbuild --define
// When bundled: replaced with true/false literal, enabling dead-code elimination
// When unbundled (dev): undefined, so we default to true
declare const BUILD_WITH_ZSTD: boolean | undefined;

// Lazy-loaded compression functions - initialized by init()
let lz4CompressFn: ((source: Uint8Array) => Uint8Array) | undefined;
let lz4CompressFrameFn: ((source: Uint8Array) => Uint8Array) | undefined;
let lz4DecompressFn: ((source: Uint8Array, uncompressedSize: number) => Uint8Array) | undefined;
let zstdCompressFn: ((source: Uint8Array, level: number) => Uint8Array) | undefined;
let zstdDecompressFn: ((source: Uint8Array) => Uint8Array) | undefined;

// Module state - initialized by init()
let initialized = false;

/** True if using native lz4-napi, false if using WASM */
export let usingNativeLz4 = false;
/** True if using native zstd-napi, false if using WASM */
export let usingNativeZstd = false;

function prependUint32LE(data: Uint8Array, size: number): Uint8Array {
  const out = new Uint8Array(4 + data.length);
  out[0] = size & 0xff;
  out[1] = (size >> 8) & 0xff;
  out[2] = (size >> 16) & 0xff;
  out[3] = (size >> 24) & 0xff;
  out.set(data, 4);
  return out;
}

async function initLz4(): Promise<void> {
  // Try native lz4-napi first in Node.js
  if (typeof process !== "undefined" && process.versions?.node && typeof Buffer !== "undefined") {
    try {
      const native = await import("lz4-napi");
      // lz4-napi compressSync prepends 4-byte size prefix - strip it for raw block output
      lz4CompressFn = (d) => new Uint8Array(native.compressSync(Buffer.from(d))).subarray(4);
      // LZ4 frame format for HTTP Content-Encoding
      lz4CompressFrameFn = (d) => new Uint8Array(native.compressFrameSync(Buffer.from(d)));
      // uncompressSync expects 4-byte size prefix - prepend it
      lz4DecompressFn = (d, size) =>
        new Uint8Array(native.uncompressSync(Buffer.from(prependUint32LE(d, size))));
      usingNativeLz4 = true;
      return;
    } catch {
      // Native not available, fall through to WASM
    }
  }

  // WASM fallback - no frame support
  const lz4 = await import("./vendor/lz4/lz4.js");
  await lz4.init();
  // WASM compress prepends 4-byte size prefix - strip it for raw block output
  lz4CompressFn = (d) => lz4.compress(d).subarray(4);
  // lz4CompressFrameFn stays undefined - WASM doesn't support frame format
  // WASM decompress expects 4-byte size prefix - prepend it
  lz4DecompressFn = (d, size) => lz4.decompress(prependUint32LE(d, size));
}

async function initZstd(): Promise<void> {
  // Try native zstd-napi first in Node.js
  if (typeof process !== "undefined" && process.versions?.node && typeof Buffer !== "undefined") {
    try {
      const native = await import("zstd-napi");
      zstdCompressFn = (d, level) =>
        new Uint8Array(native.compress(d, { compressionLevel: level }));
      zstdDecompressFn = (d) => new Uint8Array(native.decompress(d));
      usingNativeZstd = true;
      return;
    } catch {
      // Native not available, fall through to WASM
    }
  }

  // WASM fallback
  const wasm = await import("@bokuweb/zstd-wasm");
  await wasm.init();
  zstdCompressFn = wasm.compress;
  zstdDecompressFn = wasm.decompress;
}

export async function init(): Promise<void> {
  if (initialized) return;

  // Initialize LZ4 (always needed)
  await initLz4();

  // Use BUILD_WITH_ZSTD directly for tree-shaking, fallback to true for dev
  if (typeof BUILD_WITH_ZSTD === "undefined" || BUILD_WITH_ZSTD) {
    await initZstd();
  }

  initialized = true;
}

// Uint8Array helpers
export function concat(arrays: Uint8Array<ArrayBufferLike>[]): Uint8Array {
  const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}

export function readUInt32LE(arr: Uint8Array, offset: number): number {
  return (
    arr[offset] | (arr[offset + 1] << 8) | (arr[offset + 2] << 16) | ((arr[offset + 3] << 24) >>> 0)
  );
}

function writeUInt32LE(arr: Uint8Array, value: number, offset: number): void {
  arr[offset] = value & 0xff;
  arr[offset + 1] = (value >> 8) & 0xff;
  arr[offset + 2] = (value >> 16) & 0xff;
  arr[offset + 3] = (value >> 24) & 0xff;
}

function equals(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

const CHECKSUM_SIZE = 16;
const HEADER_SIZE = 9;
const MAGIC_OFFSET = 0;
const COMPRESSED_SIZE_OFFSET = 1;
const UNCOMPRESSED_SIZE_OFFSET = 5;

export const Method = {
  None: 0x02,
  LZ4: 0x82,
  ZSTD: 0x90,
} as const;

export type MethodCode = (typeof Method)[keyof typeof Method];

export type Compression = false | "lz4" | "zstd" | { method: "zstd"; level?: number };

export function toMethodCode(compression: Compression): MethodCode {
  if (typeof compression === "object") {
    return Method.ZSTD;
  }
  switch (compression) {
    case "lz4":
      return Method.LZ4;
    case "zstd":
      return Method.ZSTD;
    case false:
      return Method.None;
  }
}

/** ZSTD compression level, defined only for the `{ method: "zstd", level }` form. */
export function compressionLevel(compression: Compression): number | undefined {
  return typeof compression === "object" ? compression.level : undefined;
}

export function cityHash128LE(bytes: Uint8Array): Uint8Array {
  const hash = cityhash_102_128(bytes);
  // Swap hi/lo 8-byte halves to match ClickHouse's expected byte order
  return concat([hash.subarray(8, 16), hash.subarray(0, 8)]);
}

/**
 * Raw LZ4 block compression (no ClickHouse block wrapper, no frame headers).
 * Used internally for ClickHouse native block format.
 */
export function lz4CompressRaw(raw: Uint8Array): Uint8Array {
  if (!lz4CompressFn) {
    throw new Error("LZ4 not initialized - call init() first");
  }
  return lz4CompressFn(raw);
}

/**
 * LZ4 frame compression for HTTP Content-Encoding.
 * Produces standard LZ4 frame format with magic number and checksums.
 * Only available with lz4-napi (Node.js), not in WASM builds.
 */
export function lz4CompressFrame(raw: Uint8Array): Uint8Array {
  if (!lz4CompressFrameFn) {
    throw new Error(
      "LZ4 frame compression not available - requires lz4-napi (not available in WASM builds)",
    );
  }
  return lz4CompressFrameFn(raw);
}

function lz4Decompress(compressed: Uint8Array, uncompressedSize: number): Uint8Array {
  if (!lz4DecompressFn) {
    throw new Error("LZ4 not initialized - call init() first");
  }
  return lz4DecompressFn(compressed, uncompressedSize);
}

/**
 * Raw ZSTD compression (no ClickHouse block wrapper).
 * Use for HTTP Content-Encoding compression.
 */
export function zstdCompressRaw(raw: Uint8Array, level = 3): Uint8Array {
  if (!zstdCompressFn) {
    throw new Error("ZSTD compression not available in this build variant");
  }
  return zstdCompressFn(raw, level);
}

function zstdDecompress(compressed: Uint8Array): Uint8Array {
  if (!zstdDecompressFn) {
    throw new Error("ZSTD decompression not available in this build variant");
  }
  return zstdDecompressFn(compressed);
}

/**
 * Encode a block with ClickHouse native compression format.
 * @param raw - Uncompressed data
 * @param compression - Compression method; the `{ method: "zstd", level }` form carries a ZSTD level
 * @returns Compressed block with checksum header
 */
export function encodeBlock(raw: Uint8Array, compression: Compression = "lz4"): Uint8Array {
  const mode = toMethodCode(compression);
  let compressed: Uint8Array;

  switch (mode) {
    case Method.LZ4:
      compressed = lz4CompressRaw(raw);
      break;
    case Method.ZSTD:
      compressed = zstdCompressRaw(raw, compressionLevel(compression));
      break;
    case Method.None:
      compressed = raw;
      break;
    default: {
      const _: never = mode;
      throw new Error(`Unsupported compression method 0x${(_ as number).toString(16)}`);
    }
  }

  const totalSize = CHECKSUM_SIZE + HEADER_SIZE + compressed.length;
  const output = new Uint8Array(totalSize);

  // Write header at offset 16 (after checksum)
  const headerOffset = CHECKSUM_SIZE;
  output[headerOffset + MAGIC_OFFSET] = mode;
  writeUInt32LE(output, HEADER_SIZE + compressed.length, headerOffset + COMPRESSED_SIZE_OFFSET);
  writeUInt32LE(output, raw.length, headerOffset + UNCOMPRESSED_SIZE_OFFSET);

  // Copy compressed data at offset 25
  const dataOffset = CHECKSUM_SIZE + HEADER_SIZE;
  output.set(compressed, dataOffset);

  // Calculate checksum over header + compressed data
  const checksum = cityHash128LE(output.subarray(headerOffset, dataOffset + compressed.length));
  output.set(checksum, 0);

  return output.subarray(0, totalSize);
}

/** Calculate required buffer size for encodeBlock output */
export function decodeBlock(block: Uint8Array): Uint8Array {
  if (block.length < CHECKSUM_SIZE + HEADER_SIZE) {
    throw new Error("block too small");
  }

  const checksum = block.subarray(0, CHECKSUM_SIZE);
  const payloadStart = CHECKSUM_SIZE;
  const metadata = block.subarray(payloadStart, payloadStart + HEADER_SIZE);
  const compressed = block.subarray(payloadStart + HEADER_SIZE);

  // Verify checksum over header + compressed data (no allocation - use subarray)
  const expected = cityHash128LE(block.subarray(payloadStart));
  if (!equals(checksum, expected)) {
    throw new Error("checksum mismatch");
  }

  const mode = metadata[MAGIC_OFFSET] as MethodCode;
  const compressedSize = readUInt32LE(metadata, COMPRESSED_SIZE_OFFSET);
  const uncompressedSize = readUInt32LE(metadata, UNCOMPRESSED_SIZE_OFFSET);

  if (compressedSize !== HEADER_SIZE + compressed.length) {
    throw new Error(
      `compressed_size mismatch: expected ${compressedSize}, got ${HEADER_SIZE + compressed.length}`,
    );
  }

  switch (mode) {
    case Method.None:
      // Copy: callers may recycle the block's underlying buffer after decode,
      // and the LZ4/ZSTD branches already return fresh buffers.
      return compressed.slice();
    case Method.LZ4:
      return lz4Decompress(compressed, uncompressedSize);
    case Method.ZSTD:
      return zstdDecompress(compressed);
    default: {
      const _: never = mode;
      throw new Error(`Unsupported compression method 0x${(_ as number).toString(16)}`);
    }
  }
}

export function decodeBlocks(data: Uint8Array): Uint8Array {
  const blocks: Uint8Array[] = [];
  let offset = 0;

  while (offset + CHECKSUM_SIZE + HEADER_SIZE <= data.length) {
    const metadataOffset = offset + CHECKSUM_SIZE;
    const compressedSize = readUInt32LE(data, metadataOffset + COMPRESSED_SIZE_OFFSET);
    const blockSize = CHECKSUM_SIZE + compressedSize;

    if (offset + blockSize > data.length) {
      break;
    }

    const block = data.subarray(offset, offset + blockSize);
    const decompressed = decodeBlock(block);
    blocks.push(decompressed);

    offset += blockSize;
  }

  return concat(blocks);
}
