import { asc, eq, sql } from "drizzle-orm";
import { getDb } from "@/modules/core/db/client";
import type { PlannedSet } from "../../../engine/types";
import { gymWorkoutExercises, gymWorkoutSets } from "../../schema/gym/workouts";

/** One workout entry with its sets in order — enough to plan warm-ups. */
export function getWorkoutEntryWithSets(workoutExerciseId: number) {
  const db = getDb();
  const entry = db
    .select()
    .from(gymWorkoutExercises)
    .where(eq(gymWorkoutExercises.id, workoutExerciseId))
    .get();
  if (!entry) return null;
  const sets = db
    .select()
    .from(gymWorkoutSets)
    .where(eq(gymWorkoutSets.workoutExerciseId, workoutExerciseId))
    .orderBy(asc(gymWorkoutSets.position))
    .all();
  return { ...entry, sets };
}

/** Puts `sets` before every existing set of the entry, renumbering positions, in one transaction. */
export function insertWarmupSets(workoutExerciseId: number, sets: readonly PlannedSet[]): void {
  getDb().transaction((tx) => {
    tx.update(gymWorkoutSets)
      .set({ position: sql`${gymWorkoutSets.position} + ${sets.length}` })
      .where(eq(gymWorkoutSets.workoutExerciseId, workoutExerciseId))
      .run();
    tx.insert(gymWorkoutSets)
      .values(
        sets.map((set, position) => ({
          workoutExerciseId,
          position,
          kind: set.kind,
          weightKg: set.weightKg,
          reps: set.reps,
          durationSec: set.durationSec,
          distanceKm: set.distanceKm,
        })),
      )
      .run();
  });
}
