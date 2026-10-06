import { addDays, daysBetween, parseIsoDate } from "@/lib/dates";
import type { WorkoutRecord } from "./types";

/**
 * Calendar views of training: weeks, session minutes, the year heatmap and
 * weekly streaks. Weeks run Monday–Sunday (ISO 8601). All date math goes
 * through @/lib/dates, so it is local-calendar and DST-safe.
 */

/** Minutes credited per completed set when a session has no usable clock times. */
export const MINUTES_PER_SET = 2.5;

/**
 * A session "lasting" longer than this was almost certainly left open and
 * finished later (the next morning, say). Its clock span would read as a
 * 14-hour workout in the heatmap and the workload ratio, so the per-set
 * estimate is used instead.
 */
export const MAX_SESSION_MINUTES = 6 * 60;

/** The Monday of the week containing `date` (both ISO `YYYY-MM-DD`). */
export function weekStartOf(date: string): string {
  // getDay(): 0 = Sunday … 6 = Saturday; shift so Monday = 0.
  return addDays(date, -((parseIsoDate(date).getDay() + 6) % 7));
}

/** `YYYY-MM-DDTHH:mm[:ss]` local wall-clock time → Date, or null if unparseable. */
function parseLocalDateTime(value: string | null): Date | null {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/.exec(value);
  if (!m) return null;
  // Local constructor (not Date.UTC), so a session spanning a DST switch gets
  // its real elapsed time rather than its wall-clock difference.
  const date = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] ?? 0));
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * How long a session took, in whole minutes: finishedAt − startedAt. When the
 * workout is unfinished, its times are missing/unparseable, or the span is
 * implausible (≤ 0 or over MAX_SESSION_MINUTES), falls back to 2.5 min per
 * completed set — a typical working set plus its rest.
 */
export function workoutMinutes(w: WorkoutRecord): number {
  const start = parseLocalDateTime(w.startedAt);
  const end = parseLocalDateTime(w.finishedAt);
  if (start && end) {
    const minutes = (end.getTime() - start.getTime()) / 60_000;
    if (minutes > 0 && minutes <= MAX_SESSION_MINUTES) return Math.round(minutes);
  }
  const completed = w.entries.reduce(
    (n, entry) => n + entry.sets.filter((s) => s.completed).length,
    0,
  );
  return Math.round(completed * MINUTES_PER_SET);
}

export type HeatmapLevel = 0 | 1 | 2 | 3 | 4;

export interface HeatmapDay {
  date: string;
  minutes: number;
  sessions: number;
  level: HeatmapLevel;
}

/** 0 = no session; then < 30 / < 60 / < 90 / ≥ 90 minutes trained that day. */
function heatmapLevel(minutes: number, sessions: number): HeatmapLevel {
  if (sessions === 0) return 0;
  if (minutes < 30) return 1;
  if (minutes < 60) return 2;
  if (minutes < 90) return 3;
  return 4;
}

/**
 * The year-activity grid: `weeks` whole Monday–Sunday weeks, oldest first,
 * the last one being `endDate`'s week (its days after `endDate` are included
 * as empty cells so every column is complete). Several sessions on one day
 * add up. Follows openGym's minutes-trained heatmap.
 */
export function activityHeatmap(
  workouts: readonly WorkoutRecord[],
  endDate: string,
  weeks = 53,
): HeatmapDay[] {
  const first = addDays(weekStartOf(endDate), -7 * (Math.max(1, weeks) - 1));
  const byDate = new Map<string, { minutes: number; sessions: number }>();
  for (const w of workouts) {
    const day = byDate.get(w.date) ?? { minutes: 0, sessions: 0 };
    day.minutes += workoutMinutes(w);
    day.sessions += 1;
    byDate.set(w.date, day);
  }
  const days: HeatmapDay[] = [];
  for (let i = 0; i < Math.max(1, weeks) * 7; i++) {
    const date = addDays(first, i);
    const { minutes, sessions } = byDate.get(date) ?? { minutes: 0, sessions: 0 };
    days.push({ date, minutes, sessions, level: heatmapLevel(minutes, sessions) });
  }
  return days;
}

/** Sessions per week start. Each entry is one session, so two on one day count twice. */
function sessionsPerWeek(workoutDates: readonly string[], upTo?: string): Map<string, number> {
  const weeks = new Map<string, number>();
  for (const date of workoutDates) {
    if (upTo !== undefined && date > upTo) continue;
    const week = weekStartOf(date);
    weeks.set(week, (weeks.get(week) ?? 0) + 1);
  }
  return weeks;
}

/**
 * Consecutive weeks, counting back from `today`'s, with at least
 * `minSessions` sessions each. The current week counts once it already meets
 * the minimum; until then it is still "in progress" and the streak is measured
 * up to last week, so Monday morning doesn't read as a broken streak.
 * Sessions dated after `today` are ignored.
 */
export function streakWeeks(
  workoutDates: readonly string[],
  today: string,
  minSessions = 1,
): number {
  const weeks = sessionsPerWeek(workoutDates, today);
  const meets = (week: string) => (weeks.get(week) ?? 0) >= minSessions;
  let week = weekStartOf(today);
  if (!meets(week)) week = addDays(week, -7);
  let streak = 0;
  while (meets(week)) {
    streak++;
    week = addDays(week, -7);
  }
  return streak;
}

/** The longest run of consecutive weeks with at least `minSessions` sessions, anywhere in history. */
export function longestStreakWeeks(workoutDates: readonly string[], minSessions = 1): number {
  const qualifying = [...sessionsPerWeek(workoutDates).entries()]
    .filter(([, n]) => n >= minSessions)
    .map(([week]) => week)
    .sort();
  let longest = 0;
  let run = 0;
  qualifying.forEach((week, i) => {
    run = i > 0 && daysBetween(qualifying[i - 1], week) === 7 ? run + 1 : 1;
    longest = Math.max(longest, run);
  });
  return longest;
}

/** Sessions in the Monday–Sunday week containing `date`. */
export function sessionsInWeek(workoutDates: readonly string[], date: string): number {
  const week = weekStartOf(date);
  return workoutDates.filter((d) => weekStartOf(d) === week).length;
}
