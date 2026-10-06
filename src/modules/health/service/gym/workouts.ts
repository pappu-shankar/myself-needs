import { DomainError } from "@/modules/core/errors";
import { addDays, daysBetween, nowLocalDateTime, parseIsoDate } from "@/lib/dates";
import {
  SET_KINDS,
  TRACKED_BY,
  type ExerciseMode,
  type ProgressionPolicy,
  type SetKind,
  type TrackedBy,
} from "../../gym-types";
import type { EntryTarget, PlannedSet, PrescriptionKind } from "../../engine/types";
import {
  appendEntryTree,
  appendSet,
  countCompletedSets,
  countFinishedWorkouts,
  deleteEntryRow,
  deleteSetRow,
  deleteWorkoutRow,
  findActiveWorkout,
  findEntry,
  findExerciseDefaults,
  findLastSet,
  findSet,
  findWorkout,
  insertWorkoutTree,
  listEntriesWithExercises,
  listEntryIds,
  listFinishedWorkoutDates,
  listSetsForEntries,
  listWorkoutSummaries,
  setEntryPositions,
  updateEntryRow,
  updateSetRow,
  updateWorkoutRow,
  type GymWorkout,
  type GymWorkoutEntry,
  type GymWorkoutSet,
  type NewGymWorkoutSet,
  type WorkoutSummaryRow,
  fillEmptyWeightsAfter,
} from "../../db/queries/gym/workouts";

/**
 * The live session and its history edits: one workout at a time in progress,
 * entries snapshot what was prescribed, and only completed sets count. Starting
 * a session from a routine (prescriptions) is composed on top of
 * `createWorkout`. See docs/prd/health/gym.md.
 */

export type Workout = GymWorkout;
export type WorkoutSet = GymWorkoutSet;
export type WorkoutEntryRow = GymWorkoutEntry;
export type WorkoutListRow = WorkoutSummaryRow;

export interface WorkoutDetailExercise {
  id: number;
  name: string;
  bodyPart: string;
  equipment: string;
  target: string;
  secondaryMuscles: string[];
  isBodyweight: boolean;
  isUnilateral: boolean;
  notes: string | null;
}

export interface WorkoutDetailEntry {
  id: number;
  exerciseId: number;
  routineExerciseId: number | null;
  position: number;
  mode: ExerciseMode;
  supersetGroup: number | null;
  perSide: boolean;
  isBodyweight: boolean;
  /** What the session prescribed; null for entries added ad hoc or imported. */
  target: EntryTarget | null;
  restSec: number | null;
  progressionPolicy: ProgressionPolicy | null;
  prescriptionKind: PrescriptionKind | null;
  prescriptionReason: string | null;
  notes: string | null;
  exercise: WorkoutDetailExercise;
  /** Position order. */
  sets: WorkoutSet[];
}

export interface WorkoutDetail extends Workout {
  /** Position order. */
  entries: WorkoutDetailEntry[];
}

// ---------------------------------------------------------------------------
// Validation

const LOCAL_DATE_TIME = /^(\d{4}-\d{2}-\d{2})T([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/;

function requireDate(date: string, label = "Date"): void {
  try {
    parseIsoDate(date);
  } catch {
    throw new DomainError(`${label} must be a valid calendar date.`);
  }
}

function requireDateTime(value: string, label: string): void {
  const match = LOCAL_DATE_TIME.exec(value);
  if (!match) throw new DomainError(`${label} must be a date and time like 2026-10-04T18:30:00.`);
  requireDate(match[1], label);
}

function requireName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) throw new DomainError("Workout name is required.");
  if (trimmed.length > 200) throw new DomainError("Workout name must be at most 200 characters.");
  return trimmed;
}

function cleanNotes(notes: string | null | undefined): string | null {
  const trimmed = notes?.trim();
  if (trimmed && trimmed.length > 2000) {
    throw new DomainError("Notes must be at most 2000 characters.");
  }
  return trimmed ? trimmed : null;
}

