/**
 * Works out which import a file is, from its header line (CSV) or its first
 * bytes (XML / JSON). Pass either just the first line or the whole text —
 * only the first couple of kilobytes are looked at, so the caller can sniff a
 * multi-hundred-MB Apple Health export by slicing its first chunk.
 */
import { firstLine, normalizeHeader, parseCsv, sniffDelimiter } from "./csv";
import { parseFitNotes } from "./fitnotes";
import { parseHevy } from "./hevy";
import { ImportFormatError } from "./validate";
import { parseStrong } from "./strong";
import type { CsvParseOptions } from "./shared";
import type { ParseResult } from "./types";
import type { ImportSource } from "../gym-types";

const SNIFF_BYTES = 4096;

export function detectSource(input: string): ImportSource | null {
  const head = (input.charCodeAt(0) === 0xfeff ? input.slice(1) : input).slice(0, SNIFF_BYTES);
  const trimmed = head.trimStart();

  if (trimmed.startsWith("{")) {
    if (trimmed.includes('"personal-life-os/gym-plan"')) return "plan_file";
    if (trimmed.includes('"personal-life-os/gym-backup"')) return "backup";
    return null;
  }
  if (trimmed.startsWith("<")) {
    return /HealthData|HKQuantityTypeIdentifier|<Record\b/.test(head) ? "apple_health" : null;
  }

  const line = firstLine(head);
  const header = parseCsv(line, sniffDelimiter(line))[0]?.map(normalizeHeader) ?? [];
  const has = (name: string) => header.includes(name);
  if (has("exercise title") && has("set index")) return "hevy";
  if (has("exercise name") && has("set order")) return "strong";
  if (has("exercise") && (has("category") || has("weight unit") || has("kind"))) return "fitnotes";
  return null;
}

/**
 * Detects and parses a workout CSV (Strong / Hevy / FitNotes). Throws a
 * friendly `ImportFormatError` when the text is none of them.
 */
export function parseWorkoutCsv(text: string, options: CsvParseOptions = {}): ParseResult {
  switch (detectSource(text)) {
    case "strong":
      return parseStrong(text, options);
    case "hevy":
      return parseHevy(text, options);
    case "fitnotes":
      return parseFitNotes(text, options);
    default:
      throw new ImportFormatError(
        "This doesn't look like a Strong, Hevy or FitNotes CSV export. Check the file and try again.",
      );
  }
}
