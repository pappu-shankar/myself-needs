import { and, asc, count, desc, eq, gte, inArray, isNotNull, isNull, lte, sql } from "drizzle-orm";
import { getDb } from "@/modules/core/db/client";
import { gymExercises } from "../../schema/gym/exercises";
import { gymWorkoutExercises, gymWorkoutSets, gymWorkouts } from "../../schema/gym/workouts";

export type GymWorkout = typeof gymWorkouts.$inferSelect;
export type NewGymWorkout = typeof gymWorkouts.$inferInsert;
export type GymWorkoutEntry = typeof gymWorkoutExercises.$inferSelect;
export type NewGymWorkoutEntry = typeof gymWorkoutExercises.$inferInsert;
export type GymWorkoutSet = typeof gymWorkoutSets.$inferSelect;
export type NewGymWorkoutSet = typeof gymWorkoutSets.$inferInsert;

/** An entry to create plus its opening sets; positions are assigned on insert. */
export interface NewEntryTree {
  entry: Omit<NewGymWorkoutEntry, "workoutId" | "position">;
  sets: Array<Omit<NewGymWorkoutSet, "workoutExerciseId" | "position">>;
}

// ---------------------------------------------------------------------------
// Workouts

/** The unfinished workout, if any (the service keeps it to one). */
export function findActiveWorkout(): GymWorkout | undefined {
  return getDb()
    .select()
    .from(gymWorkouts)
    .where(isNull(gymWorkouts.finishedAt))
    .orderBy(desc(gymWorkouts.id))
    .limit(1)
    .get();
}

export function findWorkout(id: number): GymWorkout | undefined {
  return getDb().select().from(gymWorkouts).where(eq(gymWorkouts.id, id)).get();
}

/** Inserts one entry and its sets. Callers wrap it in a transaction. */
function writeEntryTree(workoutId: number, position: number, { entry, sets }: NewEntryTree) {
  const db = getDb();
  const created = db
    .insert(gymWorkoutExercises)
    .values({ ...entry, workoutId, position })
    .returning()
    .get();
  if (sets.length > 0) {
    db.insert(gymWorkoutSets)
      .values(sets.map((set, i) => ({ ...set, workoutExerciseId: created.id, position: i })))
      .run();
  }
  return created;
}

/** A workout with all its entries and sets, in one transaction. */
export function insertWorkoutTree(workout: NewGymWorkout, entries: NewEntryTree[]): GymWorkout {
  return getDb().transaction(() => {
    const created = getDb().insert(gymWorkouts).values(workout).returning().get();
    entries.forEach((tree, position) => writeEntryTree(created.id, position, tree));
    return created;
  });
}

export function updateWorkoutRow(id: number, patch: Partial<NewGymWorkout>) {
  return getDb().update(gymWorkouts).set(patch).where(eq(gymWorkouts.id, id)).returning().get();
}

/** Entries and sets go with it (ON DELETE CASCADE). */
export function deleteWorkoutRow(id: number): void {
  getDb().delete(gymWorkouts).where(eq(gymWorkouts.id, id)).run();
}

export function countCompletedSets(workoutId: number): number {
  return (
    getDb()
      .select({ n: count() })
      .from(gymWorkoutSets)
      .innerJoin(gymWorkoutExercises, eq(gymWorkoutSets.workoutExerciseId, gymWorkoutExercises.id))
      .where(and(eq(gymWorkoutExercises.workoutId, workoutId), eq(gymWorkoutSets.completed, true)))
      .get()?.n ?? 0
  );
}

// ---------------------------------------------------------------------------
// Entries

/** A workout's entries in order, each with the exercise facts a session screen shows. */
export function listEntriesWithExercises(workoutId: number) {
  return getDb()
    .select({
      entry: gymWorkoutExercises,
      exercise: {
        id: gymExercises.id,
        name: gymExercises.name,
        bodyPart: gymExercises.bodyPart,
        equipment: gymExercises.equipment,
        target: gymExercises.target,
        secondaryMuscles: gymExercises.secondaryMuscles,
        isBodyweight: gymExercises.isBodyweight,
        isUnilateral: gymExercises.isUnilateral,
        notes: gymExercises.notes,
      },
    })
    .from(gymWorkoutExercises)
    .innerJoin(gymExercises, eq(gymWorkoutExercises.exerciseId, gymExercises.id))
    .where(eq(gymWorkoutExercises.workoutId, workoutId))
    .orderBy(asc(gymWorkoutExercises.position), asc(gymWorkoutExercises.id))
    .all();
}

