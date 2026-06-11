/**
 * Tests for HTTP Content-Encoding compression of query bodies.
 */

import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { collectJsonEachRow, init, query, type QueryOptions } from "../client.ts";
import { startClickHouse, stopClickHouse } from "./setup.ts";
import { generateSessionId } from "./test_utils.ts";

describe("HTTP query body compression", { timeout: 60000 }, () => {
  let clickhouse: Awaited<ReturnType<typeof startClickHouse>>;
  let baseUrl: string;
  let auth: { username: string; password: string };
  const sessionId = generateSessionId("http-compress");

  before(async () => {
    await init();
    clickhouse = await startClickHouse();
    baseUrl = `${clickhouse.url}/`;
    auth = { username: clickhouse.username, password: clickhouse.password };
  });

  after(async () => {
    await stopClickHouse();
  });

  const assertSuccessfulQuery = async (compressQuery: QueryOptions["compressQuery"]) => {
    // Large query with many values to make compression worthwhile
    const values = Array(500)
      .fill(0)
      .map((_, i) => i)
      .join(",");
    const queryStr = `SELECT number FROM system.numbers WHERE number IN (${values}) LIMIT 500 FORMAT JSONEachRow`;

    const rows = await collectJsonEachRow(
      query(queryStr, sessionId, {
        baseUrl,
        auth,
        compression: "zstd",
        ...(compressQuery !== undefined ? { compressQuery } : {}),
      }),
    );

    // Should return 500 rows
    assert.strictEqual(rows.length, 500);
  };

  for (const compression of ["zstd", "lz4", undefined] as const) {
    it(`runs query when compressQuery is set to '${compression}'`, async () => {
      await assertSuccessfulQuery(compression);
    });
  }

  it("sends zstd-compressed query body with a custom compression level", async () => {
    await assertSuccessfulQuery({ method: "zstd", level: 6 });
  });
});
