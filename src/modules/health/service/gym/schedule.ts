import { DomainError } from "@/modules/core/errors";
import { addDays, daysBetween, parseIsoDate } from "@/lib/dates";
import { WEEKDAY_LABELS, WEEKDAYS, type Weekday } from "../../gym-types";
import { getRoutineRow } from "../../db/queries/gym/routines";
import {
  clearWeekScheduleRows,
  deleteOverrideRow,
  getOverrideRow,
  listOverrideRows,
  listWeekScheduleRows,
  setWeekdayRoutineRow,
  upsertOverrideRow,
} from "../../db/queries/gym/schedule";

export interface WeekScheduleDay {
  weekday: Weekday;
  label: (typeof WEEKDAY_LABELS)[number];
  routineId: number | null;
  routineName: string | null;
  /** The assigned routine was archived since — the day plans nothing until it's restored. */
  routineArchived: boolean;
}

export interface ScheduleOverride {
  date: string;
  /** Null = a declared rest day. */
  routineId: number | null;
  routineName: string | null;
  routineArchived: boolean;
  note: string | null;
}

export type PlanSource = "override" | "week" | "none";

/** What a date asks for, after per-date overrides and the weekly plan. */
export interface PlannedDay {
  date: string;
  weekday: Weekday;
  routineId: number | null;
  routineName: string | null;
  source: PlanSource;
  /** An override declared this date a rest day. */
  isRestOverride: boolean;
  /** The override's note, if one applies. */
  note: string | null;
}

/** Longest window `listScheduleOverrides` returns in one call. */
const MAX_OVERRIDE_RANGE_DAYS = 400;

function assertDate(date: string, label = "Date"): void {
  try {
    parseIsoDate(date);
  } catch {
    throw new DomainError(`${label} must be a valid calendar date.`);
  }
}

function weekdayOf(date: string): Weekday {
  return parseIsoDate(date).getDay() as Weekday;
}

/** Only live routines can be planned. */
function assertSchedulable(routineId: number): void {
  const routine = getRoutineRow(routineId);
  if (!routine) throw new DomainError("That routine doesn't exist anymore.");
  if (routine.archivedAt)
    throw new DomainError("That routine is archived — restore it to plan it.");
}

/** All seven weekdays, Sunday first (matching `Date#getDay()`). */
export function getWeekSchedule(): WeekScheduleDay[] {
  const rows = new Map(listWeekScheduleRows().map((row) => [row.weekday, row]));
  return WEEKDAYS.map((weekday) => {
    const row = rows.get(weekday);
    const routineId = row?.routineId ?? null;
    return {
      weekday,
      label: WEEKDAY_LABELS[weekday],
      routineId,
      routineName: routineId === null ? null : (row?.routineName ?? null),
      routineArchived: routineId !== null && Boolean(row?.routineArchivedAt),
    };
  });
}

export function setWeekdayRoutine(weekday: number, routineId: number | null): void {
  if (!WEEKDAYS.includes(weekday as Weekday)) throw new DomainError("Pick a day of the week.");
  if (routineId !== null) assertSchedulable(routineId);
  setWeekdayRoutineRow(weekday, routineId);
}

/** Empties the weekly plan (every day becomes unplanned). */
export function clearWeekSchedule(): void {
  clearWeekScheduleRows();
}

/** Plans `routineId` on one date without touching the weekly plan; null declares a rest day. */
export function setScheduleOverride(
  date: string,
  routineId: number | null,
  note?: string | null,
): void {
  assertDate(date);
  if (routineId !== null) assertSchedulable(routineId);
  const cleaned = note?.trim() || null;
  if (cleaned && cleaned.length > 200)
    throw new DomainError("Note must be at most 200 characters.");
  upsertOverrideRow(date, routineId, cleaned);
}

export function clearScheduleOverride(date: string): void {
  assertDate(date);
  deleteOverrideRow(date);
}

export function listScheduleOverrides(from: string, to: string): ScheduleOverride[] {
  assertDate(from, "Start date");
  assertDate(to, "End date");
  if (to < from) throw new DomainError("End date can't be before the start date.");
  if (daysBetween(from, to) > MAX_OVERRIDE_RANGE_DAYS) {
    throw new DomainError(`Pick a range of at most ${MAX_OVERRIDE_RANGE_DAYS} days.`);
  }
  return listOverrideRows(from, to).map((row) => ({
    date: row.date,
    routineId: row.routineId,
    routineName: row.routineName,
    routineArchived: Boolean(row.routineArchivedAt),
    note: row.note,
  }));
}

type WeekRow = ReturnType<typeof listWeekScheduleRows>[number];
type OverrideRow = NonNullable<ReturnType<typeof getOverrideRow>>;

/**
 * An override wins over the weekly plan. Archived routines count as no
 * routine: an override pointing at one no longer applies (the weekly plan
 * shows through), and a weekday assigned one plans nothing. An override whose
 * routine was deleted reads as a rest day — its link is set null with it.
 */
function resolveDay(
  date: string,
  week: WeekRow | undefined,
  override: OverrideRow | undefined,
): PlannedDay {
  const weekday = weekdayOf(date);
  if (override) {
    if (override.routineId === null) {
      return {
        date,
        weekday,
        routineId: null,
        routineName: null,
        source: "override",
        isRestOverride: true,
        note: override.note,
      };
    }
    if (!override.routineArchivedAt) {
      return {
        date,
        weekday,
        routineId: override.routineId,
        routineName: override.routineName,
        source: "override",
        isRestOverride: false,
        note: override.note,
      };
    }
  }
  if (week?.routineId != null && !week.routineArchivedAt) {
    return {
      date,
      weekday,
      routineId: week.routineId,
      routineName: week.routineName,
      source: "week",
      isRestOverride: false,
      note: null,
    };
  }
  return {
    date,
    weekday,
    routineId: null,
    routineName: null,
    source: "none",
    isRestOverride: false,
    note: null,
  };
}

export function getPlannedRoutineForDate(date: string): PlannedDay {
  assertDate(date);
  const week = listWeekScheduleRows().find((row) => row.weekday === weekdayOf(date));
  return resolveDay(date, week, getOverrideRow(date));
}

/** Monday of the week containing `date`. */
export function startOfTrainingWeek(date: string): string {
  return addDays(date, -((weekdayOf(date) + 6) % 7));
}

/** The seven planned days, Monday to Sunday, of the week containing `anyDateInWeek`. */
export function getWeekPlan(anyDateInWeek: string): PlannedDay[] {
  assertDate(anyDateInWeek);
  const monday = startOfTrainingWeek(anyDateInWeek);
  const sunday = addDays(monday, 6);
  const week = new Map(listWeekScheduleRows().map((row) => [row.weekday, row]));
  const overrides = new Map(listOverrideRows(monday, sunday).map((row) => [row.date, row]));
  return Array.from({ length: 7 }, (_, i) => {
    const date = addDays(monday, i);
    return resolveDay(date, week.get(weekdayOf(date)), overrides.get(date));
  });
}
