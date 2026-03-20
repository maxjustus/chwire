import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { decodeBinaryValue, encodeBinaryValue } from "../../native/binary_type.ts";

describe("decodeBinaryValue", () => {
  it("Bool: true", () => {
    // Captured: 0x2D Bool + 0x01 (true)
    const data = new Uint8Array([0x2d, 0x01]);
    assert.strictEqual(decodeBinaryValue(data), true);
  });

  it("Bool: false", () => {
    const data = new Uint8Array([0x2d, 0x00]);
    assert.strictEqual(decodeBinaryValue(data), false);
  });

  it("Int64: 30", () => {
    // Captured: 0x0A Int64 + 30 LE
    const data = new Uint8Array([0x0a, 0x1e, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
    assert.strictEqual(decodeBinaryValue(data), 30n);
  });

  it("String: Alice", () => {
    // Captured: 0x15 String + VarUInt(5) + "Alice"
    const data = new Uint8Array([0x15, 0x05, 0x41, 0x6c, 0x69, 0x63, 0x65]);
    assert.strictEqual(decodeBinaryValue(data), "Alice");
  });

  it("Float64: 95.5", () => {
    // Captured: 0x0E Float64 + 95.5 LE
    const data = new Uint8Array([0x0e, 0x00, 0x00, 0x00, 0x00, 0x00, 0xe0, 0x57, 0x40]);
    const value = decodeBinaryValue(data) as number;
    assert.ok(Math.abs(value - 95.5) < 0.001);
  });

  it("Nothing", () => {
    const data = new Uint8Array([0x00]);
    assert.strictEqual(decodeBinaryValue(data), null);
  });

  it("UInt8: 255", () => {
    const data = new Uint8Array([0x01, 0xff]);
    assert.strictEqual(decodeBinaryValue(data), 255);
  });

  it("UInt32: 42", () => {
    const data = new Uint8Array([0x03, 0x2a, 0x00, 0x00, 0x00]);
    assert.strictEqual(decodeBinaryValue(data), 42);
  });

  it("Array(Nullable(String)): [admin, user]", () => {
    // Captured from json_v1_v2_binary_examples.md
    const data = new Uint8Array([
      0x1e, // Array
      0x23, // Nullable
      0x15, // String
      0x02, // count=2
      0x00, // not null
      0x05,
      0x61,
      0x64,
      0x6d,
      0x69,
      0x6e, // "admin"
      0x00, // not null
      0x04,
      0x75,
      0x73,
      0x65,
      0x72, // "user"
    ]);
    const result = decodeBinaryValue(data);
    assert.deepStrictEqual(result, ["admin", "user"]);
  });

  it("Array(Nullable(String)) with null element", () => {
    const data = new Uint8Array([
      0x1e, // Array
      0x23, // Nullable
      0x15, // String
      0x02, // count=2
      0x00,
      0x03,
      0x66,
      0x6f,
      0x6f, // "foo"
      0x01, // null
    ]);
    const result = decodeBinaryValue(data);
    assert.deepStrictEqual(result, ["foo", null]);
  });

  it("Float32: 3.14", () => {
    const buf = new ArrayBuffer(4);
    new DataView(buf).setFloat32(0, 3.140000104904175, true);
    const bytes = new Uint8Array(buf);
    const data = new Uint8Array([0x0d, ...bytes]);
    const value = decodeBinaryValue(data) as number;
    assert.ok(Math.abs(value - 3.14) < 0.01);
  });

  it("Date: days since epoch", () => {
    // 0x0F Date + 19737 days (2024-01-15) as U16 LE
    const data = new Uint8Array([0x0f, 0x19, 0x4d]);
    const result = decodeBinaryValue(data);
    assert.strictEqual(result, 0x4d19); // 19737
  });
});

describe("encodeBinaryValue", () => {
  it("Bool: true", () => {
    const encoded = encodeBinaryValue(true);
    assert.deepStrictEqual(encoded, new Uint8Array([0x2d, 0x01]));
  });

  it("Bool: false", () => {
    const encoded = encodeBinaryValue(false);
    assert.deepStrictEqual(encoded, new Uint8Array([0x2d, 0x00]));
  });

  it("Int64: 30 (from number)", () => {
    const encoded = encodeBinaryValue(30);
    assert.deepStrictEqual(
      encoded,
      new Uint8Array([0x0a, 0x1e, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
    );
  });

  it("Int64: 30 (from bigint)", () => {
    const encoded = encodeBinaryValue(30n);
    assert.deepStrictEqual(
      encoded,
      new Uint8Array([0x0a, 0x1e, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
    );
  });

  it("String: Alice", () => {
    const encoded = encodeBinaryValue("Alice");
    assert.deepStrictEqual(encoded, new Uint8Array([0x15, 0x05, 0x41, 0x6c, 0x69, 0x63, 0x65]));
  });

  it("Float64: 95.5", () => {
    const encoded = encodeBinaryValue(95.5);
    assert.deepStrictEqual(
      encoded,
      new Uint8Array([0x0e, 0x00, 0x00, 0x00, 0x00, 0x00, 0xe0, 0x57, 0x40]),
    );
  });

  it("Nothing: null", () => {
    const encoded = encodeBinaryValue(null);
    assert.deepStrictEqual(encoded, new Uint8Array([0x00]));
  });

  it("Array(Int64): [1, 2, 3]", () => {
    const encoded = encodeBinaryValue([1, 2, 3]);
    // Array type byte + Int64 type byte + count=3 + three Int64 LE values
    assert.strictEqual(encoded[0], 0x1e); // Array
    assert.strictEqual(encoded[1], 0x0a); // Int64
    assert.strictEqual(encoded[2], 0x03); // count=3
    // First value: 1 as Int64 LE
    const view = new DataView(encoded.buffer, encoded.byteOffset);
    assert.strictEqual(view.getBigInt64(3, true), 1n);
    assert.strictEqual(view.getBigInt64(11, true), 2n);
    assert.strictEqual(view.getBigInt64(19, true), 3n);
  });
});

describe("round-trip", () => {
  const cases: [string, unknown][] = [
    ["null", null],
    ["true", true],
    ["false", false],
    ["integer 42", 42],
    ["negative integer -7", -7],
    ["bigint 999n", 999n],
    ["float 3.14", 3.14],
    ["string hello", "hello"],
    ["empty string", ""],
    ["empty array", []],
  ];

  for (const [label, value] of cases) {
    it(`round-trips ${label}`, () => {
      const encoded = encodeBinaryValue(value);
      const decoded = decodeBinaryValue(encoded);

      if (typeof value === "number" && !Number.isInteger(value)) {
        assert.ok(Math.abs((decoded as number) - value) < 1e-10);
      } else if (typeof value === "number" && Number.isInteger(value)) {
        // integers encode as Int64, decode as bigint
        assert.strictEqual(decoded, BigInt(value));
      } else if (Array.isArray(value) && value.length === 0) {
        // empty array encodes as Array(Nothing), decodes as []
        assert.deepStrictEqual(decoded, []);
      } else {
        assert.deepStrictEqual(decoded, value);
      }
    });
  }
});