function requireRange(
  value: number | null | undefined,
  label: string,
  min: number,
  max: number,
  integer = false,
): void {
  if (value == null) return;
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new DomainError(
      max !== Infinity
        ? `${label} must be between ${min} and ${max}.`
        : min === 0
          ? `${label} can't be negative.`
          : `${label} must be at least ${min}.`,
    );
  }
  if (integer && !Number.isInteger(value)) {
    throw new DomainError(`${label} must be a whole number.`);
  }
}

function requireSessionRpe(sessionRpe: number | null | undefined): void {
  requireRange(sessionRpe, "Session RPE", 1, 10);
}

/** What a set holds; `null` clears a value, `undefined` leaves it alone. */
export interface SetValues {
  kind?: SetKind;
  weightKg?: number | null;
  reps?: number | null;
  durationSec?: number | null;
  distanceKm?: number | null;
  rir?: number | null;
  rpe?: number | null;
}

function validateSetValues(values: SetValues): void {
  if (values.kind !== undefined && !SET_KINDS.includes(values.kind)) {
    throw new DomainError("Unknown set type.");
  }
  requireRange(values.weightKg, "Weight", 0, Infinity);
  requireRange(values.reps, "Reps", 0, 1000, true);
  requireRange(values.durationSec, "Duration", 0, Infinity, true);
  requireRange(values.distanceKm, "Distance", 0, Infinity);
  requireRange(values.rir, "RIR", 0, 10);
  requireRange(values.rpe, "RPE", 1, 10);
}

/** Only the keys actually given, so `undefined` never overwrites a column. */
function setPatch(values: SetValues): Partial<NewGymWorkoutSet> {
  const patch: Partial<NewGymWorkoutSet> = {};
  for (const key of [
    "kind",
    "weightKg",
    "reps",
    "durationSec",
    "distanceKm",
    "rir",
    "rpe",
  ] as const) {
    if (values[key] !== undefined) Object.assign(patch, { [key]: values[key] });
  }
  return patch;
}

// ---------------------------------------------------------------------------
// Reads

function requireWorkout(id: number): Workout {
  const workout = findWorkout(id);
  if (!workout) throw new DomainError("That workout no longer exists.");
  return workout;
}

function requireEntry(id: number): GymWorkoutEntry {
  const entry = findEntry(id);
  if (!entry) throw new DomainError("That exercise is no longer in the workout.");
  return entry;
}

function requireSet(id: number): WorkoutSet {
  const set = findSet(id);
  if (!set) throw new DomainError("That set no longer exists.");
  return set;
}

/** The entry's `target_*` snapshot, or null when nothing was prescribed. */
export function entryTarget(entry: {
  mode: ExerciseMode;
  targetSets: number | null;
  targetReps: number | null;
  targetRepsMin: number | null;
  targetWeightKg: number | null;
  targetDurationSec: number | null;
  targetDistanceKm: number | null;
  targetRpe: number | null;
}): EntryTarget | null {
  const target: EntryTarget = {
    mode: entry.mode,
    sets: entry.targetSets,
    reps: entry.targetReps,
    repsMin: entry.targetRepsMin,
    weightKg: entry.targetWeightKg,
    durationSec: entry.targetDurationSec,
    distanceKm: entry.targetDistanceKm,
    targetRpe: entry.targetRpe,
  };
  const prescribed = Object.entries(target).some(([key, value]) => key !== "mode" && value != null);
  return prescribed ? target : null;
}

/** Three queries whatever the size: the workout, its entries + exercises, their sets. */
function toDetail(workout: Workout): WorkoutDetail {
  const rows = listEntriesWithExercises(workout.id);
  const setsByEntry = new Map<number, WorkoutSet[]>();
  for (const set of listSetsForEntries(rows.map((row) => row.entry.id))) {
    const list = setsByEntry.get(set.workoutExerciseId) ?? [];
    list.push(set);
    setsByEntry.set(set.workoutExerciseId, list);
  }
  return {
    ...workout,
    entries: rows.map(({ entry, exercise }) => ({
      id: entry.id,
      exerciseId: entry.exerciseId,
      routineExerciseId: entry.routineExerciseId,
      position: entry.position,
      mode: entry.mode,
      supersetGroup: entry.supersetGroup,
      perSide: entry.perSide,
      isBodyweight: entry.isBodyweight,
      target: entryTarget(entry),
      restSec: entry.restSec,
      progressionPolicy: entry.progressionPolicy,
      prescriptionKind: entry.prescriptionKind as PrescriptionKind | null,
      prescriptionReason: entry.prescriptionReason,
      notes: entry.notes,
      exercise,
      sets: setsByEntry.get(entry.id) ?? [],
    })),
  };
}

