const dateTime = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" });

/** "5 Oct 2026, 2:14 pm" for an epoch-millisecond timestamp. Used server-side
 * (pages pass the formatted string down), so there's no hydration mismatch. */
export function formatWhen(ms: number): string {
  return dateTime.format(new Date(ms));
}
