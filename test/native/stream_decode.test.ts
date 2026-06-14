import assert from "node:assert";
import { describe, test } from "node:test";
import {
  batchFromCols,
  encodeNative,
  getCodec,
  type RecordBatch,
  streamDecodeNative,
} from "../../native/index.ts";

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

async function* chunked(data: Uint8Array, size: number): AsyncIterable<Uint8Array> {
  for (let offset = 0; offset < data.length; offset += size) {
    yield data.subarray(offset, Math.min(offset + size, data.length));
  }
}

describe("streamDecodeNative", () => {
  test("default buffer does not make tiny numeric blocks pin 2MiB", async () => {
    const batch = batchFromCols({
      id: getCodec("UInt32").fromValues(new Uint32Array([1, 2, 3, 4])),
    });
    const encoded = encodeNative(batch);

    const decoded: RecordBatch[] = [];
    for await (const decodedBatch of streamDecodeNative(chunked(encoded, encoded.length))) {
      decoded.push(decodedBatch);
    }

    assert.strictEqual(decoded.length, 1);
    const col = decoded[0]!.getColumnAt(0) as unknown as { data: Uint32Array };
    assert.ok(col.data instanceof Uint32Array);
    assert.ok(
      col.data.buffer.byteLength < 1024 * 1024,
      `tiny block should not retain a huge backing buffer, got ${col.data.buffer.byteLength}`,
    );
  });

  test("decodes tiny chunks across multiple blocks while keeping yielded columns stable", async () => {
    const first = batchFromCols({
      id: getCodec("UInt32").fromValues(new Uint32Array([1, 2, 3, 4])),
      value: getCodec("Float64").fromValues(new Float64Array([1.5, 2.5, 3.5, 4.5])),
    });
    const second = batchFromCols({
      id: getCodec("UInt32").fromValues(new Uint32Array([5, 6, 7, 8])),
      value: getCodec("Float64").fromValues(new Float64Array([5.5, 6.5, 7.5, 8.5])),
    });
    const encoded = concat([encodeNative(first), encodeNative(second)]);

    const decoded: RecordBatch[] = [];
    for await (const batch of streamDecodeNative(chunked(encoded, 5), { minBufferSize: 16 })) {
      decoded.push(batch);
    }

    assert.strictEqual(decoded.length, 2);
    assert.strictEqual(decoded[0]!.rowCount, 4);
    assert.strictEqual(decoded[1]!.rowCount, 4);

    // Read the first batch after the stream has advanced through later chunks.
    assert.strictEqual(decoded[0]!.getAt(0, 0), 1);
    assert.strictEqual(decoded[0]!.getAt(3, 0), 4);
    assert.strictEqual(decoded[0]!.getAt(0, 1), 1.5);
    assert.strictEqual(decoded[0]!.getAt(3, 1), 4.5);
    assert.strictEqual(decoded[1]!.getAt(0, 0), 5);
    assert.strictEqual(decoded[1]!.getAt(3, 1), 8.5);
  });
});
