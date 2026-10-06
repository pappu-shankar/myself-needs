import { and, eq, gte, inArray, isNotNull, lte, sql } from "drizzle-orm";
import { getDb } from "@/modules/core/db/client";
import { gymExercises } from "../../schema/gym/exercises";
import { gymWorkoutExercises, gymWorkoutSets, gymWorkouts } from "../../schema/gym/workouts";

function finishedBetween(from: string | null, to: string) {
  return and(
    isNotNull(gymWorkouts.finishedAt),
    lte(gymWorkouts.date, to),
    from ? gte(gymWorkouts.date, from) : undefined,
  );
}

/**
 * Completed non-warm-up sets per exercise (and logging mode) in a date range,
 * with the exercise's muscle fields — the muscle map for any window, including
 * "all time", without loading individual sets.
 */
export function countWorkSetsByExercise(
  from: string | null,
  to: string,
  { hardOnly = false }: { hardOnly?: boolean } = {},
) {
  return getDb()
    .select({
      exerciseId: gymWorkoutExercises.exerciseId,
      mode: gymWorkoutExercises.mode,
      target: gymExercises.target,
      secondaryMuscles: gymExercises.secondaryMuscles,
      bodyPart: gymExercises.bodyPart,
      sets: sql<number>`count(${gymWorkoutSets.id})`.mapWith(Number),
    })
    .from(gymWorkoutSets)
    .innerJoin(gymWorkoutExercises, eq(gymWorkoutSets.workoutExerciseId, gymWorkoutExercises.id))
    .innerJoin(gymWorkouts, eq(gymWorkoutExercises.workoutId, gymWorkouts.id))
    .innerJoin(gymExercises, eq(gymWorkoutExercises.exerciseId, gymExercises.id))
    .where(
      and(
        finishedBetween(from, to),
        eq(gymWorkoutSets.completed, true),
        sql`${gymWorkoutSets.kind} <> 'warmup'`,
        // Rated hard: within 3 reps of failure (RIR ≤ 3, i.e. RPE ≥ 7) — engine/effort.ts HARD_RIR.
        hardOnly
          ? sql`(${gymWorkoutSets.rir} <= 3 or ${gymWorkoutSets.rpe} >= 7)`
          : undefined,
      ),
    )
    .groupBy(gymWorkoutExercises.exerciseId, gymWorkoutExercises.mode)
    .all();
}

/** Sessions, completed sets, tonnage and minutes for a date range, aggregated in SQL. */
export function trainingTotals(from: string | null, to: string) {
  const db = getDb();
  const sessions = db
    .select({
      sessions: sql<number>`count(*)`.mapWith(Number),
      // Same 6-hour cap as engine/calendar.ts workoutMinutes — a session left
      // open overnight shouldn't count as 14 hours of training.
      minutes:
        sql<number>`coalesce(sum(min(360, max(0, round((julianday(${gymWorkouts.finishedAt}) - julianday(${gymWorkouts.startedAt})) * 1440)))), 0)`.mapWith(
          Number,
        ),
    })
    .from(gymWorkouts)
    .where(finishedBetween(from, to))
    .get();
  const sets = db
    .select({
      sets: sql<number>`count(${gymWorkoutSets.id})`.mapWith(Number),
      tonnageKg:
        sql<number>`coalesce(sum(coalesce(${gymWorkoutSets.weightKg}, 0) * coalesce(${gymWorkoutSets.reps}, 0)), 0)`.mapWith(
          Number,
        ),
    })
    .from(gymWorkoutSets)
    .innerJoin(gymWorkoutExercises, eq(gymWorkoutSets.workoutExerciseId, gymWorkoutExercises.id))
    .innerJoin(gymWorkouts, eq(gymWorkoutExercises.workoutId, gymWorkouts.id))
    .where(
      and(
        finishedBetween(from, to),
        eq(gymWorkoutSets.completed, true),
        sql`${gymWorkoutSets.kind} <> 'warmup'`,
      ),
    )
    .get();
  return {
    sessions: sessions?.sessions ?? 0,
    minutes: sessions?.minutes ?? 0,
    sets: sets?.sets ?? 0,
    tonnageKg: Math.round(sets?.tonnageKg ?? 0),
  };
}

/** Catalog exercises by dataset key — the canonical lifts behind strength standards. */
export function listExercisesByCatalogKeys(keys: readonly string[]) {
  if (keys.length === 0) return [];
  return getDb()
    .select({ id: gymExercises.id, catalogKey: gymExercises.catalogKey, name: gymExercises.name })
    .from(gymExercises)
    .where(inArray(gymExercises.catalogKey, [...keys]))
    .all();
}
