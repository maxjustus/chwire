/**
 * Shared types for query parameter handling.
 */

import type { ClickHouseDateTime64 } from "./native/types.ts";

/**
 * Query parameter value - supports primitives and complex types.
 *
 * Note: For non-nullable types, null/undefined values are coerced to the
 * type's zero value (0 for numbers, '' for strings, [] for arrays, etc.).
 * Use Nullable(T) in the query if you need to pass actual SQL NULL values.
 */
export type QueryParamValue =
  | string
  | number
  | boolean
  | bigint
  | null
  | Date
  | Uint8Array
  | ClickHouseDateTime64
  | Map<unknown, QueryParamValue>
  | QueryParamValue[]
  | { [key: string]: QueryParamValue };

/** Query parameters for parameterized queries like SELECT {x:UInt64} */
export type QueryParams = Record<string, QueryParamValue>;
