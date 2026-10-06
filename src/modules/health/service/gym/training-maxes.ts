import { DomainError } from "@/modules/core/errors";
import { parseIsoDate } from "@/lib/dates";
import { getExerciseRow } from "../../db/queries/gym/exercises";
import {
  deleteTrainingMaxRow,
  findTrainingMaxRow,
  getTrainingMaxRow,
  insertTrainingMax,
  latestTrainingMaxRows,
  listTrainingMaxRows,
  updateTrainingMaxRow,
} from "../../db/queries/gym/training-maxes";
import { ensureExerciseCatalog } from "./catalog";

/** A training max with its exercise's name. */
export type TrainingMax = ReturnType<typeof listTrainingMaxRows>[number];

export interface TrainingMaxInput {
  exerciseId: number;
  trainingMaxKg: number;
  effectiveFrom: string;
  note?: string | null;
}

/** Newest first; one exercise's history when `exerciseId` is given. */
export function listTrainingMaxes(
  exerciseId?: number,
  options: { limit?: number; offset?: number } = {},
): TrainingMax[] {
  const limit = Math.min(200, Math.max(1, Math.trunc(options.limit ?? 50)));
  const offset = Math.max(0, Math.trunc(options.offset ?? 0));
  return listTrainingMaxRows(exerciseId, limit, offset);
}

/**
 * The training max currently in force per exercise (latest effective date),
 * by exercise name. With `asOf`, maxes set to start after that date are ignored.
 */
export function latestTrainingMaxes(asOf?: string): TrainingMax[] {
  if (asOf !== undefined) assertDate(asOf);
  return latestTrainingMaxRows(asOf);
}

function assertDate(date: string): void {
  try {
    parseIsoDate(date);
  } catch {
    throw new DomainError("Effective date must be a valid calendar date.");
  }
}

/**
 * Records a training max. Setting one again for the same lift and date
 * replaces it rather than leaving two competing values for that day.
 */
export function setTrainingMax(input: TrainingMaxInput) {
  const { exerciseId, trainingMaxKg, effectiveFrom } = input;
  if (!Number.isFinite(trainingMaxKg) || trainingMaxKg <= 0 || trainingMaxKg > 1000) {
    throw new DomainError("Training max must be more than 0 (and at most 1000 kg).");
  }
  assertDate(effectiveFrom);
  ensureExerciseCatalog();
  const exercise = getExerciseRow(exerciseId);
  if (!exercise) throw new DomainError("That exercise doesn't exist anymore.");
  if (exercise.defaultMode !== "reps") {
    throw new DomainError("Training maxes are for weight × reps lifts.");
  }
  const note = input.note?.trim() || null;
  if (note && note.length > 200) throw new DomainError("Note must be at most 200 characters.");

  const existing = findTrainingMaxRow(exerciseId, effectiveFrom);
  return existing
    ? updateTrainingMaxRow(existing.id, { trainingMaxKg, note })!
    : insertTrainingMax({ exerciseId, trainingMaxKg, effectiveFrom, note });
}

export function deleteTrainingMax(id: number): void {
  if (!getTrainingMaxRow(id)) throw new DomainError("That training max doesn't exist anymore.");
  deleteTrainingMaxRow(id);
}
