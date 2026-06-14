import assert from "node:assert";
import { describe, test } from "node:test";
import { ClientPacketId } from "../types.ts";
import { StreamingWriter } from "../writer.ts";

describe("StreamingWriter", () => {
  test("encoded packets are independent from later writer reuse", () => {
    const writer = new StreamingWriter(8);

    const ping = writer.encodePing();
    const cancel = writer.encodeCancel();

    assert.deepStrictEqual([...ping], [ClientPacketId.Ping]);
    assert.deepStrictEqual([...cancel], [ClientPacketId.Cancel]);
  });

  test("large uncompressed Data packets do not bloat later small packets", () => {
    const writer = new StreamingWriter(8);
    const largeColumn = new Uint8Array(300_000);

    const data = writer.encodeData(
      "",
      1,
      [{ name: "x", type: "String", data: largeColumn }],
      0n,
      false,
    );
    const ping = writer.encodePing();

    assert.strictEqual(data[0], ClientPacketId.Data);
    assert.deepStrictEqual([...ping], [ClientPacketId.Ping]);
    assert.ok(
      ping.buffer.byteLength < 1024,
      `small packet should not retain large backing buffer, got ${ping.buffer.byteLength}`,
    );
  });
});
