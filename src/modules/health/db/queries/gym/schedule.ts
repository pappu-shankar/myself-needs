import { and, asc, eq, gte, lte } from "drizzle-orm";
import { getDb } from "@/modules/core/db/client";
import { gymRoutines } from "../../schema/gym/routines";
import { gymScheduleOverrides, gymWeekSchedule } from "../../schema/gym/schedule";

const routineFields = {
  routineName: gymRoutines.name,
  routineArchivedAt: gymRoutines.archivedAt,
};

/** The standing plan: at most 7 rows, weekdays without a routine have none. */
export function listWeekScheduleRows() {
  return getDb()
    .select({
      weekday: gymWeekSchedule.weekday,
      routineId: gymWeekSchedule.routineId,
      ...routineFields,
    })
    .from(gymWeekSchedule)
    .leftJoin(gymRoutines, eq(gymRoutines.id, gymWeekSchedule.routineId))
    .orderBy(asc(gymWeekSchedule.weekday))
    .all();
}

/** Assigns a weekday's routine; null removes the weekday from the plan. */
export function setWeekdayRoutineRow(weekday: number, routineId: number | null): void {
  const db = getDb();
  if (routineId === null) {
    db.delete(gymWeekSchedule).where(eq(gymWeekSchedule.weekday, weekday)).run();
    return;
  }
  db.insert(gymWeekSchedule)
    .values({ weekday, routineId })
    .onConflictDoUpdate({ target: gymWeekSchedule.weekday, set: { routineId } })
    .run();
}

export function clearWeekScheduleRows(): void {
  getDb().delete(gymWeekSchedule).run();
}

export function getOverrideRow(date: string) {
  return getDb()
    .select({
      date: gymScheduleOverrides.date,
      routineId: gymScheduleOverrides.routineId,
      note: gymScheduleOverrides.note,
      ...routineFields,
    })
    .from(gymScheduleOverrides)
    .leftJoin(gymRoutines, eq(gymRoutines.id, gymScheduleOverrides.routineId))
    .where(eq(gymScheduleOverrides.date, date))
    .get();
}

/** Overrides between two dates inclusive, oldest first. The caller bounds the range. */
export function listOverrideRows(from: string, to: string) {
  return getDb()
    .select({
      date: gymScheduleOverrides.date,
      routineId: gymScheduleOverrides.routineId,
      note: gymScheduleOverrides.note,
      ...routineFields,
    })
    .from(gymScheduleOverrides)
    .leftJoin(gymRoutines, eq(gymRoutines.id, gymScheduleOverrides.routineId))
    .where(and(gte(gymScheduleOverrides.date, from), lte(gymScheduleOverrides.date, to)))
    .orderBy(asc(gymScheduleOverrides.date))
    .all();
}

export function upsertOverrideRow(date: string, routineId: number | null, note: string | null) {
  getDb()
    .insert(gymScheduleOverrides)
    .values({ date, routineId, note })
    .onConflictDoUpdate({ target: gymScheduleOverrides.date, set: { routineId, note } })
    .run();
}

export function deleteOverrideRow(date: string): void {
  getDb().delete(gymScheduleOverrides).where(eq(gymScheduleOverrides.date, date)).run();
}
