/**
 * Test HTTP error handling:
 * - Unit tests for pure error parsing functions
 * - Case 1: Error before HTTP headers sent (clean HTTP 4xx/5xx)
 * - Case 2: Error after headers sent (__exception__ marker in chunked body)
 */

import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import {
  ClickHouseException,
  collectText,
  _createSignal as createSignal,
  _findExceptionMarker as findExceptionMarker,
  init,
  _parseErrorText as parseErrorText,
  _parseStreamException as parseStreamException,
  query,
} from "../client.ts";
import { startClickHouse, stopClickHouse } from "./setup.ts";
import { generateSessionId } from "./test_utils.ts";

const encode = (s: string) => new TextEncoder().encode(s);

describe("parseErrorText", () => {
  it("should parse standard ClickHouse error format", () => {
    const result = parseErrorText(
      "Code: 60. DB::Exception: Table default.foo doesn't exist. (UNKNOWN_TABLE)",
    );
    assert.strictEqual(result.code, 60);
    assert.strictEqual(result.name, "DB::Exception");
    assert.ok(result.message.includes("UNKNOWN_TABLE"));
  });

  it("should parse error with nested colons in message", () => {
    const result = parseErrorText(
      "Code: 395. DB::Exception: some error: while executing 'FUNCTION throwIf'",
    );
    assert.strictEqual(result.code, 395);
    assert.strictEqual(result.name, "DB::Exception");
    assert.ok(result.message.includes("while executing"));
  });

  it("should handle text without Code: prefix", () => {
    const result = parseErrorText("Something went wrong");
    assert.strictEqual(result.code, 0);
    assert.strictEqual(result.name, "Unknown");
    assert.strictEqual(result.message, "Something went wrong");
  });

  it("should handle empty string", () => {
    const result = parseErrorText("");
    assert.strictEqual(result.code, 0);
    assert.strictEqual(result.name, "Unknown");
    assert.strictEqual(result.message, "");
  });
});

describe("findExceptionMarker", () => {
  it("should find marker at start of buffer", () => {
    const buf = encode("__exception__\r\nCode: 395. DB::Exception: error\r\n");
    assert.strictEqual(findExceptionMarker(buf, true), 0);
  });

  it("should find marker mid-buffer", () => {
    const buf = encode("some data\n__exception__\r\nCode: 1. DB::Exception: x\r\n");
    assert.strictEqual(findExceptionMarker(buf, true), 10);
  });

  it("should return -1 when marker absent", () => {
    const buf = encode("normal data without any markers");
    assert.strictEqual(findExceptionMarker(buf, true), -1);
  });

  it("should return -1 for partial marker", () => {
    const buf = encode("__exceptio");
    assert.strictEqual(findExceptionMarker(buf, true), -1);
  });

  it("should return -1 for inline payload text (text mode requires line start)", () => {
    const buf = encode('{"message":"hello __exception__\\r\\nCode: 395. DB::Exception: x"}');
    assert.strictEqual(findExceptionMarker(buf, true), -1);
  });

  it("should return -1 without the Code: <n>. preamble", () => {
    // 'Code: 395' with no trailing period is not a real ClickHouse exception.
    const buf = encode('{"message":"hello __exception__\\r\\nCode: 395"}');
    assert.strictEqual(findExceptionMarker(buf, false), -1);
  });

  it("should return -1 without a ClickHouse error preamble", () => {
    const buf = encode("__exception__\r\nnot actually an exception\r\n");
    assert.strictEqual(findExceptionMarker(buf, false), -1);
  });

  it("should return -1 for empty buffer", () => {
    assert.strictEqual(findExceptionMarker(new Uint8Array(0), true), -1);
  });

  it("should find a line-start marker after preceding data", () => {
    const buf = encode("prefix\n__exception__\r\nCode: 1. DB::Exception: boom\r\n");
    assert.strictEqual(findExceptionMarker(buf, true), 7);
  });

  it("binary mode finds a marker preceded by non-newline block bytes", () => {
    // Native trailer: the marker follows arbitrary block bytes (e.g. \0), never a
    // newline. requireLineStart=false relies on the strict Code: <n>. preamble.
    const buf = encode("\x00\x00__exception__\r\nCode: 5. DB::Exception: boom\r\n");
    assert.strictEqual(findExceptionMarker(buf, false), 2);
  });

  it("text mode rejects the same non-line-start marker (inline-payload guard)", () => {
    const buf = encode("\x00\x00__exception__\r\nCode: 5. DB::Exception: boom\r\n");
    assert.strictEqual(findExceptionMarker(buf, true), -1);
  });
});

