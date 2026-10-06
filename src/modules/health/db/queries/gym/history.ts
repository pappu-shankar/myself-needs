import {
  and,
  asc,
  countDistinct,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  lt,
  lte,
  or,
  sql,
} from "drizzle-orm";
import { getDb } from "@/modules/core/db/client";
import { gymExercises } from "../../schema/gym/exercises";
import { gymWorkoutExercises, gymWorkoutSets, gymWorkouts } from "../../schema/gym/workouts";

const w = gymWorkouts;
const e = gymWorkoutExercises;
const s = gymWorkoutSets;

/** The set columns every history read returns; `setId` null = an entry with no sets. */
const setColumns = {
  setId: s.id,
  kind: s.kind,
  weightKg: s.weightKg,
  reps: s.reps,
  durationSec: s.durationSec,
  distanceKm: s.distanceKm,
  rir: s.rir,
  rpe: s.rpe,
  completed: s.completed,
};

/** The `target_*` snapshot columns of an entry. */
const targetColumns = {
  mode: e.mode,
  targetSets: e.targetSets,
  targetReps: e.targetReps,
  targetRepsMin: e.targetRepsMin,
  targetWeightKg: e.targetWeightKg,
  targetDurationSec: e.targetDurationSec,
  targetDistanceKm: e.targetDistanceKm,
  targetRpe: e.targetRpe,
};

/** A workout's place in the `(date, started_at, id)` history order. */
export interface WorkoutAnchor {
  date: string;
  startedAt: string;
  id: number;
}

function strictlyBefore(anchor: WorkoutAnchor) {
  return or(
    lt(w.date, anchor.date),
    and(eq(w.date, anchor.date), lt(w.startedAt, anchor.startedAt)),
    and(eq(w.date, anchor.date), eq(w.startedAt, anchor.startedAt), lt(w.id, anchor.id)),
  );
}

/**
 * Every set of the most recent `limitPerExercise` finished workouts per
 * exercise, one flat row per set (entries without sets still appear once).
 * One statement: a window function ranks each exercise's workouts newest
 * first, then only the top `limitPerExercise` are joined to their sets.
 * Rows come back grouped by exercise, oldest workout first.
 */
export function listSessionSetRows(
  exerciseIds: readonly number[],
  limitPerExercise: number,
  before?: WorkoutAnchor,
) {
  if (exerciseIds.length === 0) return [];
  const db = getDb();
  const ranked = db.$with("ranked_sessions").as(
    db
      .select({
        exerciseId: sql<number>`${e.exerciseId}`.as("ranked_exercise_id"),
        workoutId: sql<number>`${w.id}`.as("ranked_workout_id"),
        rank: sql<number>`row_number() over (
          partition by ${e.exerciseId} order by ${w.date} desc, ${w.startedAt} desc, ${w.id} desc
        )`.as("ranked_rank"),
      })
      .from(e)
      .innerJoin(w, eq(e.workoutId, w.id))
      .where(
        and(
          inArray(e.exerciseId, [...exerciseIds]),
          isNotNull(w.finishedAt),
          before ? strictlyBefore(before) : undefined,
        ),
      )
      .groupBy(e.exerciseId, w.id),
  );
  return db
    .with(ranked)
    .select({
      exerciseId: e.exerciseId,
      workoutId: w.id,
      date: w.date,
      entryId: e.id,
      ...targetColumns,
      ...setColumns,
    })
    .from(e)
    .innerJoin(w, eq(e.workoutId, w.id))
    .innerJoin(ranked, and(eq(ranked.exerciseId, e.exerciseId), eq(ranked.workoutId, w.id)))
    .leftJoin(s, eq(s.workoutExerciseId, e.id))
    .where(lte(ranked.rank, limitPerExercise))
    .orderBy(
      asc(e.exerciseId),
      asc(w.date),
      asc(w.startedAt),
      asc(w.id),
      asc(e.position),
      asc(e.id),
      asc(s.position),
      asc(s.id),
    )
    .all();
}

export type SessionSetRow = ReturnType<typeof listSessionSetRows>[number];

export function findWorkoutAnchor(id: number): WorkoutAnchor | undefined {
  return getDb()
    .select({ date: w.date, startedAt: w.startedAt, id: w.id })
    .from(w)
    .where(eq(w.id, id))
    .get();
}

// ---------------------------------------------------------------------------
// Workout records (analytics input)

function finishedBetween(from: string, to: string) {
  return and(isNotNull(w.finishedAt), gte(w.date, from), lte(w.date, to));
}

