/**
 * Client-safe constants and types for the gym part of `health` — re-exported
 * from `types.ts`, so client components import them from
 * `@/modules/health/types`. No server imports here.
 * See docs/prd/health/gym.md.
 */

/** How an exercise is logged. reps = weight × reps, time = a held duration
 * (optionally loaded), cardio = duration + distance. */
export const EXERCISE_MODES = ["reps", "time", "cardio"] as const;
export type ExerciseMode = (typeof EXERCISE_MODES)[number];

export const EXERCISE_MODE_LABELS: Record<ExerciseMode, string> = {
  reps: "Weight × reps",
  time: "Timed hold",
  cardio: "Cardio",
};

/** Automatic progression rules — see engine/progression.ts. */
export const PROGRESSION_POLICIES = ["off", "linear", "greyskull", "double", "time"] as const;
export type ProgressionPolicy = (typeof PROGRESSION_POLICIES)[number];

export const POLICIES_FOR_MODE: Record<ExerciseMode, readonly ProgressionPolicy[]> = {
  reps: ["off", "linear", "greyskull", "double"],
  time: ["off", "time"],
  cardio: ["off"],
};

export const POLICY_LABELS: Record<ProgressionPolicy, string> = {
  off: "No automatic progression",
  linear: "Linear progression",
  greyskull: "Greyskull LP",
  double: "Double progression",
  time: "Add time",
};

export const POLICY_DESCRIPTIONS: Record<ProgressionPolicy, string> = {
  off: "Targets stay where you set them.",
  linear:
    "Hit every rep of every set and the weight goes up. Three missed sessions in a row trigger a deload.",
  greyskull:
    "Two straight sets plus a final set to failure. Beat the target on that set and the weight goes up — a double jump if you double the reps. One failure resets 10 %.",
  double:
    "Work up through a rep range at the same weight. Reach the top of the range on every set and the weight goes up, reps back to the bottom.",
  time: "Hold every set for the full duration and the target goes up.",
};

/** How a routine entry's loads are chosen. `standard` = progression policy /
 * target RPE; the `wendler_*` schemes take percentages of a training max
 * (engine/wendler.ts). */
export const LOADING_SCHEMES = ["standard", "wendler_main", "wendler_bbb", "wendler_fsl"] as const;
export type LoadingScheme = (typeof LOADING_SCHEMES)[number];

export const LOADING_SCHEME_LABELS: Record<LoadingScheme, string> = {
  standard: "Standard",
  wendler_main: "5/3/1 main sets",
  wendler_bbb: "5/3/1 Boring But Big (5×10)",
  wendler_fsl: "5/3/1 First Set Last (5×5)",
};

export const SET_KINDS = ["warmup", "working", "drop", "failure", "amrap"] as const;
export type SetKind = (typeof SET_KINDS)[number];

export const SET_KIND_LABELS: Record<SetKind, string> = {
  warmup: "Warm-up",
  working: "Working",
  drop: "Drop set",
  failure: "To failure",
  amrap: "AMRAP",
};

/** Optional per-set effort rating. RPE 8 ≈ RIR 2. */
export const EFFORT_SCALES = ["none", "rir", "rpe"] as const;
export type EffortScale = (typeof EFFORT_SCALES)[number];

export const E1RM_FORMULAS = ["epley", "brzycki", "lombardi"] as const;
export type E1rmFormula = (typeof E1RM_FORMULAS)[number];

export const SEXES = ["male", "female"] as const;
export type Sex = (typeof SEXES)[number];

export const PROGRAM_KINDS = ["block", "wendler"] as const;
export type ProgramKind = (typeof PROGRAM_KINDS)[number];

export const PROGRAM_KIND_LABELS: Record<ProgramKind, string> = {
  block: "Training block (mesocycle)",
  wendler: "5/3/1 cycles",
};

export const PROGRAM_STATUSES = ["active", "completed", "archived"] as const;
export type ProgramStatus = (typeof PROGRAM_STATUSES)[number];

export const MEASUREMENT_SITES = [
  "neck",
  "shoulders",
  "chest",
  "waist",
  "hips",
  "left_bicep",
  "right_bicep",
  "left_forearm",
  "right_forearm",
  "left_thigh",
  "right_thigh",
  "left_calf",
  "right_calf",
  "body_fat_pct",
] as const;
export type MeasurementSite = (typeof MEASUREMENT_SITES)[number];

export const MEASUREMENT_LABELS: Record<MeasurementSite, string> = {
  neck: "Neck",
  shoulders: "Shoulders",
  chest: "Chest",
  waist: "Waist",
  hips: "Hips",
  left_bicep: "Left bicep",
  right_bicep: "Right bicep",
  left_forearm: "Left forearm",
  right_forearm: "Right forearm",
  left_thigh: "Left thigh",
  right_thigh: "Right thigh",
  left_calf: "Left calf",
  right_calf: "Right calf",
  body_fat_pct: "Body fat (measured)",
};

/** Every site is in cm except the directly-measured body fat percentage. */
export function measurementUnit(site: MeasurementSite): "cm" | "%" {
  return site === "body_fat_pct" ? "%" : "cm";
}

