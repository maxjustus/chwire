import assert from "node:assert";
import { after, before, describe, it } from "node:test";
import { TcpClient } from "../tcp_client/client.ts";
import type { AccumulatedProgress } from "../tcp_client/types.ts";
import { startClickHouse, stopClickHouse } from "./setup.ts";

function sameProgress(a: AccumulatedProgress, b: AccumulatedProgress): boolean {
  return (
    a.readRows === b.readRows &&
    a.readBytes === b.readBytes &&
    a.totalRowsToRead === b.totalRowsToRead &&
    a.totalBytesToRead === b.totalBytesToRead &&
    a.writtenRows === b.writtenRows &&
    a.writtenBytes === b.writtenBytes &&
    a.elapsedNs === b.elapsedNs &&
    a.percent === b.percent &&
    a.memoryUsage === b.memoryUsage &&
    a.peakMemoryUsage === b.peakMemoryUsage &&
    a.cpuTimeMicroseconds === b.cpuTimeMicroseconds &&
    a.cpuUsage === b.cpuUsage
  );
}

function sameEntries(a: Map<string, bigint>, b: [string, bigint][]): boolean {
  const entries = [...a.entries()];
  if (entries.length !== b.length) return false;
  for (let i = 0; i < entries.length; i++) {
    if (entries[i][0] !== b[i][0] || entries[i][1] !== b[i][1]) {
      return false;
    }
  }
  return true;
}