/** Finished workouts dated within [from, to], oldest first. */
export function listFinishedWorkoutsBetween(from: string, to: string) {
  return getDb()
    .select({
      id: w.id,
      date: w.date,
      startedAt: w.startedAt,
      finishedAt: w.finishedAt,
      sessionRpe: w.sessionRpe,
    })
    .from(w)
    .where(finishedBetween(from, to))
    .orderBy(asc(w.date), asc(w.startedAt), asc(w.id))
    .all();
}

/**
 * The entries of those workouts with the exercise facts muscles are derived
 * from. Filtered by joining back to the workouts rather than an `IN (…)` of
 * ids, so a multi-year range never hits SQLite's bound-parameter limit.
 */
export function listEntriesForWorkoutsBetween(from: string, to: string) {
  return getDb()
    .select({
      entryId: e.id,
      workoutId: e.workoutId,
      exerciseId: e.exerciseId,
      mode: e.mode,
      isBodyweight: e.isBodyweight,
      exerciseName: gymExercises.name,
      target: gymExercises.target,
      secondaryMuscles: gymExercises.secondaryMuscles,
      bodyPart: gymExercises.bodyPart,
    })
    .from(e)
    .innerJoin(w, eq(e.workoutId, w.id))
    .innerJoin(gymExercises, eq(e.exerciseId, gymExercises.id))
    .where(finishedBetween(from, to))
    .orderBy(asc(e.workoutId), asc(e.position), asc(e.id))
    .all();
}

/** Every set of those workouts, in entry then position order. */
export function listSetsForWorkoutsBetween(from: string, to: string) {
  return getDb()
    .select({ entryId: s.workoutExerciseId, ...setColumns })
    .from(s)
    .innerJoin(e, eq(s.workoutExerciseId, e.id))
    .innerJoin(w, eq(e.workoutId, w.id))
    .where(finishedBetween(from, to))
    .orderBy(asc(s.workoutExerciseId), asc(s.position), asc(s.id))
    .all();
}

// ---------------------------------------------------------------------------
// One exercise's history table

const exerciseInFinished = (exerciseId: number) =>
  and(eq(e.exerciseId, exerciseId), isNotNull(w.finishedAt));

/**
 * One page of the finished workouts that included an exercise, newest first,
 * with that exercise's totals per workout aggregated in SQL.
 */
export function listExerciseHistorySummaries(exerciseId: number, limit: number, offset: number) {
  const workingDone = sql`${s.completed} = 1 and ${s.kind} <> 'warmup'`;
  return getDb()
    .select({
      workoutId: w.id,
      workoutName: w.name,
      date: w.date,
      setsCompleted:
        sql<number>`coalesce(sum(case when ${s.completed} = 1 then 1 else 0 end), 0)`.mapWith(
          Number,
        ),
      tonnageKg: sql<number>`coalesce(sum(case when ${workingDone}
        then coalesce(${s.weightKg}, 0) * coalesce(${s.reps}, 0) else 0 end), 0)`.mapWith(Number),
      topWeightKg: sql<number | null>`max(case when ${workingDone} then ${s.weightKg} end)`,
      totalReps:
        sql<number>`coalesce(sum(case when ${workingDone} then ${s.reps} else 0 end), 0)`.mapWith(
          Number,
        ),
    })
    .from(e)
    .innerJoin(w, eq(e.workoutId, w.id))
    .leftJoin(s, eq(s.workoutExerciseId, e.id))
    .where(exerciseInFinished(exerciseId))
    .groupBy(w.id)
    .orderBy(desc(w.date), desc(w.startedAt), desc(w.id))
    .limit(limit)
    .offset(offset)
    .all();
}

export function countExerciseWorkouts(exerciseId: number): number {
  return (
    getDb()
      .select({ n: countDistinct(w.id) })
      .from(e)
      .innerJoin(w, eq(e.workoutId, w.id))
      .where(exerciseInFinished(exerciseId))
      .get()?.n ?? 0
  );
}

/** The exercise's sets within the given workouts (one history page — a bounded id list). */
export function listExerciseSetsInWorkouts(exerciseId: number, workoutIds: readonly number[]) {
  if (workoutIds.length === 0) return [];
  return getDb()
    .select({ workoutId: e.workoutId, ...setColumns })
    .from(s)
    .innerJoin(e, eq(s.workoutExerciseId, e.id))
    .where(and(eq(e.exerciseId, exerciseId), inArray(e.workoutId, [...workoutIds])))
    .orderBy(asc(e.workoutId), asc(e.position), asc(e.id), asc(s.position), asc(s.id))
    .all();
}