export function listEntryIds(workoutId: number): number[] {
  return getDb()
    .select({ id: gymWorkoutExercises.id })
    .from(gymWorkoutExercises)
    .where(eq(gymWorkoutExercises.workoutId, workoutId))
    .all()
    .map((row) => row.id);
}

export function findEntry(id: number): GymWorkoutEntry | undefined {
  return getDb().select().from(gymWorkoutExercises).where(eq(gymWorkoutExercises.id, id)).get();
}

/** The defaults a freshly added entry takes from its exercise. */
export function findExerciseDefaults(exerciseId: number) {
  return getDb()
    .select({
      id: gymExercises.id,
      defaultMode: gymExercises.defaultMode,
      isBodyweight: gymExercises.isBodyweight,
    })
    .from(gymExercises)
    .where(eq(gymExercises.id, exerciseId))
    .get();
}

/** Appends an entry (after the last position) with its sets, atomically. */
export function appendEntryTree(workoutId: number, tree: NewEntryTree): GymWorkoutEntry {
  return getDb().transaction(() => {
    const last = getDb()
      .select({ position: sql<number | null>`max(${gymWorkoutExercises.position})` })
      .from(gymWorkoutExercises)
      .where(eq(gymWorkoutExercises.workoutId, workoutId))
      .get()?.position;
    return writeEntryTree(workoutId, (last ?? -1) + 1, tree);
  });
}

export function updateEntryRow(id: number, patch: Partial<NewGymWorkoutEntry>) {
  return getDb()
    .update(gymWorkoutExercises)
    .set(patch)
    .where(eq(gymWorkoutExercises.id, id))
    .returning()
    .get();
}

/** Its sets go with it (ON DELETE CASCADE). */
export function deleteEntryRow(id: number): void {
  getDb().delete(gymWorkoutExercises).where(eq(gymWorkoutExercises.id, id)).run();
}

/** Rewrites positions to 0…n-1 in the given order. */
export function setEntryPositions(orderedIds: readonly number[]): void {
  getDb().transaction(() => {
    orderedIds.forEach((id, position) => {
      getDb()
        .update(gymWorkoutExercises)
        .set({ position })
        .where(eq(gymWorkoutExercises.id, id))
        .run();
    });
  });
}

// ---------------------------------------------------------------------------
// Sets

export function listSetsForEntries(entryIds: readonly number[]): GymWorkoutSet[] {
  if (entryIds.length === 0) return [];
  return getDb()
    .select()
    .from(gymWorkoutSets)
    .where(inArray(gymWorkoutSets.workoutExerciseId, [...entryIds]))
    .orderBy(
      asc(gymWorkoutSets.workoutExerciseId),
      asc(gymWorkoutSets.position),
      asc(gymWorkoutSets.id),
    )
    .all();
}

export function findSet(id: number): GymWorkoutSet | undefined {
  return getDb().select().from(gymWorkoutSets).where(eq(gymWorkoutSets.id, id)).get();
}

export function findLastSet(entryId: number): GymWorkoutSet | undefined {
  return getDb()
    .select()
    .from(gymWorkoutSets)
    .where(eq(gymWorkoutSets.workoutExerciseId, entryId))
    .orderBy(desc(gymWorkoutSets.position), desc(gymWorkoutSets.id))
    .limit(1)
    .get();
}

/** Appends a set after the entry's last one. */
export function appendSet(
  entryId: number,
  values: Omit<NewGymWorkoutSet, "workoutExerciseId" | "position">,
): GymWorkoutSet {
  return getDb().transaction(() => {
    const last = findLastSet(entryId)?.position ?? -1;
    return getDb()
      .insert(gymWorkoutSets)
      .values({ ...values, workoutExerciseId: entryId, position: last + 1 })
      .returning()
      .get();
  });
}

