import type { TransactionsCursor } from "@/modules/finance";

/** `?before=<date>_<id>` / `?after=<date>_<id>` — a transaction's position in the `(date DESC, id DESC)` ordering. */
export function encodeCursor(cursor: TransactionsCursor): string {
  return `${cursor.date}_${cursor.id}`;
}

const CURSOR_PATTERN = /^(\d{4}-\d{2}-\d{2})_(\d+)$/;

/** Ignores anything malformed (stale bookmark, tampered URL) rather than throwing — falls back to the first page. */
export function parseCursor(raw: string | undefined): TransactionsCursor | undefined {
  if (!raw) return undefined;
  const match = CURSOR_PATTERN.exec(raw);
  if (!match) return undefined;
  return { date: match[1], id: Number(match[2]) };
}
