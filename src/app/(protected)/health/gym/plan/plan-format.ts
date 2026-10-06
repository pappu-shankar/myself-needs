import { WEEKDAY_LABELS } from "@/modules/health/types";
import { parseIsoDate } from "@/lib/dates";

/** Weekdays Monday-first (the plan's display order); 0 = Sunday. */
export const MONDAY_FIRST = [1, 2, 3, 4, 5, 6, 0] as const;

/** "Mon 5 Oct" for an ISO date. */
export function formatPlanDate(iso: string): string {
  const date = parseIsoDate(iso);
  return `${WEEKDAY_LABELS[date.getDay()].slice(0, 3)} ${date.getDate()} ${date.toLocaleString("en-GB", { month: "short" })}`;
}

export type DayKind = "routine" | "rest" | "none";

/** What a planned day amounts to, for badges and copy. */
export function dayKind(day: {
  routineId: number | null;
  source: "override" | "week" | "none";
}): DayKind {
  if (day.routineId !== null) return "routine";
  return day.source === "none" ? "none" : "rest";
}

export function sourceLabel(source: "override" | "week" | "none"): string {
  if (source === "override") return "One-off change";
  if (source === "week") return "Weekly plan";
  return "Not planned";
}