/** The session in progress, if any. */
export function getActiveWorkout(): WorkoutDetail | null {
  const workout = findActiveWorkout();
  return workout ? toDetail(workout) : null;
}

export function getWorkout(id: number): WorkoutDetail {
  return toDetail(requireWorkout(id));
}

export interface ListWorkoutsOptions {
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}

/** Finished workouts, newest first, one page — totals come from SQL. */
export function listWorkouts({ from, to, limit = 20, offset = 0 }: ListWorkoutsOptions = {}): {
  rows: WorkoutListRow[];
  total: number;
} {
  const pageSize = Math.min(Math.max(Math.floor(limit), 1), 200);
  const skip = Math.max(Math.floor(offset), 0);
  return {
    rows: listWorkoutSummaries({ from, to }, pageSize, skip),
    total: countFinishedWorkouts({ from, to }),
  };
}

/** Dates with a finished workout in [from, to], oldest first — calendars and streaks. */
export function listWorkoutDates(from: string, to: string): string[] {
  requireDate(from, "From date");
  requireDate(to, "To date");
  return listFinishedWorkoutDates(from, to);
}

// ---------------------------------------------------------------------------
// Creating

export interface NewWorkoutEntryInput {
  exerciseId: number;
  routineExerciseId: number | null;
  mode: ExerciseMode;
  supersetGroup: number | null;
  perSide: boolean;
  isBodyweight: boolean;
  target: EntryTarget;
  restSec: number | null;
  progressionPolicy: ProgressionPolicy | null;
  prescriptionKind: PrescriptionKind | null;
  prescriptionReason: string | null;
  notes: string | null;
  sets: PlannedSet[];
}

export interface NewWorkoutInput {
  date: string;
  /** Local `YYYY-MM-DDTHH:mm:ss`. */
  startedAt: string;
  routineId: number | null;
  name: string;
  programId: number | null;
  programWeek: number | null;
  entries: NewWorkoutEntryInput[];
}

/**
 * Opens a session with its prescribed entries and sets in one transaction.
 * Only one workout may be in progress at a time.
 */
export function createWorkout(input: NewWorkoutInput): WorkoutDetail {
  requireDate(input.date);
  requireDateTime(input.startedAt, "Start time");
  const name = requireName(input.name);
  requireRange(input.programWeek, "Program week", 1, Infinity, true);
  for (const entry of input.entries) {
    requireRange(entry.restSec, "Rest", 0, Infinity, true);
    for (const set of entry.sets) validateSetValues(set);
  }
  if (findActiveWorkout()) {
    throw new DomainError("Finish or discard the workout in progress first.");
  }
  const created = insertWorkoutTree(
    {
      date: input.date,
      startedAt: input.startedAt,
      routineId: input.routineId,
      name,
      programId: input.programId,
      programWeek: input.programWeek,
    },
    input.entries.map((entry) => ({
      entry: {
        exerciseId: entry.exerciseId,
        routineExerciseId: entry.routineExerciseId,
        mode: entry.mode,
        supersetGroup: entry.supersetGroup,
        perSide: entry.perSide,
        isBodyweight: entry.isBodyweight,
        targetSets: entry.target.sets,
        targetReps: entry.target.reps,
        targetRepsMin: entry.target.repsMin,
        targetWeightKg: entry.target.weightKg,
        targetDurationSec: entry.target.durationSec,
        targetDistanceKm: entry.target.distanceKm,
        targetRpe: entry.target.targetRpe,
        restSec: entry.restSec,
        progressionPolicy: entry.progressionPolicy,
        prescriptionKind: entry.prescriptionKind,
        prescriptionReason: entry.prescriptionReason,
        notes: cleanNotes(entry.notes),
      },
      sets: entry.sets.map((set) => ({
        kind: set.kind,
        weightKg: set.weightKg,
        reps: set.reps,
        durationSec: set.durationSec,
        distanceKm: set.distanceKm,
      })),
    })),
  );
  return toDetail(created);
}