export function updateSetRow(id: number, patch: Partial<NewGymWorkoutSet>) {
  return getDb()
    .update(gymWorkoutSets)
    .set(patch)
    .where(eq(gymWorkoutSets.id, id))
    .returning()
    .get();
}

/**
 * Gives later, not-yet-done sets of the same kind in an entry `weightKg` when
 * they have no weight yet — how a weight typed on set 1 carries down the list.
 */
export function fillEmptyWeightsAfter(set: GymWorkoutSet, weightKg: number): void {
  getDb()
    .update(gymWorkoutSets)
    .set({ weightKg })
    .where(
      and(
        eq(gymWorkoutSets.workoutExerciseId, set.workoutExerciseId),
        sql`${gymWorkoutSets.position} > ${set.position}`,
        eq(gymWorkoutSets.kind, set.kind),
        eq(gymWorkoutSets.completed, false),
        isNull(gymWorkoutSets.weightKg),
      ),
    )
    .run();
}

export function deleteSetRow(id: number): void {
  getDb().delete(gymWorkoutSets).where(eq(gymWorkoutSets.id, id)).run();
}

// ---------------------------------------------------------------------------
// Listing

export interface WorkoutRange {
  from?: string;
  to?: string;
}

function finishedInRange({ from, to }: WorkoutRange) {
  return and(
    isNotNull(gymWorkouts.finishedAt),
    from ? gte(gymWorkouts.date, from) : undefined,
    to ? lte(gymWorkouts.date, to) : undefined,
  );
}

export interface WorkoutSummaryRow extends GymWorkout {
  setsCompleted: number;
  /** Σ weight × reps over completed, non-warm-up sets. */
  tonnageKg: number;
  /** Whole minutes between start and finish. */
  durationMin: number | null;
  /** Distinct exercises performed. */
  exerciseCount: number;
}

/**
 * Finished workouts newest first, one page, with their totals aggregated in
 * SQL — the sets are never pulled into memory to sum them.
 */
export function listWorkoutSummaries(
  range: WorkoutRange,
  limit: number,
  offset: number,
): WorkoutSummaryRow[] {
  const s = gymWorkoutSets;
  const e = gymWorkoutExercises;
  const w = gymWorkouts;
  const rows = getDb()
    .select({
      workout: w,
      setsCompleted:
        sql<number>`coalesce(sum(case when ${s.completed} = 1 then 1 else 0 end), 0)`.mapWith(
          Number,
        ),
      tonnageKg: sql<number>`coalesce(sum(case when ${s.completed} = 1 and ${s.kind} <> 'warmup'
        then coalesce(${s.weightKg}, 0) * coalesce(${s.reps}, 0) else 0 end), 0)`.mapWith(Number),
      durationMin: sql<
        number | null
      >`cast(round((julianday(${w.finishedAt}) - julianday(${w.startedAt})) * 1440) as integer)`,
      exerciseCount: sql<number>`count(distinct ${e.exerciseId})`.mapWith(Number),
    })
    .from(w)
    .leftJoin(e, eq(e.workoutId, w.id))
    .leftJoin(s, eq(s.workoutExerciseId, e.id))
    .where(finishedInRange(range))
    .groupBy(w.id)
    .orderBy(desc(w.date), desc(w.startedAt), desc(w.id))
    .limit(limit)
    .offset(offset)
    .all();
  return rows.map(({ workout, ...totals }) => ({ ...workout, ...totals }));
}

export function countFinishedWorkouts(range: WorkoutRange): number {
  return (
    getDb().select({ n: count() }).from(gymWorkouts).where(finishedInRange(range)).get()?.n ?? 0
  );
}

/** Distinct dates with a finished workout, oldest first. */
export function listFinishedWorkoutDates(from: string, to: string): string[] {
  return getDb()
    .selectDistinct({ date: gymWorkouts.date })
    .from(gymWorkouts)
    .where(finishedInRange({ from, to }))
    .orderBy(asc(gymWorkouts.date))
    .all()
    .map((row) => row.date);
}
