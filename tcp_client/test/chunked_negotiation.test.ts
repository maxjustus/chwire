import assert from "node:assert";
import { describe, test } from "node:test";
import { assertNotChunkedCompatible } from "../types.ts";

describe("chunked protocol negotiation", () => {
  test("accepts optional and notchunked server modes", () => {
    assertNotChunkedCompatible("notchunked", "notchunked");
    assertNotChunkedCompatible("chunked_optional", "chunked_optional");
    assertNotChunkedCompatible("notchunked_optional", "chunked_optional");
  });

  test("rejects a server that requires chunked send", () => {
    assert.throws(
      () => assertNotChunkedCompatible("chunked", "notchunked"),
      /Server requires chunked protocol \(send=chunked\)/,
    );
  });

  test("rejects a server that requires chunked recv", () => {
    assert.throws(
      () => assertNotChunkedCompatible("chunked_optional", "chunked"),
      /Server requires chunked protocol \(recv=chunked\)/,
    );
  });
});
