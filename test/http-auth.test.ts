/**
 * Unit tests: credentials are sent via X-ClickHouse-User/Key headers,
 * never in the URL query string. Uses a mocked fetch.
 */

import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { insert, query } from "../client.ts";

const realFetch = globalThis.fetch;
const auth = { username: "alice", password: "s3cret" };

interface CapturedRequest {
  url: string;
  headers: Record<string, string>;
}

function mockFetch(): CapturedRequest[] {
  const captured: CapturedRequest[] = [];
  globalThis.fetch = (async (url: unknown, init?: RequestInit) => {
    const body = init?.body;
    if (body instanceof ReadableStream) {
      for await (const _ of body as unknown as AsyncIterable<Uint8Array>) {
        // drain
      }
    }
    captured.push({ url: String(url), headers: (init?.headers ?? {}) as Record<string, string> });
    return new Response("", { status: 200 });
  }) as typeof fetch;
  return captured;
}

afterEach(() => {
  globalThis.fetch = realFetch;
});

function assertHeaderAuth(req: CapturedRequest) {
  assert.equal(req.headers["X-ClickHouse-User"], "alice");
  assert.equal(req.headers["X-ClickHouse-Key"], "s3cret");
  const params = new URL(req.url).searchParams;
  assert.equal(params.get("user"), null);
  assert.equal(params.get("password"), null);
}

describe("auth via headers", () => {
  it("query() sends credentials as headers, not URL params", async () => {
    const captured = mockFetch();
    await query("SELECT 1", { auth, compression: false });
    assertHeaderAuth(captured[0]!);
  });

  it("insert() sends credentials as headers, not URL params", async () => {
    const captured = mockFetch();
    await insert("INSERT INTO t FORMAT RowBinary", new Uint8Array([1]), { auth });
    assertHeaderAuth(captured[0]!);
  });

  it("omits auth headers when no auth is given", async () => {
    const captured = mockFetch();
    await insert("INSERT INTO t FORMAT RowBinary", new Uint8Array([1]));
    assert.equal(captured[0]!.headers["X-ClickHouse-User"], undefined);
    assert.equal(captured[0]!.headers["X-ClickHouse-Key"], undefined);
  });
});