describe("tagged exception trailer (ClickHouse 26.x)", () => {
  // Servers that send X-ClickHouse-Exception-Tag frame the trailer as
  // __exception__\r\n<tag>\r\nCode: ...<len> <tag>\r\n__exception__\r\n
  const TAG = "hmrwngjlqfwpfqhh";
  const tagged = encode(
    "\x00\x00__exception__\r\nhmrwngjlqfwpfqhh\r\nCode: 395. DB::Exception: boom. (THROW)",
  );

  it("finds a tagged trailer when the tag is known", () => {
    assert.strictEqual(findExceptionMarker(tagged, false, TAG), 2);
  });

  it("rejects a tagged trailer whose tag does not match", () => {
    assert.strictEqual(findExceptionMarker(tagged, false, "aaaaaaaaaaaaaaaa"), -1);
  });

  it("still finds tagless trailers when a tag is provided (older server form)", () => {
    const tagless = encode("\x00__exception__\r\nCode: 395. DB::Exception: boom");
    assert.strictEqual(findExceptionMarker(tagless, false, TAG), 1);
  });

  it("parses a tagged trailer, stripping the tag line and closing frame", () => {
    const full = encode(
      "__exception__\r\nhmrwngjlqfwpfqhh\r\nCode: 395. DB::Exception: boom. (THROW)\n74 hmrwngjlqfwpfqhh\r\n__exception__\r\n",
    );
    const err = parseStreamException(full, TAG);
    assert.ok(err instanceof ClickHouseException);
    assert.strictEqual(err.code, 395);
    assert.strictEqual(err.exceptionName, "DB::Exception");
    assert.ok(err.message.includes("boom"));
    assert.ok(!err.message.includes(TAG), `tag leaked into message: ${err.message}`);
    assert.ok(!err.message.includes("__exception__"));
  });
});

describe("parseStreamException", () => {
  it("should parse __exception__ with CRLF", () => {
    const buf = encode("__exception__\r\nCode: 395. DB::Exception: test error\r\n");
    const err = parseStreamException(buf);
    assert.ok(err instanceof ClickHouseException);
    assert.strictEqual(err.code, 395);
    assert.strictEqual(err.exceptionName, "DB::Exception");
    assert.ok(err.message.includes("test error"));
  });

  it("should parse __exception__ with LF", () => {
    const buf = encode("__exception__\nCode: 60. DB::Exception: not found\n");
    const err = parseStreamException(buf);
    assert.strictEqual(err.code, 60);
  });

  it("should handle malformed body", () => {
    const buf = encode("__exception__\r\ngarbage text\r\n");
    const err = parseStreamException(buf);
    assert.strictEqual(err.code, 0);
    assert.strictEqual(err.exceptionName, "Unknown");
    assert.ok(err.message.includes("garbage text"));
  });
});

describe("createSignal", () => {
  it("returns an already-aborted source signal immediately", () => {
    const controller = new AbortController();
    const reason = new Error("already aborted");
    controller.abort(reason);

    const combined = createSignal(controller.signal, 1_000);

    assert.strictEqual(combined, controller.signal);
    assert.ok(combined?.aborted);
    assert.strictEqual(combined?.reason, reason);
  });
});

