import { todayIso } from "@/lib/dates";

/** Saves JSON as a file download via a Blob + object URL. */
export function downloadJson(prefix: string, data: unknown): string {
  const filename = `${prefix}-${todayIso()}.json`;
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return filename;
}

export const nf = new Intl.NumberFormat("en-US");

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Something went wrong.";
}

export function dateRange(dates: string[]): string {
  if (dates.length === 0) return "none";
  let min = dates[0];
  let max = dates[0];
  for (const d of dates) {
    if (d < min) min = d;
    if (d > max) max = d;
  }
  return min === max ? min : `${min} to ${max}`;
}
