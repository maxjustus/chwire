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