describe("HTTP error handling (integration)", { timeout: 60000 }, () => {
  let clickhouse: Awaited<ReturnType<typeof startClickHouse>>;
  let url: string;
  let auth: { username: string; password: string };
  const sessionId = generateSessionId("error-handling");

  before(async () => {
    await init();
    clickhouse = await startClickHouse();
    url = `${clickhouse.url}/`;
    auth = { username: clickhouse.username, password: clickhouse.password };
  });

  after(async () => {
    await stopClickHouse();
  });

  describe("Case 1: error before headers sent", () => {
    it("should throw ClickHouseException with parsed code (no compression)", async () => {
      let thrownError: unknown = null;
      try {
        await collectText(
          query("SELECT * FROM nonexistent_table_xyz", {
            url,
            auth,
            sessionId,
            compression: false,
          }),
        );
      } catch (err) {
        thrownError = err;
      }
      assert.ok(thrownError, "Should have thrown an error");
      assert.ok(thrownError instanceof ClickHouseException);
      assert.ok(thrownError.code > 0, `Expected numeric error code, got ${thrownError.code}`);
      assert.ok(thrownError.exceptionName.includes("DB::Exception"));
      assert.ok(
        thrownError.message.includes("UNKNOWN_TABLE") ||
          thrownError.message.includes("nonexistent_table_xyz"),
      );
    });

    it("should throw ClickHouseException with parsed code (lz4 compression)", async () => {
      let thrownError: unknown = null;
      try {
        await collectText(
          query("SELECT * FROM nonexistent_table_xyz", {
            url,
            auth,
            sessionId,
            compression: "lz4",
          }),
        );
      } catch (err) {
        thrownError = err;
      }
      assert.ok(thrownError, "Should have thrown an error");
      assert.ok(thrownError instanceof ClickHouseException);
      assert.ok(thrownError.code > 0);
    });
  });

  describe("Case 2: mid-stream exception (__exception__ marker)", () => {
    it("should detect __exception__ and throw ClickHouseException (non-compressed)", async () => {
      // throwIf triggers at row 200. With max_block_size=10 and ~5KB/row,
      // ~1MB flushes before the error — forcing headers to be committed first.
      const sql = `
        SELECT number, randomPrintableASCII(5000) as padding,
               throwIf(number >= 200, 'mid_stream_test_error') as t
        FROM numbers(300)
        SETTINGS max_block_size = 10
      `;

      let dataChunksReceived = 0;
      let thrownError: unknown = null;

      try {
        for await (const packet of query(sql, {
          url,
          auth,
          sessionId,
          compression: false,
          settings: { default_format: "TSV" },
        })) {
          if (packet.type === "Data") dataChunksReceived++;
        }
      } catch (err) {
        thrownError = err;
      }

      assert.ok(thrownError, `Should have thrown (received ${dataChunksReceived} chunks)`);
      assert.ok(
        thrownError instanceof ClickHouseException,
        `Expected ClickHouseException, got ${(thrownError as Error).constructor.name}: ${(thrownError as Error).message?.substring(0, 200)}`,
      );
      assert.ok(thrownError.code > 0);
      assert.ok(thrownError.message.includes("mid_stream_test_error"));
      assert.ok(dataChunksReceived > 0, `Expected data before error, got ${dataChunksReceived}`);
    });

    it("should throw ClickHouseException for compressed query error (Case 1 or Case 2)", async () => {
      // With compression, ClickHouse may buffer enough to return HTTP 500 (Case 1)
      // or may stream compressed blocks before hitting the error (Case 2).
      // This test verifies both paths produce ClickHouseException.
      const sql = `
        SELECT number, randomPrintableASCII(10000) as padding,
               throwIf(number >= 500, 'compressed_error_test') as t
        FROM numbers(600)
        SETTINGS max_block_size = 10
      `;

      let thrownError: unknown = null;
      try {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        for await (const _packet of query(sql, {
          url,
          auth,
          sessionId,
          compression: "lz4",
          settings: { default_format: "TSV" },
        })) {
          // consume
        }
      } catch (err) {
        thrownError = err;
      }

      assert.ok(thrownError, "Should have thrown");
      assert.ok(
        thrownError instanceof ClickHouseException,
        `Expected ClickHouseException, got ${(thrownError as Error).constructor.name}: ${(thrownError as Error).message?.substring(0, 200)}`,
      );
      assert.ok(
        (thrownError as ClickHouseException).message.includes("compressed_error_test") ||
          (thrownError as ClickHouseException).message.includes("FUNCTION_THROW_IF"),
      );
    });

    // Native (binary) format: the __exception__ trailer is preceded by block
    // bytes, not a newline, so detection relies on the strict Code: <n>. preamble
    // rather than the line-start guard used for text formats.
    for (const compression of [false, "lz4"] as const) {
      it(`should throw ClickHouseException for mid-stream error in Native (compression=${compression})`, async () => {
        const sql = `
          SELECT number, randomPrintableASCII(5000) AS padding,
                 throwIf(number >= 200, 'mid_stream_native_error') AS t
          FROM numbers(400)
          FORMAT Native
          SETTINGS max_block_size = 10
        `;

        let dataChunksReceived = 0;
        let thrownError: unknown = null;
        try {
          for await (const packet of query(sql, { url, auth, sessionId, compression })) {
            if (packet.type === "Data") dataChunksReceived++;
          }
        } catch (err) {
          thrownError = err;
        }

        assert.ok(thrownError, "Should have thrown");
        assert.ok(
          thrownError instanceof ClickHouseException,
          `Expected ClickHouseException, got ${(thrownError as Error).constructor.name}: ${(thrownError as Error).message?.substring(0, 200)}`,
        );
        assert.ok(
          (thrownError as ClickHouseException).message.includes("mid_stream_native_error") ||
            (thrownError as ClickHouseException).message.includes("FUNCTION_THROW_IF"),
        );
        // Without compression CH commits headers and streams ~1MB of Native blocks
        // before row 200 throws, so this must exercise the mid-stream (Case 2)
        // binary detection path — not a clean Case 1 HTTP error. With lz4 the
        // server may buffer enough to return Case 1, so only assert it there.
        if (compression === false) {
          assert.ok(
            dataChunksReceived > 0,
            `Expected Native data before the error (Case 2), got ${dataChunksReceived} chunks`,
          );
        }
      });
    }
  });
});
