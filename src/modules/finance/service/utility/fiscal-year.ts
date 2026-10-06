import { todayIso } from "@/lib/dates";

/** An Indian financial year (April 1 – March 31). `end` is inclusive. */
export interface FiscalYear {
  /** e.g. "2025-26" — the key tax settings and slabs are stored under. */
  label: string;
  /** e.g. "2025-04-01". */
  start: string;
  /** e.g. "2026-03-31" (inclusive). */
  end: string;
}

function fromStartYear(startYear: number): FiscalYear {
  return {
    label: `${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`,
    start: `${startYear}-04-01`,
    end: `${startYear + 1}-03-31`,
  };
}

/** The FY a `YYYY-MM-DD` date falls in: 2025-03-31 → "2024-25", 2025-04-01 → "2025-26". */
export function fiscalYearOf(isoDate: string): FiscalYear {
  const match = /^(\d{4})-(\d{2})-\d{2}$/.exec(isoDate);
  if (!match) throw new RangeError(`Not an ISO date: ${isoDate}`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  return fromStartYear(month >= 4 ? year : year - 1);
}

/** The FY "today" (local date) falls in. */
export function currentFiscalYear(): FiscalYear {
  return fiscalYearOf(todayIso());
}

/** Parses a label like "2025-26"; null for anything malformed (e.g. "2025-27"). */
export function parseFiscalYearLabel(label: string | null | undefined): FiscalYear | null {
  const match = /^(\d{4})-(\d{2})$/.exec(label ?? "");
  if (!match) return null;
  const startYear = Number(match[1]);
  if (startYear < 1900 || (startYear + 1) % 100 !== Number(match[2])) return null;
  return fromStartYear(startYear);
}

/** The FY `offset` years after (or before, if negative) `fy`. */
export function shiftFiscalYear(fy: FiscalYear, offset: number): FiscalYear {
  return fromStartYear(Number(fy.start.slice(0, 4)) + offset);
}