/**
 * The muscles the body map can shade, head to toe — also the order of any
 * list built from them. Slugs match the MuscleMap path data
 * (_components/body-map-paths.ts).
 */
export const MUSCLES = [
  "trapezius",
  "deltoids",
  "chest",
  "upper-back",
  "serratus",
  "biceps",
  "triceps",
  "forearm",
  "abs",
  "obliques",
  "lower-back",
  "gluteal",
  "quadriceps",
  "hamstring",
  "adductors",
  "hip-flexors",
  "calves",
  "tibialis",
] as const;
export type Muscle = (typeof MUSCLES)[number];

export const MUSCLE_LABELS: Record<Muscle, string> = {
  trapezius: "Traps",
  deltoids: "Shoulders",
  chest: "Chest",
  "upper-back": "Upper back",
  serratus: "Serratus",
  biceps: "Biceps",
  triceps: "Triceps",
  forearm: "Forearms",
  abs: "Abs",
  obliques: "Obliques",
  "lower-back": "Lower back",
  gluteal: "Glutes",
  quadriceps: "Quads",
  hamstring: "Hamstrings",
  adductors: "Adductors",
  "hip-flexors": "Hip flexors",
  calves: "Calves",
  tibialis: "Shins",
};

/** Per-muscle share of one set: 1 = primary mover, fractions = supporting. */
export type MuscleWeights = Partial<Record<Muscle, number>>;

/** Body parts as the exercise dataset files them. */
export const BODY_PARTS = [
  "chest",
  "back",
  "shoulders",
  "upper arms",
  "lower arms",
  "waist",
  "upper legs",
  "lower legs",
  "neck",
  "cardio",
] as const;
export type BodyPart = (typeof BODY_PARTS)[number];

/** 0 = Sunday … 6 = Saturday, matching `Date#getDay()`. */
export const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const;
export type Weekday = (typeof WEEKDAYS)[number];
export const WEEKDAY_LABELS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

export const IMPORT_SOURCES = [
  "strong",
  "hevy",
  "fitnotes",
  "apple_health",
  "plan_file",
  "backup",
] as const;
export type ImportSource = (typeof IMPORT_SOURCES)[number];

export const IMPORT_SOURCE_LABELS: Record<ImportSource, string> = {
  strong: "Strong (CSV)",
  hevy: "Hevy (CSV)",
  fitnotes: "FitNotes (CSV)",
  apple_health: "Apple Health (body weight)",
  plan_file: "Shared plan file",
  backup: "Gym backup (JSON)",
};

export const WORKOUT_SOURCES = ["app", "import"] as const;
export type WorkoutSource = (typeof WORKOUT_SOURCES)[number];

/** How a set's reps were counted. */
export const TRACKED_BY = ["manual", "camera"] as const;
export type TrackedBy = (typeof TRACKED_BY)[number];

/** Movement patterns the camera rep counter understands — client/pose/. */
export const CAMERA_MOVEMENTS = [
  "squat",
  "pushup",
  "curl",
  "overhead_press",
  "lunge",
  "hinge",
  "pullup",
  "lateral_raise",
  "jumping_jack",
] as const;
export type CameraMovement = (typeof CAMERA_MOVEMENTS)[number];

export const CAMERA_MOVEMENT_LABELS: Record<CameraMovement, string> = {
  squat: "Squat",
  pushup: "Push-up",
  curl: "Biceps curl",
  overhead_press: "Overhead press",
  lunge: "Lunge",
  hinge: "Hip hinge / deadlift",
  pullup: "Pull-up / chin-up",
  lateral_raise: "Lateral raise",
  jumping_jack: "Jumping jack",
};

/** Readiness check-in scales are 1–5. Soreness and stress: 5 = worst. */
export const READINESS_FIELDS = [
  "sleepQuality",
  "energy",
  "soreness",
  "stress",
  "motivation",
] as const;
export type ReadinessField = (typeof READINESS_FIELDS)[number];

export const READINESS_BANDS = ["push", "normal", "easy", "rest"] as const;
export type ReadinessBand = (typeof READINESS_BANDS)[number];

export const DEFAULT_PLATES_KG = [25, 20, 15, 10, 5, 2.5, 1.25] as const;
export const DEFAULT_BAR_WEIGHT_KG = 20;
export const DEFAULT_REST_SEC = 90;

/**
 * The unit weights are shown and typed in. Storage is always kg; this only
 * changes display, input and default load steps (engine/units.ts).
 */
export const WEIGHT_UNITS = ["kg", "lb"] as const;
export type WeightUnit = (typeof WEIGHT_UNITS)[number];

/** Standard pound plates and bar, used when switching a fresh setup to lb. */
export const DEFAULT_PLATES_LB = [45, 35, 25, 10, 5, 2.5] as const;
export const DEFAULT_BAR_WEIGHT_LB = 45;

/** Progress-photo angles; each series is compared like with like. */
export const PHOTO_POSES = ["front", "side", "back"] as const;
export type PhotoPose = (typeof PHOTO_POSES)[number];

export const PHOTO_POSE_LABELS: Record<PhotoPose, string> = {
  front: "Front",
  side: "Side",
  back: "Back",
};
