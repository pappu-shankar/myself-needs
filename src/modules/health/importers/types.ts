/**
 * Normalized shapes every importer produces. Parsers in `importers/` are pure
 * and isomorphic (like `engine/`): the browser parses the file locally — an
 * Apple Health export can be hundreds of MB — and sends only these compact
 * records to a Server Action, which hands them to service/gym/import.ts.
 * All weights are kg, distances km, durations seconds.
 * See docs/prd/health/gym.md.
 */
import type {
  BodyPart,
  ExerciseMode,
  ImportSource,
  LoadingScheme,
  ProgressionPolicy,
  SetKind,
} from "../gym-types";

export interface ImportedSet {
  kind: SetKind;
  weightKg: number | null;
  reps: number | null;
  durationSec: number | null;
  distanceKm: number | null;
  rpe: number | null;
  rir: number | null;
}

export interface ImportedExercise {
  /** As written in the source file; matched to the catalog on import. */
  name: string;
  notes: string | null;
  sets: ImportedSet[];
}

export interface ImportedWorkout {
  /** Stable across re-imports of the same file, e.g. `strong:2024-05-01T07:30:00:Push Day`. */
  ref: string;
  date: string;
  startedAt: string;
  finishedAt: string | null;
  name: string;
  notes: string | null;
  exercises: ImportedExercise[];
}

export interface ImportedWeighIn {
  date: string;
  weightKg: number;
}

export interface ParseResult {
  source: ImportSource;
  workouts: ImportedWorkout[];
  weighIns: ImportedWeighIn[];
  /** Human-readable notes about rows skipped or assumptions made. */
  warnings: string[];
}

/** An exercise as carried inside a plan file — enough to re-create a custom one. */
export interface PlanFileExercise {
  catalogKey: string | null;
  name: string;
  bodyPart: BodyPart | string;
  equipment: string;
  target: string;
  secondaryMuscles: string[];
  defaultMode: ExerciseMode;
  isBodyweight: boolean;
  isUnilateral: boolean;
}

export interface PlanFileEntry {
  exercise: PlanFileExercise;
  mode: ExerciseMode;
  sets: number;
  reps: number | null;
  repsMin: number | null;
  weightKg: number | null;
  durationSec: number | null;
  distanceKm: number | null;
  restSec: number | null;
  supersetGroup: number | null;
  perSide: boolean;
  isBodyweight: boolean;
  progressionPolicy: ProgressionPolicy | null;
  incrementKg: number | null;
  targetRpe: number | null;
  scheme: LoadingScheme;
  notes: string | null;
}

/**
 * A shareable plan: routines + weekly schedule, no workout history, no body
 * data. Importing merges (new routines are added, nothing is overwritten).
 */
export interface PlanFileV1 {
  format: "personal-life-os/gym-plan";
  version: 1;
  exportedAt: string;
  routines: Array<{
    name: string;
    notes: string | null;
    progressionPolicy: ProgressionPolicy;
    entries: PlanFileEntry[];
  }>;
  /** weekday (0 = Sunday) → index into `routines`, or null. */
  week: Record<string, number | null>;
}
