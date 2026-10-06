import { asc, eq, inArray, isNull, max } from "drizzle-orm";
import { getDb } from "@/modules/core/db/client";
import { gymBodyMeasurements } from "../../schema/gym/body-measurements";
import { gymExercises } from "../../schema/gym/exercises";
import { gymReadinessCheckins } from "../../schema/gym/readiness-checkins";
import { gymRoutineExercises, gymRoutines } from "../../schema/gym/routines";
import { gymWeekSchedule } from "../../schema/gym/schedule";
import { gymSettings } from "../../schema/gym/settings";
import { gymWorkoutExercises, gymWorkoutSets, gymWorkouts } from "../../schema/gym/workouts";
import { healthMetrics } from "../../schema/metrics";

/**
 * Queries behind service/gym/import.ts: bulk inserts for imported history and
 * plans, de-duplication lookups, and the full reads an export needs. Kept in
 * one file so the import pipeline doesn't depend on the other gym services.
 */

export type NewImportedExercise = typeof gymExercises.$inferInsert;
export type NewImportedWorkout = typeof gymWorkouts.$inferInsert;
export type NewImportedWorkoutExercise = Omit<
  typeof gymWorkoutExercises.$inferInsert,
  "workoutId" | "id"
>;
export type NewImportedSet = Omit<typeof gymWorkoutSets.$inferInsert, "workoutExerciseId" | "id">;
export type NewImportedRoutine = typeof gymRoutines.$inferInsert;
export type NewImportedRoutineEntry = Omit<
  typeof gymRoutineExercises.$inferInsert,
  "routineId" | "id"
>;

const CHUNK = 500;

/** Runs `fn` atomically. Queries made inside via `getDb()` share the transaction. */
export function inTransaction<T>(fn: () => T): T {
  return getDb().transaction(() => fn());
}

/* --------------------------------------------------------------- exercises */

export function listActiveExercises() {
  return getDb()
    .select({
      id: gymExercises.id,
      name: gymExercises.name,
      equipment: gymExercises.equipment,
      bodyPart: gymExercises.bodyPart,
      target: gymExercises.target,
      secondaryMuscles: gymExercises.secondaryMuscles,
      catalogKey: gymExercises.catalogKey,
      defaultMode: gymExercises.defaultMode,
      isCustom: gymExercises.isCustom,
      isBodyweight: gymExercises.isBodyweight,
      isUnilateral: gymExercises.isUnilateral,
    })
    .from(gymExercises)
    .where(isNull(gymExercises.archivedAt))
    .all();
}

export type ImportExerciseRow = ReturnType<typeof listActiveExercises>[number];

export function insertExercise(values: NewImportedExercise): number {
  return getDb().insert(gymExercises).values(values).returning({ id: gymExercises.id }).get().id;
}

/* ---------------------------------------------------------------- workouts */

/** Which of `refs` are already stored as `import_ref`. */
export function findExistingImportRefs(refs: readonly string[]): Set<string> {
  const found = new Set<string>();
  const db = getDb();
  for (let i = 0; i < refs.length; i += CHUNK) {
    const rows = db
      .select({ ref: gymWorkouts.importRef })
      .from(gymWorkouts)
      .where(inArray(gymWorkouts.importRef, refs.slice(i, i + CHUNK) as string[]))
      .all();
    for (const row of rows) if (row.ref) found.add(row.ref);
  }
  return found;
}

export interface WorkoutTree {
  workout: NewImportedWorkout;
  entries: Array<{ entry: NewImportedWorkoutExercise; sets: NewImportedSet[] }>;
}

/** Inserts a workout with its entries and sets. Call inside `inTransaction` for atomicity. */
export function insertWorkoutTree(tree: WorkoutTree): number {
  const db = getDb();
  const { id: workoutId } = db
    .insert(gymWorkouts)
    .values(tree.workout)
    .returning({ id: gymWorkouts.id })
    .get();
  for (const { entry, sets } of tree.entries) {
    const { id: entryId } = db
      .insert(gymWorkoutExercises)
      .values({ ...entry, workoutId })
      .returning({ id: gymWorkoutExercises.id })
      .get();
    for (let i = 0; i < sets.length; i += CHUNK) {
      db.insert(gymWorkoutSets)
        .values(sets.slice(i, i + CHUNK).map((s) => ({ ...s, workoutExerciseId: entryId })))
        .run();
    }
  }
  return workoutId;
}

