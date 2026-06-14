import assert from "node:assert";
import { once } from "node:events";
import * as net from "node:net";
import { after, describe, test } from "node:test";
import { encodeBlock } from "../../compression.ts";
import { varIntSize, writeVarInt } from "../../native/io.ts";
import { StreamingReader } from "../reader.ts";

/** Start a server, run `serve` against the accepted socket, return a connected client socket. */
async function socketPair(
  serve: (sock: net.Socket) => void,
): Promise<{ client: net.Socket; close: () => void }> {
  const server = net.createServer(serve);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as net.AddressInfo;
  const client = net.connect(port, "127.0.0.1");
  await once(client, "connect");
  return {
    client,
    close: () => {
      client.destroy();
      server.close();
    },
  };
}

function encodeString(s: string): Uint8Array {
  const body = new TextEncoder().encode(s);
  const out = new Uint8Array(varIntSize(body.length) + body.length);
  const offset = writeVarInt(out, 0, body.length);
  out.set(body, offset);
  return out;
}

describe("StreamingReader", () => {
  const cleanups: (() => void)[] = [];
  after(() => {
    for (const close of cleanups) close();
  });

  test("reads values spanning fragmented writes", async () => {
    const str = encodeString("hello, clickhouse");
    const u64 = new Uint8Array(8);
    new DataView(u64.buffer).setBigUint64(0, 0x1122334455667788n, true);
    const payload = new Uint8Array([...str, 0x2a, ...u64]);

    const { client, close } = await socketPair((sock) => {
      // Dribble one byte per macrotask to force the reader to wait repeatedly.
      let i = 0;
      const writeNext = () => {
        if (i < payload.length) {
          sock.write(payload.subarray(i, i + 1));
          i++;
          setImmediate(writeNext);
        }
      };
      writeNext();
    });
    cleanups.push(close);

    const reader = new StreamingReader(client);
    assert.strictEqual(await reader.readString(), "hello, clickhouse");
    assert.strictEqual(await reader.readU8(), 0x2a);
    assert.strictEqual(await reader.readU64LE(), 0x1122334455667788n);
  });

  test("peekAll/nextChunk/consume hand out each byte exactly once", async () => {
    const { client, close } = await socketPair((sock) => {
      sock.write(new Uint8Array([1, 2, 3]));
      setImmediate(() => sock.write(new Uint8Array([4, 5])));
      setImmediate(() => setImmediate(() => sock.write(new Uint8Array([6, 7, 8]))));
    });
    cleanups.push(close);

    const reader = new StreamingReader(client);
    // Wait until the first write is buffered, as readBlock does via prior reads.
    assert.strictEqual(await reader.readU8(), 1);

    const received: number[] = [];
    received.push(...reader.peekAll());
    while (received.length < 7) {
      const chunk = await reader.nextChunk();
      assert.notStrictEqual(chunk, null);
      received.push(...chunk!);
    }
    assert.deepStrictEqual(received, [2, 3, 4, 5, 6, 7, 8]);

    // Consume only part of what was handed out; the remainder must stay readable.
    reader.consume(6);
    assert.strictEqual(await reader.readU8(), 8);
  });

  test("rejects pending reads when the socket errors", async () => {
    const { client, close } = await socketPair((sock) => {
      sock.write(new Uint8Array([1]));
      setImmediate(() => sock.destroy());
    });
    cleanups.push(close);

    const reader = new StreamingReader(client);
    assert.strictEqual(await reader.readU8(), 1);
    await assert.rejects(reader.readU64LE(), /end of stream|closed/i);
  });

  test("throws on EOF mid-value", async () => {
    const { client, close } = await socketPair((sock) => {
      sock.end(new Uint8Array([0xff, 0x01]));
    });
    cleanups.push(close);

    const reader = new StreamingReader(client);
    await assert.rejects(reader.readU64LE(), /Unexpected end of stream/);
  });

  test("discards a compressed block without decoding it", async () => {
    const frame = encodeBlock(new Uint8Array([1, 2, 3, 4]), false);
    const suffix = encodeString("after");
    const { client, close } = await socketPair((sock) => {
      sock.write(frame);
      sock.write(suffix);
    });
    cleanups.push(close);

    const reader = new StreamingReader(client);
    await reader.discardCompressedBlock();
    assert.strictEqual(await reader.readString(), "after");
  });

  test("bulk reads keep the socket flowing (no per-chunk kernel read stops)", async () => {
    // Regression test for WAN throughput collapse: consuming the socket via
    // its async iterator (paused mode) called handle.readStop() once per
    // high-water mark (~every 64KB), which keeps the TCP receive window from
    // growing on high-latency links. Eager 'data' consumption must not do that.
    const SIZE = 32 * 1024 * 1024;
    const payload = encodeString("a".repeat(SIZE));

    const { client, close } = await socketPair((sock) => {
      sock.write(payload);
    });
    cleanups.push(close);

    const handle = (
      client as unknown as { _handle: Record<string, (...args: unknown[]) => unknown> }
    )._handle;
    if (!handle?.readStop) {
      // Runtime without the internal handle (e.g. Bun) - churn not observable.
      return;
    }
    let stops = 0;
    const origStop = handle.readStop;
    handle.readStop = function (...args: unknown[]) {
      stops++;
      return origStop.apply(this, args);
    };

    const reader = new StreamingReader(client);
    const str = await reader.readString();
    assert.strictEqual(str.length, SIZE);
    // Paused-mode iteration produced ~SIZE/64KB (= 512) stops here. Allow a
    // handful for connection lifecycle and backpressure pauses.
    assert.ok(stops < 20, `expected <20 readStop calls during bulk read, got ${stops}`);
  });
});
