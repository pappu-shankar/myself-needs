import { DomainError } from "@/modules/core/errors";
import { parseIsoDate } from "@/lib/dates";
import type { MuscleWeights } from "../../gym-types";
import { musclesOf } from "../../engine/muscles";
import type { ExerciseSession, SetRecord, WorkoutRecord } from "../../engine/types";
import {
  countExerciseWorkouts,
  findWorkoutAnchor,
  listEntriesForWorkoutsBetween,
  listExerciseHistorySummaries,
  listExerciseSetsInWorkouts,
  listFinishedWorkoutsBetween,
  listSessionSetRows,
  listSetsForWorkoutsBetween,
  type SessionSetRow,
} from "../../db/queries/gym/history";
import { entryTarget } from "./workouts";

/**
 * Past training reduced to the engine's input shapes (engine/types.ts):
 * finished workouts only, oldest first, every set included with its
 * `completed` flag — the engine decides what counts.
 */

interface SetColumns {
  setId: number | null;
  kind: SetRecord["kind"] | null;
  weightKg: number | null;
  reps: number | null;
  durationSec: number | null;
  distanceKm: number | null;
  rir: number | null;
  rpe: number | null;
  completed: boolean | null;
}

function toSetRecord(row: SetColumns): SetRecord {
  return {
    kind: row.kind ?? "working",
    weightKg: row.weightKg,
    reps: row.reps,
    durationSec: row.durationSec,
    distanceKm: row.distanceKm,
    rir: row.rir,
    rpe: row.rpe,
    completed: row.completed ?? false,
  };
}

function requireDate(date: string, label: string): void {
  try {
    parseIsoDate(date);
  } catch {
    throw new DomainError(`${label} must be a valid calendar date.`);
  }
}

function clampLimit(limit: number, max = 200): number {
  return Math.min(Math.max(Math.floor(limit), 1), max);
}

/**
 * Flat set rows (grouped by exercise, oldest workout first) → sessions per
 * exercise. An exercise logged twice in one workout is one session: its sets
 * in entry order, its target the first entry that had one.
 */
function groupSessions(rows: readonly SessionSetRow[]): Map<number, ExerciseSession[]> {
  const byExercise = new Map<number, ExerciseSession[]>();
  let current: ExerciseSession | undefined;
  let currentExerciseId: number | undefined;
  for (const row of rows) {
    if (current?.workoutId !== row.workoutId || currentExerciseId !== row.exerciseId) {
      current = { workoutId: row.workoutId, date: row.date, target: null, sets: [] };
      currentExerciseId = row.exerciseId;
      const sessions = byExercise.get(row.exerciseId) ?? [];
      sessions.push(current);
      byExercise.set(row.exerciseId, sessions);
    }
    current.target ??= entryTarget(row);
    if (row.setId != null) current.sets.push(toSetRecord(row));
  }
  return byExercise;
}

export interface ExerciseSessionsOptions {
  /** How many of the most recent sessions (default 20). */
  limit?: number;
  /** Only sessions strictly before this workout — "what came before it". */
  beforeWorkoutId?: number;
}

/** An exercise's most recent sessions, oldest first. */
export function getExerciseSessions(
  exerciseId: number,
  { limit = 20, beforeWorkoutId }: ExerciseSessionsOptions = {},
): ExerciseSession[] {
  let anchor;
  if (beforeWorkoutId !== undefined) {
    anchor = findWorkoutAnchor(beforeWorkoutId);
    if (!anchor) throw new DomainError("That workout no longer exists.");
  }
  const rows = listSessionSetRows([exerciseId], clampLimit(limit, 1000), anchor);
  return groupSessions(rows).get(exerciseId) ?? [];
}

/**
 * The last `limitPerExercise` sessions of several exercises at once — one
 * query, for prescribing a whole workout. Every requested id is in the map
 * (an empty list when it has no history).
 */
export function getRecentSessionsByExercise(
  exerciseIds: readonly number[],
  limitPerExercise = 10,
): Map<number, ExerciseSession[]> {
  const ids = [...new Set(exerciseIds)];
  const grouped = groupSessions(listSessionSetRows(ids, clampLimit(limitPerExercise, 1000)));
  return new Map(ids.map((id) => [id, grouped.get(id) ?? []]));
}

/** Finished workouts dated within [from, to], oldest first, as analytics input. */
export function getWorkoutRecords({ from, to }: { from: string; to: string }): WorkoutRecord[] {
  requireDate(from, "From date");
  requireDate(to, "To date");
  const records = listFinishedWorkoutsBetween(from, to).map((workout): WorkoutRecord => ({
    ...workout,
    entries: [],
  }));
  const recordById = new Map(records.map((record) => [record.id, record]));

  const setsByEntry = new Map<number, SetRecord[]>();
  for (const row of listSetsForWorkoutsBetween(from, to)) {
    const list = setsByEntry.get(row.entryId) ?? [];
    list.push(toSetRecord(row));
    setsByEntry.set(row.entryId, list);
  }

  const musclesByExercise = new Map<number, MuscleWeights>();
  for (const entry of listEntriesForWorkoutsBetween(from, to)) {
    let muscles = musclesByExercise.get(entry.exerciseId);
    if (!muscles) {
      muscles = musclesOf(entry);
      musclesByExercise.set(entry.exerciseId, muscles);
    }
    recordById.get(entry.workoutId)?.entries.push({
      exerciseId: entry.exerciseId,
      exerciseName: entry.exerciseName,
      mode: entry.mode,
      isBodyweight: entry.isBodyweight,
      muscles,
      sets: setsByEntry.get(entry.entryId) ?? [],
    });
  }
  return records;
}

export interface ExerciseHistoryRow {
  workoutId: number;
  workoutName: string;
  date: string;
  setsCompleted: number;
  /** Σ weight × reps over completed working sets. */
  tonnageKg: number;
  /** Heaviest completed working set. */
  topWeightKg: number | null;
  totalReps: number;
  /** Every set of this exercise in that workout, in order. */
  sets: SetRecord[];
}

/** One page of an exercise's sessions, newest first, for its detail table. */
export function getExerciseHistory(
  exerciseId: number,
  { limit = 20, offset = 0 }: { limit?: number; offset?: number } = {},
): { rows: ExerciseHistoryRow[]; total: number } {
  const summaries = listExerciseHistorySummaries(
    exerciseId,
    clampLimit(limit),
    Math.max(Math.floor(offset), 0),
  );
  const setsByWorkout = new Map<number, SetRecord[]>();
  const workoutIds = summaries.map((row) => row.workoutId);
  for (const row of listExerciseSetsInWorkouts(exerciseId, workoutIds)) {
    const list = setsByWorkout.get(row.workoutId) ?? [];
    list.push(toSetRecord(row));
    setsByWorkout.set(row.workoutId, list);
  }
  return {
    rows: summaries.map((row) => ({ ...row, sets: setsByWorkout.get(row.workoutId) ?? [] })),
    total: countExerciseWorkouts(exerciseId),
  };
}
