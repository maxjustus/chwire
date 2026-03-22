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
    const data = new Uint8Array([0x0f, 0x19, 0x4d]);
    assert.strictEqual(decodeBinaryValue(data), 0x4d19);
  });

  it("DateTime: unix timestamp", () => {
    // 0x11 DateTime + empty timezone (varint 0) + timestamp 1705312245 as U32 LE
    const buf = new ArrayBuffer(4);
    new DataView(buf).setUint32(0, 1705312245, true);
    const data = new Uint8Array([0x11, 0x00, ...new Uint8Array(buf)]);
    assert.strictEqual(decodeBinaryValue(data), 1705312245);
  });

  it("DateTime64: ticks", () => {
    // 0x12 DateTime64 + precision=3 + empty timezone + ticks as I64 LE
    const buf = new ArrayBuffer(8);
    new DataView(buf).setBigInt64(0, 1705312245123n, true);
    const data = new Uint8Array([0x12, 0x03, 0x00, ...new Uint8Array(buf)]);
    assert.strictEqual(decodeBinaryValue(data), 1705312245123n);
  });

  it("Int32: -42", () => {
    const buf = new ArrayBuffer(4);
    new DataView(buf).setInt32(0, -42, true);
    const data = new Uint8Array([0x09, ...new Uint8Array(buf)]);
    assert.strictEqual(decodeBinaryValue(data), -42);
  });

  it("Int16: 1234", () => {
    const buf = new ArrayBuffer(2);
    new DataView(buf).setInt16(0, 1234, true);
    const data = new Uint8Array([0x08, ...new Uint8Array(buf)]);
    assert.strictEqual(decodeBinaryValue(data), 1234);
  });

  it("UUID: 16 bytes", () => {
    const uuidBytes = new Uint8Array(16);
    for (let i = 0; i < 16; i++) uuidBytes[i] = i + 1;
    const data = new Uint8Array([0x1d, ...uuidBytes]);
    const result = decodeBinaryValue(data) as Uint8Array;
    assert.strictEqual(result.length, 16);
    assert.deepStrictEqual(Array.from(result), Array.from(uuidBytes));
  });

  it("IPv4: u32", () => {
    // 0x25 IPv4 + 0xC0A80001 = 192.168.0.1 as u32 LE
    const data = new Uint8Array([0x25, 0x01, 0x00, 0xa8, 0xc0]);
    assert.strictEqual(decodeBinaryValue(data), 0xc0a80001);
  });

  it("IPv6: 16 bytes", () => {
    const ipv6Bytes = new Uint8Array(16);
    ipv6Bytes[0] = 0xfe;
    ipv6Bytes[1] = 0x80;
    const data = new Uint8Array([0x26, ...ipv6Bytes]);
    const result = decodeBinaryValue(data) as Uint8Array;
    assert.strictEqual(result.length, 16);
    assert.strictEqual(result[0], 0xfe);
  });

  it("Nullable(Int64): non-null", () => {
    const buf = new ArrayBuffer(8);
    new DataView(buf).setBigInt64(0, 99n, true);
    const data = new Uint8Array([0x23, 0x0a, 0x00, ...new Uint8Array(buf)]); // Nullable + Int64 + not-null + value
    assert.strictEqual(decodeBinaryValue(data), 99n);
  });

  it("Nullable(Int64): null", () => {
    const data = new Uint8Array([0x23, 0x0a, 0x01]); // Nullable + Int64 + is-null
    assert.strictEqual(decodeBinaryValue(data), null);
  });

  it("Map(String, Int64)", () => {
    // Map type + String key type + Int64 val type + count=1 + key "x" + val 7
    const valBuf = new ArrayBuffer(8);
    new DataView(valBuf).setBigInt64(0, 7n, true);
    const data = new Uint8Array([
      0x27,
      0x15,
      0x0a, // Map(String, Int64)
      0x01, // count=1
      0x01,
      0x78, // key: varint(1) + "x"
      ...new Uint8Array(valBuf), // val: 7 as I64 LE
    ]);
    const result = decodeBinaryValue(data) as { keys: unknown[]; values: unknown[] };
    assert.strictEqual(result.keys[0], "x");
    assert.strictEqual(result.values[0], 7n);
  });

  it("Tuple(UInt32, String)", () => {
    const data = new Uint8Array([
      0x1f, // Tuple
      0x02, // 2 elements
      0x03, // UInt32
      0x15, // String
      0x2a,
      0x00,
      0x00,
      0x00, // UInt32: 42
      0x03,
      0x61,
      0x62,
      0x63, // String: "abc"
    ]);
    const result = decodeBinaryValue(data) as unknown[];
    assert.strictEqual(result[0], 42);
    assert.strictEqual(result[1], "abc");
  });

  it("FixedString(4)", () => {
    const data = new Uint8Array([0x16, 0x04, 0x41, 0x42, 0x43, 0x00]); // FixedString(4) + "ABC\0"
    const result = decodeBinaryValue(data) as Uint8Array;
    assert.strictEqual(result.length, 4);
    assert.strictEqual(result[0], 0x41); // 'A'
  });

  it("Date32: signed days", () => {
    const buf = new ArrayBuffer(4);
    new DataView(buf).setInt32(0, -100, true);
    const data = new Uint8Array([0x10, ...new Uint8Array(buf)]);
    assert.strictEqual(decodeBinaryValue(data), -100);
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
  // Scalars
  const scalarCases: [string, unknown][] = [
    ["null", null],
    ["true", true],
    ["false", false],
    ["integer 42", 42],
    ["negative integer -7", -7],
    ["bigint 999n", 999n],
    ["float 3.14", 3.14],
    ["string hello", "hello"],
    ["empty string", ""],
  ];

  for (const [label, value] of scalarCases) {
    it(`round-trips ${label}`, () => {
      const encoded = encodeBinaryValue(value);
      const decoded = decodeBinaryValue(encoded);

      if (typeof value === "number" && !Number.isInteger(value)) {
        assert.ok(Math.abs((decoded as number) - value) < 1e-10);
      } else if (typeof value === "number" && Number.isInteger(value)) {
        // integers encode as Int64, decode as bigint
        assert.strictEqual(decoded, BigInt(value));
      } else {
        assert.deepStrictEqual(decoded, value);
      }
    });
  }

  // Containers
  it("round-trips empty array", () => {
    const encoded = encodeBinaryValue([]);
    assert.deepStrictEqual(decodeBinaryValue(encoded), []);
  });

  it("round-trips Array(Int64)", () => {
    const encoded = encodeBinaryValue([10, 20, 30]);
    const decoded = decodeBinaryValue(encoded) as unknown[];
    assert.strictEqual(decoded.length, 3);
    assert.strictEqual(decoded[0], 10n);
    assert.strictEqual(decoded[1], 20n);
    assert.strictEqual(decoded[2], 30n);
  });

  it("round-trips Array(String)", () => {
    const encoded = encodeBinaryValue(["foo", "bar", ""]);
    const decoded = decodeBinaryValue(encoded) as unknown[];
    assert.deepStrictEqual(decoded, ["foo", "bar", ""]);
  });

  it("round-trips nested Array(Array(Int64))", () => {
    const encoded = encodeBinaryValue([[1, 2], [3]]);
    const decoded = decodeBinaryValue(encoded) as unknown[][];
    assert.strictEqual(decoded.length, 2);
    assert.deepStrictEqual(decoded[0], [1n, 2n]);
    assert.deepStrictEqual(decoded[1], [3n]);
  });
});
