import { and, asc, desc, eq, gt, lte, notExists, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import { getDb } from "@/modules/core/db/client";
import { gymExercises } from "../../schema/gym/exercises";
import { gymTrainingMaxes } from "../../schema/gym/training-maxes";

export type GymTrainingMaxRow = typeof gymTrainingMaxes.$inferSelect;
export type NewGymTrainingMaxRow = typeof gymTrainingMaxes.$inferInsert;

const withExercise = {
  id: gymTrainingMaxes.id,
  exerciseId: gymTrainingMaxes.exerciseId,
  exerciseName: gymExercises.name,
  trainingMaxKg: gymTrainingMaxes.trainingMaxKg,
  effectiveFrom: gymTrainingMaxes.effectiveFrom,
  note: gymTrainingMaxes.note,
  createdAt: gymTrainingMaxes.createdAt,
};

/** Newest first (by effective date, then entry order). */
export function listTrainingMaxRows(exerciseId: number | undefined, limit: number, offset: number) {
  return getDb()
    .select(withExercise)
    .from(gymTrainingMaxes)
    .innerJoin(gymExercises, eq(gymExercises.id, gymTrainingMaxes.exerciseId))
    .where(exerciseId === undefined ? undefined : eq(gymTrainingMaxes.exerciseId, exerciseId))
    .orderBy(desc(gymTrainingMaxes.effectiveFrom), desc(gymTrainingMaxes.id))
    .limit(limit)
    .offset(offset)
    .all();
}

/**
 * The current training max per exercise: the row no other row of the same
 * exercise beats on (effective date, id). With `asOf`, rows effective later
 * than that date are ignored. Bounded by the number of lifts with a TM.
 */
export function latestTrainingMaxRows(asOf?: string) {
  const newer = alias(gymTrainingMaxes, "newer");
  const notAfter = (column: typeof gymTrainingMaxes.effectiveFrom): SQL | undefined =>
    asOf === undefined ? undefined : lte(column, asOf);
  return getDb()
    .select(withExercise)
    .from(gymTrainingMaxes)
    .innerJoin(gymExercises, eq(gymExercises.id, gymTrainingMaxes.exerciseId))
    .where(
      and(
        notAfter(gymTrainingMaxes.effectiveFrom),
        notExists(
          getDb()
            .select({ one: sql`1` })
            .from(newer)
            .where(
              and(
                eq(newer.exerciseId, gymTrainingMaxes.exerciseId),
                asOf === undefined ? undefined : lte(newer.effectiveFrom, asOf),
                or(
                  gt(newer.effectiveFrom, gymTrainingMaxes.effectiveFrom),
                  and(
                    eq(newer.effectiveFrom, gymTrainingMaxes.effectiveFrom),
                    gt(newer.id, gymTrainingMaxes.id),
                  ),
                ),
              ),
            ),
        ),
      ),
    )
    .orderBy(asc(sql`${gymExercises.name} COLLATE NOCASE`))
    .all();
}

export function findTrainingMaxRow(exerciseId: number, effectiveFrom: string) {
  return getDb()
    .select()
    .from(gymTrainingMaxes)
    .where(
      and(
        eq(gymTrainingMaxes.exerciseId, exerciseId),
        eq(gymTrainingMaxes.effectiveFrom, effectiveFrom),
      ),
    )
    .orderBy(desc(gymTrainingMaxes.id))
    .get();
}

export function getTrainingMaxRow(id: number) {
  return getDb().select().from(gymTrainingMaxes).where(eq(gymTrainingMaxes.id, id)).get();
}

export function insertTrainingMax(row: NewGymTrainingMaxRow) {
  return getDb().insert(gymTrainingMaxes).values(row).returning().get();
}

export function updateTrainingMaxRow(
  id: number,
  patch: Pick<NewGymTrainingMaxRow, "trainingMaxKg" | "note">,
) {
  return getDb()
    .update(gymTrainingMaxes)
    .set(patch)
    .where(eq(gymTrainingMaxes.id, id))
    .returning()
    .get();
}

export function deleteTrainingMaxRow(id: number): void {
  getDb().delete(gymTrainingMaxes).where(eq(gymTrainingMaxes.id, id)).run();
}
