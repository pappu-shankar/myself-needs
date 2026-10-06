/**
 * Calendar dates as `YYYY-MM-DD` strings in the LOCAL timezone of the machine
 * running the app (which, for this local-only app, is the user's own).
 *
 * Never use `new Date().toISOString().slice(0, 10)` for "today": that is the UTC
 * date, which in India is still yesterday until 05:30.
 */

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function toIsoDate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function todayIso(): string {
  return toIsoDate(new Date());
}

/**
 * Local wall-clock date-time `YYYY-MM-DDTHH:mm:ss` with no zone suffix — how
 * timestamps the user reads back (a workout's start/finish, a set's
 * completion) are stored. Same reason as `toIsoDate`: `toISOString()` is UTC.
 */
export function toLocalDateTime(date: Date): string {
  return `${toIsoDate(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export function nowLocalDateTime(): string {
  return toLocalDateTime(new Date());
}

/** Local midnight of an ISO date. Throws on anything that isn't a real date. */
export function parseIsoDate(iso: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) throw new RangeError(`Not an ISO date: ${iso}`);
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    throw new RangeError(`Not a real calendar date: ${iso}`);
  }
  return date;
}

export function addDays(iso: string, days: number): string {
  const date = parseIsoDate(iso);
  date.setDate(date.getDate() + days);
  return toIsoDate(date);
}

/** Calendar-month arithmetic that clamps to the end of shorter months:
 * 2024-01-31 + 1 month = 2024-02-29. */
export function addMonths(iso: string, months: number): string {
  const date = parseIsoDate(iso);
  const day = date.getDate();
  date.setDate(1);
  date.setMonth(date.getMonth() + months);
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  date.setDate(Math.min(day, lastDay));
  return toIsoDate(date);
}

export function addYears(iso: string, years: number): string {
  return addMonths(iso, years * 12);
}

/** Whole days from `from` to `to` (negative if `to` is earlier). DST-safe. */
export function daysBetween(from: string, to: string): number {
  const a = parseIsoDate(from);
  const b = parseIsoDate(to);
  return Math.round(
    (Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) -
      Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) /
      86_400_000,
  );
}

export function startOfMonth(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

export function endOfMonth(iso: string): string {
  return addDays(addMonths(startOfMonth(iso), 1), -1);
}

/** `YYYY-MM` of an ISO date. */
export function monthKey(iso: string): string {
  return iso.slice(0, 7);
}
