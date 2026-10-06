/**
 * Shared input/output shapes for the training engine.
 *
 * `engine/` is pure and isomorphic: no database, no Next.js, no Node APIs —
 * only these types, `../gym-types` and `@/lib/dates`. That is what lets the
 * same functions run on the server (prescriptions, analytics, insights) and
 * in client components (plate calculator, 1RM calculator, live PR detection).
 * Enforced by src/test/architecture.test.ts. See docs/prd/health/gym.md.
 */
import type {
  BodyPart,
  E1rmFormula,
  ExerciseMode,
  LoadingScheme,
  Muscle,
  MuscleWeights,
  ProgressionPolicy,
  ReadinessBand,
  SetKind,
  Sex,
  WeightUnit,
} from "../gym-types";

/** One logged (or planned-but-unlogged) set as the engine sees it. */
export interface SetRecord {
  kind: SetKind;
  weightKg: number | null;
  reps: number | null;
  durationSec: number | null;
  distanceKm: number | null;
  rir: number | null;
  rpe: number | null;
  completed: boolean;
}

/** What a session asked of one exercise (the `target_*` snapshot). */
export interface EntryTarget {
  mode: ExerciseMode;
  sets: number | null;
  reps: number | null;
  repsMin: number | null;
  weightKg: number | null;
  durationSec: number | null;
  distanceKm: number | null;
  targetRpe: number | null;
}

/** One exercise as performed in one past workout, oldest-first in any list. */
export interface ExerciseSession {
  workoutId: number;
  date: string;
  /** Snapshot of what was prescribed; null for imported/legacy sessions. */
  target: EntryTarget | null;
  sets: SetRecord[];
}

/** A routine entry plus the exercise facts the engine needs to prescribe it. */
export interface ExercisePlan {
  exerciseId: number;
  bodyPart: BodyPart | string;
  mode: ExerciseMode;
  sets: number;
  reps: number | null;
  repsMin: number | null;
  weightKg: number | null;
  durationSec: number | null;
  distanceKm: number | null;
  perSide: boolean;
  isBodyweight: boolean;
  /** Already resolved (entry override ?? routine default). */
  policy: ProgressionPolicy;
  incrementKg: number | null;
  targetRpe: number | null;
  scheme: LoadingScheme;
  /** Display unit: picks the default load steps (2.5/5 kg or 5/10 lb) and the unit in `reason`. Default kg. */
  weightUnit?: WeightUnit;
}

/** A set the session should open with. */
export interface PlannedSet {
  kind: SetKind;
  weightKg: number | null;
  reps: number | null;
  durationSec: number | null;
  distanceKm: number | null;
}

export type PrescriptionKind = "first" | "up" | "hold" | "deload" | "off" | "program" | "autoreg";

/**
 * The next target for one exercise. `reason` always answers "why this
 * number?" in plain English. Fields the rule has no opinion on are undefined
 * and the plan's own value stands.
 */
export interface Prescription {
  policy: ProgressionPolicy;
  kind: PrescriptionKind;
  weightKg?: number;
  reps?: number;
  sets?: number;
  durationSec?: number;
  reason: string;
}

/** Block-periodization modifiers for one week (engine/periodization.ts). */
export interface WeekModifiers {
  week: number;
  totalWeeks: number;
  isDeload: boolean;
  /** Working sets added by the weekly ramp (0 on a deload). */
  setDelta: number;
  /** Applied to the working-set count before `setDelta`, rounded up, min 1 (0.5 on a deload). */
  setMultiplier: number;
  /** Multiplier on prescribed loads (1 = unchanged, 0.9 on a deload). */
  loadFactor: number;
  /** Added to any target RPE (−2 on a deload). */
  rpeDelta: number;
  label: string;
}

/** A finished workout reduced to what analytics needs. */
export interface WorkoutRecord {
  id: number;
  date: string;
  startedAt: string;
  finishedAt: string | null;
  sessionRpe: number | null;
  entries: Array<{
    exerciseId: number;
    exerciseName: string;
    mode: ExerciseMode;
    isBodyweight: boolean;
    /** From engine/muscles.ts musclesOf(). */
    muscles: MuscleWeights;
    sets: SetRecord[];
  }>;
}

export interface E1rmEstimate {
  e1rmKg: number;
  /** The set it came from — "est. from 100 × 5" matters. */
  weightKg: number;
  reps: number;
}

export type PrType =
  | "e1rm"
  | "heaviest"
  | "best_set_volume"
  | "most_reps_at_weight"
  | "longest_hold"
  | "longest_distance";

export interface PersonalRecord {
  type: PrType;
  exerciseId: number;
  value: number;
  /** e.g. weight for "most reps at weight" */
  context: string;
  date: string;
  workoutId: number;
}

export interface VolumeLandmark {
  mev: number;
  mavLow: number;
  mavHigh: number;
  mrv: number;
}

export type VolumeStatus =
  "none" | "below_mev" | "maintenance" | "productive" | "high" | "above_mrv";

export interface MuscleVolume {
  muscle: Muscle;
  hardSets: number;
  landmark: VolumeLandmark;
  status: VolumeStatus;
}

export interface ReadinessInput {
  sleepHours: number | null;
  sleepTargetHours: number;
  checkin: {
    sleepQuality: number;
    energy: number;
    soreness: number;
    stress: number;
    motivation: number;
  } | null;
  /** Acute:chronic workload ratio, if enough history. */
  acwr: number | null;
}

export interface ReadinessResult {
  /** 0–100, null when there is nothing to judge. */
  score: number | null;
  band: ReadinessBand | null;
  recommendation: string;
  /** Each contributing factor, for the "why" breakdown. */
  factors: Array<{ label: string; detail: string; impact: "positive" | "neutral" | "negative" }>;
}

export interface BodyComposition {
  bmi: number | null;
  bodyFatPct: number | null;
  /** "navy" (tape estimate) or "measured" (logged body_fat_pct). */
  bodyFatSource: "navy" | "measured" | null;
  leanMassKg: number | null;
  ffmi: number | null;
  normalizedFfmi: number | null;
  waistToHeight: number | null;
}

export type StrengthLevel =
  "untrained" | "beginner" | "novice" | "intermediate" | "advanced" | "elite";

export interface StrengthStandard {
  lift: "squat" | "bench" | "deadlift" | "overhead_press" | "row" | "pullup";
  e1rmKg: number | null;
  ratio: number | null;
  level: StrengthLevel | null;
  /** kg needed for the next level, at the current bodyweight. */
  nextLevelKg: number | null;
}

export interface FormulaOptions {
  formula: E1rmFormula;
  sex: Sex | null;
}