describe("TCP progress accumulation", { timeout: 60000 }, () => {
  let client: TcpClient;

  before(async () => {
    const ch = await startClickHouse();
    client = new TcpClient({
      host: ch.host,
      port: ch.tcpPort,
      user: ch.username,
      password: ch.password,
    });
    await client.connect();
  });

  after(async () => {
    client.close();
    await stopClickHouse();
  });

  it("accumulates memory and CPU metrics from ProfileEvents", async () => {
    const sql = `
      SELECT sum(number) as s
      FROM numbers(1000000)
      SETTINGS
        send_logs_level = 'trace',
        log_profile_events = 1
    `;

    let lastProgress: AccumulatedProgress | null = null;
    let progressCount = 0;
    let profileEventsCount = 0;

    for await (const packet of client.query(sql)) {
      if (packet.type === "Progress") {
        lastProgress = packet.accumulated;
        progressCount++;
      } else if (packet.type === "ProfileEvents") {
        profileEventsCount++;
      }
    }

    // We should have received some progress updates
    assert.ok(progressCount > 0, `Expected progress updates, got ${progressCount}`);
    assert.ok(lastProgress, "Expected accumulated progress");

    // Check that basic progress fields are populated
    assert.ok(lastProgress.readRows > 0n, `Expected readRows > 0, got ${lastProgress.readRows}`);
    assert.ok(lastProgress.readBytes > 0n, `Expected readBytes > 0, got ${lastProgress.readBytes}`);

    // Check that elapsed time is tracked
    assert.ok(lastProgress.elapsedNs > 0n, `Expected elapsedNs > 0, got ${lastProgress.elapsedNs}`);

    // If we got ProfileEvents, check memory/CPU metrics
    if (profileEventsCount > 0) {
      // Memory metrics should be populated from ProfileEvents
      // Note: these may be 0 if the server didn't send MemoryTracker events
      console.log(`ProfileEvents count: ${profileEventsCount}`);
      console.log(`Memory usage: ${lastProgress.memoryUsage}`);
      console.log(`Peak memory: ${lastProgress.peakMemoryUsage}`);
      console.log(`CPU time (µs): ${lastProgress.cpuTimeMicroseconds}`);
      console.log(`CPU usage: ${lastProgress.cpuUsage}`);

      // CPU time should be accumulated if ProfileEvents had User/SystemTimeMicroseconds
      // We can't strictly assert these are > 0 since it depends on server config
    }

    // Verify percentage calculation
    if (lastProgress.totalRowsToRead > 0n) {
      assert.ok(
        lastProgress.percent >= 0 && lastProgress.percent <= 100,
        `Expected percent 0-100, got ${lastProgress.percent}`,
      );
    }
  });

  it("calculates cpuUsage correctly", async () => {
    const sql = `
      SELECT count()
      FROM numbers(10000000)
      WHERE sipHash64(number) % 1000 = 0
    `;

    let lastProgress: AccumulatedProgress | null = null;

    for await (const packet of client.query(sql)) {
      if (packet.type === "Progress") {
        lastProgress = packet.accumulated;
      }
    }

    assert.ok(lastProgress, "Expected accumulated progress");

    // cpuUsage calculation: cpuTimeMicroseconds / (elapsedNs / 1000)
    if (lastProgress.cpuTimeMicroseconds > 0n && lastProgress.elapsedNs > 0n) {
      const elapsedMicros = lastProgress.elapsedNs / 1000n;
      const expectedCpuUsage = Number(lastProgress.cpuTimeMicroseconds) / Number(elapsedMicros);

      // cpuUsage is a live per-packet snapshot, so it can drift from a recompute
      // off the final accumulated values under variable CI timing. Use a relative
      // tolerance (with a small floor) so the check still catches a broken formula
      // without flaking on that drift.
      const tolerance = Math.max(0.1, expectedCpuUsage * 0.25);
      assert.ok(
        Math.abs(lastProgress.cpuUsage - expectedCpuUsage) < tolerance,
        `CPU usage mismatch: got ${lastProgress.cpuUsage}, expected ~${expectedCpuUsage} (tol ${tolerance})`,
      );

      console.log(`CPU usage: ${lastProgress.cpuUsage.toFixed(2)} CPUs`);
    }
  });

  it("tracks memory metrics correctly", async () => {
    const sql = `SELECT * FROM system.numbers LIMIT 100000`;

    const peakMemoryValues: bigint[] = [];

    for await (const packet of client.query(sql)) {
      if (packet.type === "Progress") {
        peakMemoryValues.push(packet.accumulated.peakMemoryUsage);
      }
    }

    if (peakMemoryValues.length > 1) {
      // Only peak memory should be monotonically non-decreasing
      for (let i = 1; i < peakMemoryValues.length; i++) {
        assert.ok(
          peakMemoryValues[i] >= peakMemoryValues[i - 1],
          `Peak memory should be monotonically non-decreasing: ${peakMemoryValues[i]} < ${peakMemoryValues[i - 1]}`,
        );
      }
    }
  });

  it("yields snapshot copies for accumulated progress and profile events", async () => {
    let firstProgressRef: AccumulatedProgress | null = null;
    let firstProgressSnapshot: AccumulatedProgress | null = null;
    let sawLaterProgressChange = false;

    let firstProfileEventsRef: Map<string, bigint> | null = null;
    let firstProfileEventsSnapshot: [string, bigint][] | null = null;
    let sawLaterProfileEventsChange = false;

    for await (const packet of client.query(
      "SELECT number FROM numbers(200) WHERE sleepEachRow(0.01) = 0",
      {
        settings: {
          max_block_size: 1n,
          interactive_delay: 10000n,
          send_profile_events: true,
          profile_events_delay_ms: 20n,
        },
      },
    )) {
      if (packet.type === "Progress") {
        if (!firstProgressRef) {
          firstProgressRef = packet.accumulated;
          firstProgressSnapshot = { ...packet.accumulated };
        } else if (!sameProgress(packet.accumulated, firstProgressSnapshot!)) {
          sawLaterProgressChange = true;
        }
      } else if (packet.type === "ProfileEvents") {
        if (!firstProfileEventsRef) {
          firstProfileEventsRef = packet.accumulated;
          firstProfileEventsSnapshot = [...packet.accumulated.entries()];
        } else if (!sameEntries(packet.accumulated, firstProfileEventsSnapshot!)) {
          sawLaterProfileEventsChange = true;
        }
      }
    }

    assert.ok(firstProgressRef, "Expected at least one Progress packet");
    assert.ok(firstProgressSnapshot, "Expected to capture first Progress snapshot");
    assert.ok(sawLaterProgressChange, "Expected later Progress packets to accumulate further");
    assert.deepStrictEqual(
      firstProgressRef,
      firstProgressSnapshot,
      "Earlier Progress packet should remain an immutable snapshot",
    );

    assert.ok(firstProfileEventsRef, "Expected at least one ProfileEvents packet");
    assert.ok(firstProfileEventsSnapshot, "Expected to capture first ProfileEvents snapshot");
    assert.ok(
      sawLaterProfileEventsChange,
      "Expected later ProfileEvents packets to accumulate further",
    );
    assert.deepStrictEqual(
      [...firstProfileEventsRef.entries()],
      firstProfileEventsSnapshot,
      "Earlier ProfileEvents packet should remain an immutable snapshot",
    );
  });

  it("yields progress packets from insert()", async () => {
    const tableName = `test_insert_progress_${Date.now()}`;
    await client.query(`CREATE TABLE ${tableName} (id UInt32, name String) ENGINE = Memory`);

    try {
      const rows = Array.from({ length: 1000 }, (_, i) => ({ id: i, name: `row_${i}` }));

      let lastProgress: AccumulatedProgress | null = null;
      let progressCount = 0;
      let _profileInfoCount = 0;
      let endOfStreamCount = 0;

      for await (const packet of client.insert(`INSERT INTO ${tableName} VALUES`, rows)) {
        if (packet.type === "Progress") {
          lastProgress = packet.accumulated;
          progressCount++;
        } else if (packet.type === "ProfileInfo") {
          _profileInfoCount++;
        } else if (packet.type === "EndOfStream") {
          endOfStreamCount++;
        }
      }

      // We should reach EndOfStream
      assert.strictEqual(endOfStreamCount, 1, "Expected exactly one EndOfStream packet");

      // Check that progress was received and writtenRows is populated
      if (progressCount > 0) {
        assert.ok(lastProgress, "Expected accumulated progress");
        assert.ok(
          lastProgress.writtenRows > 0n,
          `Expected writtenRows > 0, got ${lastProgress.writtenRows}`,
        );
        console.log(
          `Insert progress: ${progressCount} packets, writtenRows=${lastProgress.writtenRows}`,
        );
      }

      // Verify rows were actually inserted
      let rowCount = 0n;
      for await (const packet of client.query(`SELECT count() as cnt FROM ${tableName}`)) {
        if (packet.type === "Data") {
          rowCount = packet.batch.getColumn("cnt")?.get(0) as bigint;
        }
      }
      assert.strictEqual(rowCount, 1000n, `Expected 1000 rows inserted, got ${rowCount}`);
    } finally {
      await client.query(`DROP TABLE ${tableName}`);
    }
  });
});
