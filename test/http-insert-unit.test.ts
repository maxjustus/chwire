/**
 * Unit tests for insert() transport behavior using a mocked fetch —
 * no live ClickHouse server required.
 */

import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { ClickHouseException, insert } from "../client.ts";

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

  it("rejects non-positive bufferSize instead of looping forever", async () => {
    const captured = mockFetch(() => new Response("", { status: 200 }));
    for (const bufferSize of [0, -1, 1.5]) {
      await assert.rejects(
        insert("INSERT INTO t FORMAT RowBinary", new Uint8Array([1]), { bufferSize }),
        /bufferSize must be a positive integer/,
      );
    }
    assert.equal(captured.requestBodies.length, 0);
  });

  it("throws on missing query params before sending", async () => {
    const captured = mockFetch(() => new Response("", { status: 200 }));
    await assert.rejects(
      insert("INSERT INTO t SELECT {x: UInt64}", new Uint8Array([1])),
      /Missing parameter: x/,
    );
    assert.equal(captured.requestBodies.length, 0);
  });
});

describe("insert post-200 exception detection", () => {
  it("throws when the 200 response body carries a ClickHouse exception", async () => {
    mockFetch(
      () =>
        new Response(
          "Code: 241. DB::Exception: Memory limit (total) exceeded. (MEMORY_LIMIT_EXCEEDED)",
          { status: 200 },
        ),
    );
    await assert.rejects(
      insert("INSERT INTO t FORMAT RowBinary", new Uint8Array([1])),
      (err: unknown) => {
        assert.ok(err instanceof ClickHouseException);
        assert.equal(err.code, 241);
        assert.match(err.message, /Memory limit/);
        return true;
      },
    );
  });

  it("throws when the 200 response body carries a framed __exception__ trailer", async () => {
    mockFetch(
      () =>
        new Response("__exception__\nCode: 395. DB::Exception: boom. (QUERY_WAS_CANCELLED)", {
          status: 200,
        }),
    );
    await assert.rejects(
      insert("INSERT INTO t FORMAT RowBinary", new Uint8Array([1])),
      (err: unknown) => {
        assert.ok(err instanceof ClickHouseException);
        assert.equal(err.code, 395);
        return true;
      },
    );
  });

  it("resolves on a 200 response with an empty body", async () => {
    mockFetch(() => new Response("", { status: 200 }));
    const result = await insert("INSERT INTO t FORMAT RowBinary", new Uint8Array([1]));
    assert.equal(result.queryId, "");
  });

  it("resolves on a 200 response with a non-error body", async () => {
    mockFetch(() => new Response("\n", { status: 200 }));
    const result = await insert("INSERT INTO t FORMAT RowBinary", new Uint8Array([1]));
    assert.equal(result.queryId, "");
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
