/**
 * Tests for bounds validation and silent failure detection.
 *
 * Covers:
 * - LowCardinality dictionary index bounds
 * - IPv6 validation parity with IPv4
 */

import assert from "node:assert";
import { describe, it } from "node:test";
import { decodeNativeBlock } from "../../native/index.ts";
import { toValidIPv4, toValidIPv6 } from "../../native/coercion.ts";
import { LowCardinality as LC } from "../../native/constants.ts";
import { DecimalCodec } from "../../native/codecs/scalar.ts";
import { buildTestBlock } from "../test_utils.ts";

describe("bounds validation", () => {
  describe("LowCardinality index bounds", () => {
    /** Build LowCardinality block with specific dictionary and indices. */
    function buildLowCardBlock(dictValues: string[], indices: number[]): Uint8Array {
      return buildTestBlock({
        colName: "val",
        colType: "LowCardinality(String)",
        rows: indices.length,
        prefix: (w) => w.writeU64LE(LC.VERSION),
        data: (w) => {
          // Flags: additional keys + index type U8
          w.writeU64LE(LC.FLAG_ADDITIONAL_KEYS | LC.INDEX_U8);

          // Dictionary size and values
          w.writeU64LE(BigInt(dictValues.length));
          for (const s of dictValues) {
            const bytes = new TextEncoder().encode(s);
            w.writeVarint(bytes.length);
            w.write(bytes);
          }

          // Row count and indices
          w.writeU64LE(BigInt(indices.length));
          w.write(new Uint8Array(indices));
        },
      });
    }

    it("handles valid dictionary indices", () => {
      // Dictionary: ["apple", "banana"], indices: [0, 1, 0]
      const block = buildLowCardBlock(["apple", "banana"], [0, 1, 0]);
      const result = decodeNativeBlock(block, 0, { clientVersion: 54454 });

      assert.strictEqual(result.rowCount, 3);
      assert.strictEqual(result.columnData[0]!.get(0), "apple");
      assert.strictEqual(result.columnData[0]!.get(1), "banana");
      assert.strictEqual(result.columnData[0]!.get(2), "apple");
    });

    it("throws on out-of-bounds dictionary index", () => {
      // Dictionary has 2 entries [0, 1], but index 5 is used
      const block = buildLowCardBlock(["a", "b"], [0, 5, 1]);

      assert.throws(
        () => decodeNativeBlock(block, 0, { clientVersion: 54454 }),
        /LowCardinality index 5 out of bounds \(dictionary size: 2\)/,
      );
    });
  });

  describe("IPv4 vs IPv6 validation asymmetry", () => {
    describe("IPv4 validation (strict)", () => {
      it("accepts valid IPv4", () => {
        assert.strictEqual(toValidIPv4("192.168.1.1"), "192.168.1.1");
        assert.strictEqual(toValidIPv4("0.0.0.0"), "0.0.0.0");
        assert.strictEqual(toValidIPv4("255.255.255.255"), "255.255.255.255");
      });

      it("returns default for null/undefined", () => {
        assert.strictEqual(toValidIPv4(null), "0.0.0.0");
        assert.strictEqual(toValidIPv4(undefined), "0.0.0.0");
      });

      it("throws on invalid format", () => {
        assert.throws(() => toValidIPv4("not-an-ip"), /Invalid IPv4/);
        assert.throws(() => toValidIPv4("192.168.1"), /Invalid IPv4/);
        assert.throws(() => toValidIPv4("192.168.1.1.1"), /Invalid IPv4/);
      });

      it("throws on octet out of range", () => {
        assert.throws(() => toValidIPv4("256.1.1.1"), /octet 256 > 255/);
        assert.throws(() => toValidIPv4("1.1.1.999"), /octet 999 > 255/);
      });
    });

    describe("IPv6 validation (now validates)", () => {
      it("accepts valid IPv6", () => {
        assert.strictEqual(toValidIPv6("::1"), "::1");
        assert.strictEqual(toValidIPv6("::"), "::");
        assert.strictEqual(toValidIPv6("2001:db8::1"), "2001:db8::1");
        assert.strictEqual(
          toValidIPv6("2001:0db8:0000:0000:0000:0000:0000:0001"),
          "2001:0db8:0000:0000:0000:0000:0000:0001",
        );
        // IPv4-mapped IPv6
        assert.strictEqual(toValidIPv6("::ffff:192.168.1.1"), "::ffff:192.168.1.1");
      });

      it("returns default for null/undefined", () => {
        assert.strictEqual(toValidIPv6(null), "::");
        assert.strictEqual(toValidIPv6(undefined), "::");
      });

      it("throws on empty string", () => {
        assert.throws(() => toValidIPv6(""), /Invalid IPv6 address: empty string/);
      });

      it("throws on zone IDs (not representable in 16 bytes)", () => {
        assert.throws(() => toValidIPv6("fe80::1%eth0"), /zone ID/);
      });

      it("throws on invalid characters", () => {
        assert.throws(() => toValidIPv6("not-an-ip"), /Invalid IPv6 address/);
        assert.throws(() => toValidIPv6("hello world"), /Invalid IPv6 address/);
        assert.throws(() => toValidIPv6("ghij::1"), /Invalid IPv6 address/);
      });

      it("throws on IPv4 without colons", () => {
        // Pure IPv4 should fail (no colons)
        assert.throws(() => toValidIPv6("192.168.1.1"), /no colons/);
      });

      it("throws on numbers", () => {
        assert.throws(() => toValidIPv6(12345), /no colons/);
      });
    });
  });
});

describe("DecimalCodec construction", () => {
  it("throws on unrecognized Decimal type string", () => {
    // decimalByteSize previously had a silent return 16 fallback; this should throw
    assert.throws(() => new DecimalCodec("DecimalXYZ(5)"), TypeError);
  });
});
