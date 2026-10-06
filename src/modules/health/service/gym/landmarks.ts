import { DomainError } from "@/modules/core/errors";
import { MUSCLE_LABELS, MUSCLES, type Muscle } from "../../gym-types";
import type { VolumeLandmark } from "../../engine/types";
import {
  deleteLandmarkRow,
  listLandmarkRows,
  upsertLandmarkRow,
} from "../../db/queries/gym/landmarks";

/**
 * The user's own weekly hard-set landmarks per muscle. Only overrides are
 * stored; muscles without one use the engine's defaults (engine/volume.ts).
 */

/** Highest landmark accepted — far beyond any sane weekly set count. */
export const LANDMARK_MAX_SETS = 60;

function isMuscle(value: string): value is Muscle {
  return (MUSCLES as readonly string[]).includes(value);
}

export function getLandmarkOverrides(): Partial<Record<Muscle, VolumeLandmark>> {
  const overrides: Partial<Record<Muscle, VolumeLandmark>> = {};
  for (const { muscle, ...landmark } of listLandmarkRows()) {
    if (isMuscle(muscle)) overrides[muscle] = landmark;
  }
  return overrides;
}

/** Landmarks must climb: 0 ≤ MEV ≤ MAV low ≤ MAV high ≤ MRV ≤ 60, whole sets. */
export function setLandmarkOverride(muscle: string, landmark: VolumeLandmark): VolumeLandmark {
  if (!isMuscle(muscle)) throw new DomainError("Unknown muscle.");
  const { mev, mavLow, mavHigh, mrv } = landmark;
  if (![mev, mavLow, mavHigh, mrv].every((n) => Number.isInteger(n))) {
    throw new DomainError("Landmarks are whole numbers of sets per week.");
  }
  if (!(
    mev >= 0 &&
    mev <= mavLow &&
    mavLow <= mavHigh &&
    mavHigh <= mrv &&
    mrv <= LANDMARK_MAX_SETS
  )) {
    throw new DomainError(
      `${MUSCLE_LABELS[muscle]} landmarks must climb: 0 ≤ MEV ≤ MAV low ≤ MAV high ≤ MRV ≤ ${LANDMARK_MAX_SETS}.`,
    );
  }
  const saved = upsertLandmarkRow({ muscle, mev, mavLow, mavHigh, mrv });
  return { mev: saved.mev, mavLow: saved.mavLow, mavHigh: saved.mavHigh, mrv: saved.mrv };
}

/** Back to the default landmarks for this muscle. */
export function clearLandmarkOverride(muscle: string): void {
  if (!isMuscle(muscle)) throw new DomainError("Unknown muscle.");
  deleteLandmarkRow(muscle);
}
