/**
 * Unit tests for insert() transport behavior using a mocked fetch —
 * no live ClickHouse server required.
 */

import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { insert } from "../client.ts";

const realFetch = globalThis.fetch;

/** Mock fetch that drains the request body stream and returns a canned response. */
function mockFetch(response: () => Response): { requestBodies: Uint8Array[][] } {
  const captured = { requestBodies: [] as Uint8Array[][] };
  globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
    const chunks: Uint8Array[] = [];
    const body = init?.body;
    if (body instanceof ReadableStream) {
      for await (const chunk of body as unknown as AsyncIterable<Uint8Array>) {
        chunks.push(chunk);
      }
    }
    captured.requestBodies.push(chunks);
    return response();
  }) as typeof fetch;
  return captured;
}

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("insert option handling", () => {
  it("completes when threshold exceeds bufferSize", async () => {
    const captured = mockFetch(() => new Response("", { status: 200 }));
    const data = new Uint8Array(4096).fill(65);
    const result = await insert("INSERT INTO t FORMAT RowBinary", data, {
      bufferSize: 1024,
      threshold: 1024 * 1024,
    });
    assert.equal(result.queryId, "");
    // 4096 bytes through a 1024-byte buffer = 4 flushed blocks
    assert.equal(captured.requestBodies[0]!.length, 4);
  });
});

describe("insert backpressure", () => {
  it("pulls from the producer instead of buffering the whole payload", async () => {
    let produced = 0;
    async function* producer() {
      for (let i = 0; i < 100; i++) {
        produced++;
        yield new Uint8Array(1024).fill(66);
      }
    }

    let producedAtFirstRead = -1;
    globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
      const reader = (init!.body as ReadableStream<Uint8Array>).getReader();
      await reader.read();
      producedAtFirstRead = produced;
      while (!(await reader.read()).done) {
        // drain
      }
      return new Response("", { status: 200 });
    }) as typeof fetch;

    await insert("INSERT INTO t FORMAT RowBinary", producer(), {
      bufferSize: 1024,
      threshold: 1024,
    });

    assert.equal(produced, 100);
    // Pull-based: at the first read only a couple of chunks should have been
    // consumed from the producer, not the entire payload.
    assert.ok(
      producedAtFirstRead <= 4,
      `expected <= 4 chunks produced at first read, got ${producedAtFirstRead}`,
    );
  });
});
