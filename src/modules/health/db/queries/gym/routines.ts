import { and, asc, count, eq, getTableColumns, inArray, isNull, max } from "drizzle-orm";
import { getDb } from "@/modules/core/db/client";
import { gymExercises } from "../../schema/gym/exercises";
import { gymRoutineExercises, gymRoutines } from "../../schema/gym/routines";

export type GymRoutineRow = typeof gymRoutines.$inferSelect;
export type NewGymRoutineRow = typeof gymRoutines.$inferInsert;
export type GymRoutinePatch = Partial<
  Pick<NewGymRoutineRow, "name" | "notes" | "progressionPolicy" | "archivedAt">
>;
export type GymRoutineEntryRow = typeof gymRoutineExercises.$inferSelect;
export type NewGymRoutineEntryRow = typeof gymRoutineExercises.$inferInsert;
export type GymRoutineEntryPatch = Partial<Omit<NewGymRoutineEntryRow, "id" | "routineId">>;

/** Routines in display order with how many entries each has. */
export function listRoutineRows(includeArchived: boolean, limit: number, offset: number) {
  return getDb()
    .select({ ...getTableColumns(gymRoutines), entryCount: count(gymRoutineExercises.id) })
    .from(gymRoutines)
    .leftJoin(gymRoutineExercises, eq(gymRoutineExercises.routineId, gymRoutines.id))
    .where(includeArchived ? undefined : isNull(gymRoutines.archivedAt))
    .groupBy(gymRoutines.id)
    .orderBy(asc(gymRoutines.position), asc(gymRoutines.id))
    .limit(limit)
    .offset(offset)
    .all();
}

/** Exercise names of the given routines' entries, in entry order — for list previews. */
export function listEntryNamesForRoutines(routineIds: readonly number[]) {
  if (routineIds.length === 0) return [];
  return getDb()
    .select({ routineId: gymRoutineExercises.routineId, name: gymExercises.name })
    .from(gymRoutineExercises)
    .innerJoin(gymExercises, eq(gymExercises.id, gymRoutineExercises.exerciseId))
    .where(inArray(gymRoutineExercises.routineId, [...routineIds]))
    .orderBy(
      asc(gymRoutineExercises.routineId),
      asc(gymRoutineExercises.position),
      asc(gymRoutineExercises.id),
    )
    .all();
}

export function getRoutineRow(id: number) {
  return getDb().select().from(gymRoutines).where(eq(gymRoutines.id, id)).get();
}

/** Names of every routine (archived included) — to keep new names distinct. */
export function listRoutineNames(): string[] {
  return getDb()
    .select({ name: gymRoutines.name })
    .from(gymRoutines)
    .all()
    .map((row) => row.name);
}

export function nextRoutinePosition(): number {
  const top = getDb()
    .select({ top: max(gymRoutines.position) })
    .from(gymRoutines)
    .get()?.top;
  return top === null || top === undefined ? 0 : top + 1;
}

export function insertRoutine(row: NewGymRoutineRow) {
  return getDb().insert(gymRoutines).values(row).returning().get();
}

export function updateRoutineRow(id: number, patch: GymRoutinePatch) {
  return getDb().update(gymRoutines).set(patch).where(eq(gymRoutines.id, id)).returning().get();
}

/** Entries cascade; workouts and schedule rows keep their row with `routine_id` set null. */
export function deleteRoutineRow(id: number): void {
  getDb().delete(gymRoutines).where(eq(gymRoutines.id, id)).run();
}

/** A routine's entries in position order, each with the exercise facts editors and the engine need. */
export function listRoutineEntryRows(routineId: number) {
  return getDb()
    .select({
      entry: gymRoutineExercises,
      exercise: {
        id: gymExercises.id,
        name: gymExercises.name,
        bodyPart: gymExercises.bodyPart,
        equipment: gymExercises.equipment,
        target: gymExercises.target,
        secondaryMuscles: gymExercises.secondaryMuscles,
        isBodyweight: gymExercises.isBodyweight,
        isUnilateral: gymExercises.isUnilateral,
        defaultMode: gymExercises.defaultMode,
        isCustom: gymExercises.isCustom,
        archivedAt: gymExercises.archivedAt,
      },
    })
    .from(gymRoutineExercises)
    .innerJoin(gymExercises, eq(gymExercises.id, gymRoutineExercises.exerciseId))
    .where(eq(gymRoutineExercises.routineId, routineId))
    .orderBy(asc(gymRoutineExercises.position), asc(gymRoutineExercises.id))
    .all();
}

/** Just the ordering facts of a routine's entries — what reorder/superset logic works on. */
export function listRoutineEntryOrder(routineId: number) {
  return getDb()
    .select({
      id: gymRoutineExercises.id,
      position: gymRoutineExercises.position,
      supersetGroup: gymRoutineExercises.supersetGroup,
    })
    .from(gymRoutineExercises)
    .where(eq(gymRoutineExercises.routineId, routineId))
    .orderBy(asc(gymRoutineExercises.position), asc(gymRoutineExercises.id))
    .all();
}

export function listRawRoutineEntries(routineId: number) {
  return getDb()
    .select()
    .from(gymRoutineExercises)
    .where(eq(gymRoutineExercises.routineId, routineId))
    .orderBy(asc(gymRoutineExercises.position), asc(gymRoutineExercises.id))
    .all();
}

export function getRoutineEntryRow(id: number) {
  return getDb().select().from(gymRoutineExercises).where(eq(gymRoutineExercises.id, id)).get();
}

export function nextEntryPosition(routineId: number): number {
  const top = getDb()
    .select({ top: max(gymRoutineExercises.position) })
    .from(gymRoutineExercises)
    .where(eq(gymRoutineExercises.routineId, routineId))
    .get()?.top;
  return top === null || top === undefined ? 0 : top + 1;
}

export function insertRoutineEntry(row: NewGymRoutineEntryRow) {
  return getDb().insert(gymRoutineExercises).values(row).returning().get();
}

export function insertRoutineEntries(rows: readonly NewGymRoutineEntryRow[]): void {
  if (rows.length === 0) return;
  getDb()
    .insert(gymRoutineExercises)
    .values([...rows])
    .run();
}

export function updateRoutineEntryRow(id: number, patch: GymRoutineEntryPatch) {
  return getDb()
    .update(gymRoutineExercises)
    .set(patch)
    .where(eq(gymRoutineExercises.id, id))
    .returning()
    .get();
}

/** Writes position and superset group for entries of one routine (call inside a transaction). */
export function setEntryLayout(
  routineId: number,
  layout: ReadonlyArray<{ id: number; position: number; supersetGroup: number | null }>,
): void {
  const db = getDb();
  for (const item of layout) {
    db.update(gymRoutineExercises)
      .set({ position: item.position, supersetGroup: item.supersetGroup })
      .where(and(eq(gymRoutineExercises.id, item.id), eq(gymRoutineExercises.routineId, routineId)))
      .run();
  }
}

export function deleteRoutineEntryRow(id: number): void {
  getDb().delete(gymRoutineExercises).where(eq(gymRoutineExercises.id, id)).run();
}

/** Runs `work` atomically — multi-row routine edits either land whole or not at all. */
export function inTransaction<T>(work: () => T): T {
  return getDb().transaction(() => work());
}