// ---------------------------------------------------------------------------
// Entries

export interface AddEntryOptions {
  /** Defaults to the exercise's own mode. */
  mode?: ExerciseMode;
  perSide?: boolean;
  supersetGroup?: number | null;
  restSec?: number | null;
  notes?: string | null;
}

/** Appends an exercise with one empty working set to fill in. */
export function addWorkoutEntry(
  workoutId: number,
  exerciseId: number,
  opts: AddEntryOptions = {},
): GymWorkoutEntry {
  requireWorkout(workoutId);
  const exercise = findExerciseDefaults(exerciseId);
  if (!exercise) throw new DomainError("That exercise no longer exists.");
  requireRange(opts.restSec, "Rest", 0, Infinity, true);
  requireRange(opts.supersetGroup, "Superset group", 1, Infinity, true);
  return appendEntryTree(workoutId, {
    entry: {
      exerciseId,
      mode: opts.mode ?? exercise.defaultMode,
      perSide: opts.perSide ?? false,
      isBodyweight: exercise.isBodyweight,
      supersetGroup: opts.supersetGroup ?? null,
      restSec: opts.restSec ?? null,
      notes: cleanNotes(opts.notes),
    },
    sets: [{ kind: "working" }],
  });
}

export function removeWorkoutEntry(entryId: number): void {
  requireEntry(entryId);
  deleteEntryRow(entryId);
}

/** `orderedIds` must be exactly the workout's entries, in their new order. */
export function reorderWorkoutEntries(workoutId: number, orderedIds: readonly number[]): void {
  requireWorkout(workoutId);
  const current = listEntryIds(workoutId);
  const given = new Set(orderedIds);
  if (
    given.size !== orderedIds.length ||
    given.size !== current.length ||
    !current.every((id) => given.has(id))
  ) {
    throw new DomainError("The exercise list changed — reload and try again.");
  }
  setEntryPositions(orderedIds);
}

export interface EntryPatch {
  notes?: string | null;
  restSec?: number | null;
  supersetGroup?: number | null;
}

export function updateWorkoutEntry(entryId: number, patch: EntryPatch): GymWorkoutEntry {
  requireEntry(entryId);
  requireRange(patch.restSec, "Rest", 0, Infinity, true);
  requireRange(patch.supersetGroup, "Superset group", 1, Infinity, true);
  const values: Partial<GymWorkoutEntry> = {};
  if (patch.notes !== undefined) values.notes = cleanNotes(patch.notes);
  if (patch.restSec !== undefined) values.restSec = patch.restSec;
  if (patch.supersetGroup !== undefined) values.supersetGroup = patch.supersetGroup;
  if (Object.keys(values).length === 0) return requireEntry(entryId);
  return updateEntryRow(entryId, values)!;
}

// ---------------------------------------------------------------------------
// Sets

/** A new set pre-filled from the entry's last one (values, not its completion or effort). */
export function addSet(entryId: number, values: SetValues = {}): WorkoutSet {
  requireEntry(entryId);
  validateSetValues(values);
  const last = findLastSet(entryId);
  return appendSet(entryId, {
    kind: last?.kind ?? "working",
    weightKg: last?.weightKg ?? null,
    reps: last?.reps ?? null,
    durationSec: last?.durationSec ?? null,
    distanceKm: last?.distanceKm ?? null,
    ...setPatch(values),
  });
}

export function updateSet(setId: number, values: SetValues): WorkoutSet {
  const set = requireSet(setId);
  validateSetValues(values);
  const patch = setPatch(values);
  if (Object.keys(patch).length === 0) return set;
  return updateSetRow(setId, patch)!;
}

export interface CompleteSetValues extends SetValues {
  trackedBy?: TrackedBy;
  /** Camera-tracked: average range of motion, 0–100. */
  romScore?: number | null;
}

