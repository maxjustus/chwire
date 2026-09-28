/**
 * Parsers for framed HTTP responses (ClickHouse 26.8+, setting
 * `framing_output_format`). A framing format multiplexes data, totals,
 * extremes, progress, logs, profile events, and exceptions into one response
 * stream. The concatenation of the decoded payloads of the data, totals, and
 * extremes packets is exactly what the output format would have produced
 * without framing.
 */

export type FramingFormat = "EventStream" | "JSONEachPacketBase64" | "JSONEachPacketString";

/** One row of a `log` packet. All fields are strings on the wire. */
export interface HttpLogEntry {
  /** Includes microseconds: `2026-09-28 19:08:55.984860` */
  event_time: string;
  host_name: string;
  query_id: string;
  thread_id: string;
  priority: string;
  source: string;
  text: string;
}

/** One row of a `profile_events` packet. All fields are strings on the wire. */
export interface HttpProfileEvent {
  host_name: string;
  current_time: string;
  thread_id: string;
  type: "gauge" | "increment";
  name: string;
  value: string;
}

export type FramedPacket =
  | { kind: "data" | "totals" | "extremes"; payload: Uint8Array }
  | { kind: "progress"; progress: Record<string, string> }
  | { kind: "log"; entry: HttpLogEntry }
  | { kind: "profile_events"; events: HttpProfileEvent[] }
  | { kind: "exception"; message: string };

const encoder = new TextEncoder();

function base64Decode(s: string): Uint8Array {
  if (typeof Buffer !== "undefined") return new Uint8Array(Buffer.from(s, "base64"));
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * Every packet ends with `delimiter`, so text left over at end of stream means
 * the server closed the connection mid-packet.
 */
async function* parseRecords(
  chunks: AsyncIterable<Uint8Array>,
  delimiter: string,
  parseRecord: (record: string) => FramedPacket | undefined,
): AsyncGenerator<FramedPacket> {
  const decoder = new TextDecoder();
  let pending = "";
  let from = 0;
  for await (const chunk of chunks) {
    pending += decoder.decode(chunk, { stream: true });
    let end: number;
    while ((end = pending.indexOf(delimiter, from)) >= 0) {
      const packet = end > 0 ? parseRecord(pending.slice(0, end)) : undefined;
      pending = pending.slice(end + delimiter.length);
      from = 0;
      if (packet) yield packet;
    }
    // A delimiter can span the chunk boundary. Rescan only the overhang.
    from = Math.max(0, pending.length - delimiter.length + 1);
  }
  if (pending + decoder.decode()) {
    throw new Error("Truncated framed response: the stream ended mid-packet");
  }
}

/**
 * Server-sent event: `event: <kind>\ndata: <payload>`. Payload packets are
 * base64, with no line breaks, so they are always one data field. Auxiliary
 * packets are JSON.
 */
function parseSseEvent(text: string): FramedPacket | undefined {
  let kind = "";
  const data: string[] = [];
  for (const line of text.split("\n")) {
    if (line.startsWith("event:")) kind = line.slice(6).trim();
    else if (line.startsWith("data:")) data.push(line.slice(5).replace(/^ /, ""));
  }
  if (!kind || data.length === 0) return undefined;
  const body = data.join("\n");
  switch (kind) {
    case "data":
    case "totals":
    case "extremes":
      return { kind, payload: base64Decode(body) };
    case "progress":
      return { kind: "progress", progress: JSON.parse(body) };
    case "log":
      return { kind: "log", entry: JSON.parse(body) };
    case "profile_events":
      return { kind: "profile_events", events: JSON.parse(body) };
    case "exception":
      return { kind: "exception", message: JSON.parse(body).exception };
    // unknown packet kinds are ignored for forward compatibility
    default:
      return undefined;
  }
}

/** JSONEachPacket line: one JSON object, `packet` selects the kind. */
function parseJsonPacket(
  line: string,
  decodePayload: (data: string) => Uint8Array,
): FramedPacket | undefined {
  const obj = JSON.parse(line) as Record<string, unknown>;
  const kind = obj.packet as string;
  switch (kind) {
    case "data":
    case "totals":
    case "extremes":
      return { kind, payload: decodePayload(obj.data as string) };
    case "progress":
      return { kind: "progress", progress: obj.progress as Record<string, string> };
    case "log":
      return { kind: "log", entry: obj.log as HttpLogEntry };
    case "profile_events":
      return { kind: "profile_events", events: obj.profile_events as HttpProfileEvent[] };
    case "exception":
      return { kind: "exception", message: obj.exception as string };
    // unknown packet kinds are ignored for forward compatibility
    default:
      return undefined;
  }
}

const parsers: Record<
  FramingFormat,
  (chunks: AsyncIterable<Uint8Array>) => AsyncGenerator<FramedPacket>
> = {
  EventStream: (chunks) => parseRecords(chunks, "\n\n", parseSseEvent),
  JSONEachPacketBase64: (chunks) =>
    parseRecords(chunks, "\n", (line) => parseJsonPacket(line, base64Decode)),
  JSONEachPacketString: (chunks) =>
    parseRecords(chunks, "\n", (line) => parseJsonPacket(line, (data) => encoder.encode(data))),
};

/** Split a framed response body into packets. */
export function parseFramedStream(
  chunks: AsyncIterable<Uint8Array>,
  format: FramingFormat,
): AsyncGenerator<FramedPacket> {
  return parsers[format](chunks);
}
