import { eq } from "drizzle-orm";
import { getDb } from "@/modules/core/db/client";
import { gymVolumeLandmarks } from "../../schema/gym/volume-landmarks";

export type GymVolumeLandmark = typeof gymVolumeLandmarks.$inferSelect;

const l = gymVolumeLandmarks;

/** Overrides only — at most one row per muscle, so the whole table is small. */
export function listLandmarkRows(): GymVolumeLandmark[] {
  return getDb().select().from(l).all();
}

export function upsertLandmarkRow(row: GymVolumeLandmark): GymVolumeLandmark {
  const { mev, mavLow, mavHigh, mrv } = row;
  return getDb()
    .insert(l)
    .values(row)
    .onConflictDoUpdate({ target: l.muscle, set: { mev, mavLow, mavHigh, mrv } })
    .returning()
    .get();
}

export function deleteLandmarkRow(muscle: string): void {
  getDb().delete(l).where(eq(l.muscle, muscle)).run();
}
