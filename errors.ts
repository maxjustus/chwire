/**
 * ClickHouse server exception with full error details.
 * Shared between HTTP and TCP clients.
 */
export class ClickHouseException extends Error {
  readonly code: number;
  readonly exceptionName: string;
  readonly serverStackTrace: string;
  readonly hasNested: boolean;
  readonly nested?: ClickHouseException;

  constructor(
    code: number,
    exceptionName: string,
    message: string,
    serverStackTrace: string,
    hasNested: boolean,
    nested?: ClickHouseException,
  ) {
    super(`${exceptionName}: ${message}`);
    this.name = "ClickHouseException";
    this.code = code;
    this.exceptionName = exceptionName;
    this.serverStackTrace = serverStackTrace;
    this.hasNested = hasNested;
    this.nested = nested;
  }
}