/** Every finished workout with its exercises and completed sets, oldest first. */
export function listWorkoutsForExport() {
  const db = getDb();
  const workouts = db
    .select()
    .from(gymWorkouts)
    .orderBy(asc(gymWorkouts.startedAt), asc(gymWorkouts.id))
    .all()
    .filter((w) => w.finishedAt !== null);
  const entries = db
    .select({
      id: gymWorkoutExercises.id,
      workoutId: gymWorkoutExercises.workoutId,
      position: gymWorkoutExercises.position,
      notes: gymWorkoutExercises.notes,
      name: gymExercises.name,
    })
    .from(gymWorkoutExercises)
    .innerJoin(gymExercises, eq(gymExercises.id, gymWorkoutExercises.exerciseId))
    .orderBy(asc(gymWorkoutExercises.workoutId), asc(gymWorkoutExercises.position))
    .all();
  const sets = db
    .select()
    .from(gymWorkoutSets)
    .where(eq(gymWorkoutSets.completed, true))
    .orderBy(asc(gymWorkoutSets.workoutExerciseId), asc(gymWorkoutSets.position))
    .all();
  return { workouts, entries, sets };
}

/* ---------------------------------------------------------------- routines */

/** Every routine name, archived or not (a clash is a clash). */
export function listRoutineNames(): Array<{ id: number; name: string }> {
  return getDb().select({ id: gymRoutines.id, name: gymRoutines.name }).from(gymRoutines).all();
}

export function insertRoutineTree(routine: NewImportedRoutine, entries: NewImportedRoutineEntry[]) {
  const db = getDb();
  const position =
    (db
      .select({ m: max(gymRoutines.position) })
      .from(gymRoutines)
      .get()?.m ?? -1) + 1;
  const { id } = db
    .insert(gymRoutines)
    .values({ ...routine, position })
    .returning({ id: gymRoutines.id })
    .get();
  if (entries.length > 0) {
    db.insert(gymRoutineExercises)
      .values(entries.map((e) => ({ ...e, routineId: id })))
      .run();
  }
  return id;
}

/** Non-archived routines (optionally only `ids`) with their entries and exercises. */
export function listRoutinesForExport(ids?: readonly number[]) {
  const db = getDb();
  const routines = db
    .select()
    .from(gymRoutines)
    .where(isNull(gymRoutines.archivedAt))
    .orderBy(asc(gymRoutines.position), asc(gymRoutines.id))
    .all()
    .filter((r) => !ids || ids.includes(r.id));
  const entries = db
    .select({ entry: gymRoutineExercises, exercise: gymExercises })
    .from(gymRoutineExercises)
    .innerJoin(gymExercises, eq(gymExercises.id, gymRoutineExercises.exerciseId))
    .orderBy(asc(gymRoutineExercises.routineId), asc(gymRoutineExercises.position))
    .all();
  return { routines, entries };
}

export function listWeekSchedule() {
  return getDb().select().from(gymWeekSchedule).all();
}

/** Assigns `routineId` to the weekday only if the weekday has no routine yet. */
export function setWeekdayIfEmpty(weekday: number, routineId: number): boolean {
  const db = getDb();
  const existing = db
    .select()
    .from(gymWeekSchedule)
    .where(eq(gymWeekSchedule.weekday, weekday))
    .get();
  if (existing?.routineId != null) return false;
  if (existing) {
    db.update(gymWeekSchedule).set({ routineId }).where(eq(gymWeekSchedule.weekday, weekday)).run();
  } else {
    db.insert(gymWeekSchedule).values({ weekday, routineId }).run();
  }
  return true;
}

/* ------------------------------------------------------------------ weight */

export function listWeightEntries(): Array<{ date: string; value: number }> {
  return getDb()
    .select({ date: healthMetrics.date, value: healthMetrics.value })
    .from(healthMetrics)
    .where(eq(healthMetrics.type, "weight"))
    .orderBy(asc(healthMetrics.date), asc(healthMetrics.id))
    .all()
    .flatMap((r) => (r.value === null ? [] : [{ date: r.date, value: r.value }]));
}

/* ------------------------------------------------- measurements, readiness */

export function listMeasurements() {
  return getDb()
    .select()
    .from(gymBodyMeasurements)
    .orderBy(asc(gymBodyMeasurements.date), asc(gymBodyMeasurements.id))
    .all();
}

export function insertMeasurement(values: typeof gymBodyMeasurements.$inferInsert): void {
  getDb().insert(gymBodyMeasurements).values(values).run();
}

export function listReadiness() {
  return getDb().select().from(gymReadinessCheckins).orderBy(asc(gymReadinessCheckins.date)).all();
}

/** Keeps an existing check-in for the date; returns whether a row was added. */
export function insertReadinessIfMissing(
  values: typeof gymReadinessCheckins.$inferInsert,
): boolean {
  return (
    getDb().insert(gymReadinessCheckins).values(values).onConflictDoNothing().run().changes > 0
  );
}

/* ---------------------------------------------------------------- settings */

export function getSettingsRow() {
  return getDb().select().from(gymSettings).where(eq(gymSettings.id, 1)).get();
}

/** Writes the settings row only when none exists; returns whether it was written. */
export function insertSettingsIfMissing(values: typeof gymSettings.$inferInsert): boolean {
  return getDb().insert(gymSettings).values(values).onConflictDoNothing().run().changes > 0;
}
