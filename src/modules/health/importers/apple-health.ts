/**
 * Apple Health body weight. Health's own export is one `export.xml` — often
 * several hundred MB, nearly all of it step counts and heart rate — so this
 * never builds a DOM or holds the file: `AppleHealthParser` is fed text chunks
 * and scans for `<Record type="HKQuantityTypeIdentifierBodyMass" …>` tags,
 * carrying a partial tag across chunk boundaries. Approach after openGym's
 * `parseBodyweight` (AGPL-3.0), made streaming.
 *
 * One weigh-in per day (the latest that day). Units are read per record:
 * kg stays, lb → kg, g → kg. Anything else becomes a warning.
 */
import { lbToKg, round, WarningCollector } from "./shared";
import type { ImportedWeighIn, ParseResult } from "./types";

const TYPE = "HKQuantityTypeIdentifierBodyMass";
const OPEN = "<Record ";
/** A record tag is a few hundred bytes; past this without a `>` it's garbage. */
const MAX_TAG = 20_000;

export class AppleHealthParser {
  private buffer = "";
  private readonly byDay = new Map<string, { at: string; kg: number }>();
  private readonly warnings = new WarningCollector();
  private found = 0;

  /** Number of body-mass records seen so far. */
  get recordsFound(): number {
    return this.found;
  }

  push(chunk: string): void {
    this.buffer += chunk;
    let from = 0;
    for (;;) {
      const start = this.buffer.indexOf(OPEN, from);
      if (start < 0) {
        // Keep a tail that could be the beginning of "<Record " split by the chunk.
        this.buffer = this.buffer.slice(Math.max(from, this.buffer.length - OPEN.length));
        return;
      }
      const end = this.buffer.indexOf(">", start);
      if (end < 0) {
        if (this.buffer.length - start > MAX_TAG) this.buffer = "";
        else this.buffer = this.buffer.slice(start);
        return;
      }
      const tag = this.buffer.slice(start, end + 1);
      if (tag.includes(TYPE)) this.readTag(tag);
      from = end + 1;
    }
  }

  private readTag(tag: string): void {
    const attrs = new Map<string, string>();
    for (const m of tag.matchAll(/([A-Za-z]+)="([^"]*)"/g)) attrs.set(m[1], m[2]);
    if (attrs.get("type") !== TYPE) return;
    this.found++;
    const value = Number(attrs.get("value"));
    const at = attrs.get("startDate") ?? attrs.get("creationDate") ?? "";
    const dm = /^(\d{4}-\d{2}-\d{2})/.exec(at);
    if (!Number.isFinite(value) || value <= 0 || !dm) {
      this.warnings.add(`Skipped a body-mass record with an unreadable value or date (${at}).`);
      return;
    }
    const unit = (attrs.get("unit") ?? "kg").toLowerCase();
    let kg: number;
    if (unit === "kg") kg = round(value, 2);
    else if (unit === "lb" || unit === "lbs") kg = lbToKg(value);
    else if (unit === "g") kg = round(value / 1000, 2);
    else {
      this.warnings.add(`Skipped a body-mass record in an unknown unit "${unit}" (${dm[1]}).`);
      return;
    }
    const prev = this.byDay.get(dm[1]);
    if (!prev || at >= prev.at) this.byDay.set(dm[1], { at, kg });
  }

  finish(): ParseResult {
    this.buffer = "";
    const weighIns: ImportedWeighIn[] = [...this.byDay.entries()]
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([date, v]) => ({ date, weightKg: v.kg }));
    if (this.found === 0) this.warnings.add("No body weight records were found in this file.");
    return { source: "apple_health", workouts: [], weighIns, warnings: this.warnings.result() };
  }
}

/** Reads a `Blob`/`File` of export.xml in streamed chunks, without loading it all. */
export async function parseAppleHealthBlob(
  blob: Blob,
  onProgress?: (fraction: number, recordsFound: number) => void,
): Promise<ParseResult> {
  const parser = new AppleHealthParser();
  const decoder = new TextDecoder("utf-8");
  const reader = blob.stream().getReader();
  let read = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    read += value.byteLength;
    parser.push(decoder.decode(value, { stream: true }));
    onProgress?.(blob.size > 0 ? Math.min(1, read / blob.size) : 1, parser.recordsFound);
  }
  parser.push(decoder.decode());
  onProgress?.(1, parser.recordsFound);
  return parser.finish();
}