/** Logs the set as done now, saving whatever values come with it. */
export function completeSet(setId: number, values: CompleteSetValues = {}): WorkoutSet {
  requireSet(setId);
  validateSetValues(values);
  if (values.trackedBy !== undefined && !TRACKED_BY.includes(values.trackedBy)) {
    throw new DomainError("Unknown rep-tracking source.");
  }
  requireRange(values.romScore, "Range of motion score", 0, 100);
  const done = updateSetRow(setId, {
    ...setPatch(values),
    ...(values.trackedBy !== undefined ? { trackedBy: values.trackedBy } : {}),
    ...(values.romScore !== undefined ? { romScore: values.romScore } : {}),
    completed: true,
    completedAt: nowLocalDateTime(),
  })!;
  if (done.weightKg !== null && done.weightKg > 0) fillEmptyWeightsAfter(done, done.weightKg);
  return done;
}

export function uncompleteSet(setId: number): WorkoutSet {
  requireSet(setId);
  return updateSetRow(setId, { completed: false, completedAt: null })!;
}

export function deleteSet(setId: number): void {
  requireSet(setId);
  deleteSetRow(setId);
}

// ---------------------------------------------------------------------------
// Finishing and history edits

export interface FinishWorkoutInput {
  sessionRpe?: number | null;
  notes?: string | null;
  /** Local `YYYY-MM-DDTHH:mm:ss`; defaults to now. */
  finishedAt?: string;
}

/** Closes the session. Sets left uncompleted stay, marked as not done. */
export function finishWorkout(id: number, input: FinishWorkoutInput = {}): Workout {
  const workout = requireWorkout(id);
  if (workout.finishedAt) throw new DomainError("This workout is already finished.");
  requireSessionRpe(input.sessionRpe);
  const finishedAt = input.finishedAt ?? nowLocalDateTime();
  requireDateTime(finishedAt, "Finish time");
  if (finishedAt < workout.startedAt) {
    throw new DomainError("A workout can't finish before it started.");
  }
  if (countCompletedSets(id) === 0) {
    throw new DomainError(
      "Complete at least one set before finishing — or discard the workout if you didn't train.",
    );
  }
  return updateWorkoutRow(id, {
    finishedAt,
    ...(input.sessionRpe !== undefined ? { sessionRpe: input.sessionRpe } : {}),
    ...(input.notes !== undefined ? { notes: cleanNotes(input.notes) } : {}),
  })!;
}

/** Throws away the session in progress. Finished workouts are deleted from history instead. */
export function discardWorkout(id: number): void {
  const workout = requireWorkout(id);
  if (workout.finishedAt) {
    throw new DomainError("Only a workout in progress can be discarded — delete it from history.");
  }
  deleteWorkoutRow(id);
}

export function deleteWorkout(id: number): void {
  requireWorkout(id);
  deleteWorkoutRow(id);
}

export interface WorkoutMetaPatch {
  name?: string;
  date?: string;
  notes?: string | null;
  sessionRpe?: number | null;
}

/** Same clock time, `days` later (or earlier). */
function shiftDateTime(value: string, days: number): string {
  return `${addDays(value.slice(0, 10), days)}${value.slice(10)}`;
}

/**
 * Edits a workout's details from history. Moving it to another date moves its
 * start/finish times with it, so duration and time-of-day stay intact.
 */
export function updateWorkoutMeta(id: number, patch: WorkoutMetaPatch): Workout {
  const workout = requireWorkout(id);
  const values: Partial<Workout> = {};
  if (patch.name !== undefined) values.name = requireName(patch.name);
  if (patch.notes !== undefined) values.notes = cleanNotes(patch.notes);
  if (patch.sessionRpe !== undefined) {
    requireSessionRpe(patch.sessionRpe);
    values.sessionRpe = patch.sessionRpe;
  }
  if (patch.date !== undefined && patch.date !== workout.date) {
    requireDate(patch.date);
    const days = daysBetween(workout.date, patch.date);
    values.date = patch.date;
    values.startedAt = shiftDateTime(workout.startedAt, days);
    if (workout.finishedAt) values.finishedAt = shiftDateTime(workout.finishedAt, days);
  }
  if (Object.keys(values).length === 0) return workout;
  return updateWorkoutRow(id, values)!;
}
