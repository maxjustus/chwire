/**
 * Type verification test for npm package consumers.
 *
 * This test verifies that TypeScript types are correctly exported
 * and resolve properly when importing from dist/.d.ts files.
 *
 * Run with: npm run test:types
 *
 * Note: This file is type-checked with a separate tsconfig (test/tsconfig.types.json)
 * that doesn't have noUnusedLocals enabled, since this is a type verification file.
 */

// Import from main entry point (uses dist/index.d.ts)
import type { ColumnDef, Compression } from "@maxjustus/chttp";
import { query, insert, encodeNative } from "@maxjustus/chttp";

// Import from /native entry point (uses dist/native/index.d.ts)
import type { Block, PartialBlockState } from "@maxjustus/chttp/native";

// Import from /tcp entry point (uses dist/tcp_client/index.d.ts)
import type { TcpClient, Packet, TcpClientOptions, ClickHouseSettings } from "@maxjustus/chttp/tcp";

// Type assertions - these will fail at compile time if types are wrong
function assertTypes() {
  // Main exports
  const columnDef: ColumnDef = { name: "test", type: "String" };
  const compression: Compression = "lz4";

  // Native exports
  const block: Block = {
    columns: [{ name: "id", type: "UInt64" }],
    columnData: [],
    rowCount: 0,
  };
  const partialState: PartialBlockState = {
    columns: [],
    columnData: [],
    numCols: 0,
    numRows: 0,
    nextColIndex: 0,
    resumeOffset: 0,
    startOffset: 0,
  };

  // TCP exports - verify types exist
  const tcpTypes: [TcpClient?, Packet?, TcpClientOptions?, ClickHouseSettings?] = [];

  // Function type verification
  const q: typeof query = query;
  const i: typeof insert = insert;
  const e: typeof encodeNative = encodeNative;

  return { columnDef, compression, block, partialState, tcpTypes, q, i, e };
}

console.log("Type verification passed:", typeof assertTypes);
