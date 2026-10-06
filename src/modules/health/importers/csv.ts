/**
 * A small RFC 4180 CSV reader, shared by the Strong / Hevy / FitNotes parsers.
 * Handles quoted fields, embedded delimiters and newlines, doubled quotes, a
 * UTF-8 BOM and CRLF/LF/CR line ends, and sniffs `,` / `;` / tab as the
 * delimiter (European spreadsheets save `;`). Following openGym's importer
 * (AGPL-3.0): splitting on commas would silently shift every column after the
 * first exercise called "Bench Press, Close Grip".
 */

export type CsvDelimiter = "," | ";" | "\t";

const DELIMITERS: readonly CsvDelimiter[] = [",", ";", "\t"];

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/** The delimiter used by a header line: whichever candidate occurs most outside quotes. */
export function sniffDelimiter(headerLine: string): CsvDelimiter {
  const counts = new Map<CsvDelimiter, number>(DELIMITERS.map((d) => [d, 0]));
  let quoted = false;
  for (const ch of stripBom(headerLine)) {
    if (ch === '"') quoted = !quoted;
    else if (!quoted && counts.has(ch as CsvDelimiter)) {
      counts.set(ch as CsvDelimiter, (counts.get(ch as CsvDelimiter) ?? 0) + 1);
    }
  }
  let best: CsvDelimiter = ",";
  let bestCount = 0;
  for (const d of DELIMITERS) {
    const n = counts.get(d) ?? 0;
    if (n > bestCount) {
      best = d;
      bestCount = n;
    }
  }
  return best;
}

/** First physical line of a text (up to the first CR or LF). */
export function firstLine(text: string): string {
  const s = stripBom(text);
  const end = s.search(/[\r\n]/);
  return end < 0 ? s : s.slice(0, end);
}

/**
 * Parses CSV text into rows of cells. Blank lines are dropped. The delimiter
 * is sniffed from the first line unless given.
 */
export function parseCsv(text: string, delimiter?: CsvDelimiter): string[][] {
  const s = stripBom(text);
  const delim = delimiter ?? sniffDelimiter(firstLine(s));
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const endRow = () => {
    row.push(field);
    field = "";
    if (row.some((cell) => cell !== "")) rows.push(row);
    row = [];
  };
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === delim) {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      endRow();
    } else field += c;
  }
  if (field !== "" || row.length > 0) endRow();
  return rows;
}

/** Lower-cases a header and collapses punctuation: "Weight (kg)" -> "weight kg". */
export function normalizeHeader(header: string): string {
  return header
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
