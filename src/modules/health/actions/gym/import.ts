"use server";

import { z } from "zod";
import { defineAction } from "@/modules/core/action/define-action";
import {
  E1RM_FORMULAS,
  EFFORT_SCALES,
  EXERCISE_MODES,
  LOADING_SCHEMES,
  MEASUREMENT_SITES,
  PROGRESSION_POLICIES,
  SEXES,
  SET_KINDS,
} from "../../gym-types";
import { BACKUP_FORMAT, type GymBackupV1 } from "../../importers/backup";
import { PLAN_FILE_FORMAT } from "../../importers/plan-file";
import type { PlanFileV1 } from "../../importers/types";
import {
  exportBackup,
  exportPlanFile,
  importBackup,
  importPlanFile,
  importWeighIns,
  importWorkouts,
} from "../../service/gym/import";

/**
 * Server Actions for the gym import page. The files are parsed in the browser
 * (importers/) and arrive here as compact JSON. The Server Action body limit is
 * 10 MB, so callers send workouts in chunks (<= 200 per call is comfortable,
 * 500 is the hard cap) and weigh-ins in chunks of <= 20 000; every import is
 * idempotent, so a chunk can safely be retried or re-sent. A big backup is cut
 * up with `splitBackup` (importers/backup.ts) and sent piece by piece.
 */

const MAX_WORKOUTS = 500;
const MAX_WEIGH_INS = 20_000;

const text = (max: number) => z.string().max(max);
const num = (min: number, max: number) => z.number().min(min).max(max);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Dates look like 2024-05-01.");
const isoDateTime = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/, "Date-times look like 2024-05-01T07:30:00.");

const setSchema = z.object({
  kind: z.enum(SET_KINDS),
  weightKg: num(0, 5000).nullable(),
  reps: z.number().int().min(0).max(100_000).nullable(),
  durationSec: num(0, 604_800).nullable(),
  distanceKm: num(0, 100_000).nullable(),
  rpe: num(0, 10).nullable(),
  rir: num(0, 20).nullable(),
});

const workoutSchema = z.object({
  ref: text(300).min(1),
  date: isoDate,
  startedAt: isoDateTime,
  finishedAt: isoDateTime.nullable(),
  name: text(200),
  notes: text(5000).nullable(),
  exercises: z
    .array(
      z.object({
        name: text(200).min(1),
        notes: text(5000).nullable(),
        sets: z.array(setSchema).max(500),
      }),
    )
    .max(200),
});

const weighInSchema = z.object({ date: isoDate, weightKg: num(1, 1000) });

const planExerciseSchema = z.object({
  catalogKey: text(50).nullable(),
  name: text(200).min(1),
  bodyPart: text(50),
  equipment: text(50),
  target: text(100),
  secondaryMuscles: z.array(text(100)).max(20),
  defaultMode: z.enum(EXERCISE_MODES),
  isBodyweight: z.boolean(),
  isUnilateral: z.boolean(),
});

const planEntrySchema = z.object({
  exercise: planExerciseSchema,
  mode: z.enum(EXERCISE_MODES),
  sets: z.number().int().min(1).max(50),
  reps: z.number().int().min(0).max(1000).nullable(),
  repsMin: z.number().int().min(0).max(1000).nullable(),
  weightKg: num(0, 2000).nullable(),
  durationSec: z.number().int().min(0).max(86_400).nullable(),
  distanceKm: num(0, 10_000).nullable(),
  restSec: z.number().int().min(0).max(3600).nullable(),
  supersetGroup: z.number().int().min(0).max(1000).nullable(),
  perSide: z.boolean(),
  isBodyweight: z.boolean(),
  progressionPolicy: z.enum(PROGRESSION_POLICIES).nullable(),
  incrementKg: num(0, 500).nullable(),
  targetRpe: num(1, 10).nullable(),
  scheme: z.enum(LOADING_SCHEMES),
  notes: text(2000).nullable(),
});

const routinesSchema = z
  .array(
    z.object({
      name: text(200).min(1),
      notes: text(5000).nullable(),
      progressionPolicy: z.enum(PROGRESSION_POLICIES),
      entries: z.array(planEntrySchema).max(100),
    }),
  )
  .max(200);

const weekSchema = z.record(
  z.string().regex(/^[0-6]$/),
  z.number().int().min(0).max(199).nullable(),
);

/** Every week index must point at a routine that exists. */
function weekPointsInside(value: { routines: unknown[]; week: Record<string, number | null> }) {
  return Object.values(value.week).every((i) => i === null || i < value.routines.length);
}

const planFileSchema = z
  .object({
    format: z.literal(PLAN_FILE_FORMAT),
    version: z.literal(1),
    exportedAt: text(40),
    routines: routinesSchema,
    week: weekSchema,
  })
  .refine(weekPointsInside, "The weekly plan refers to a routine that isn't in the file.");

const settingsSchema = z.object({
  sex: z.enum(SEXES).nullable(),
  heightCm: num(50, 280).nullable(),
  goalWeightKg: num(1, 1000).nullable(),
  effortScale: z.enum(EFFORT_SCALES),
  defaultRestSec: z.number().int().min(0).max(3600),
  e1rmFormula: z.enum(E1RM_FORMULAS),
  barWeightKg: num(0, 100),
  platesKg: z.array(num(0.1, 100)).max(30),
  ownedEquipment: z.array(text(50)).max(50),
  weeklySessionGoal: z.number().int().min(0).max(14),
  sleepTargetHours: num(0, 24),
  askBodyweightOnStart: z.boolean(),
  keepAwake: z.boolean(),
  restSound: z.boolean(),
  restNotifications: z.boolean(),
});

const rating = z.number().int().min(1).max(5);

const backupSchema = z
  .object({
    format: z.literal(BACKUP_FORMAT),
    version: z.literal(1),
    exportedAt: text(40),
    customExercises: z.array(planExerciseSchema).max(5000),
    routines: routinesSchema,
    week: weekSchema,
    workouts: z.array(workoutSchema).max(MAX_WORKOUTS),
    weighIns: z.array(weighInSchema).max(MAX_WEIGH_INS),
    measurements: z
      .array(
        z.object({
          date: isoDate,
          site: z.enum(MEASUREMENT_SITES),
          value: num(0, 1000),
          note: text(1000).nullable(),
        }),
      )
      .max(100_000),
    readiness: z
      .array(
        z.object({
          date: isoDate,
          sleepQuality: rating,
          energy: rating,
          soreness: rating,
          stress: rating,
          motivation: rating,
          note: text(1000).nullable(),
        }),
      )
      .max(20_000),
    settings: settingsSchema.nullable(),
  })
  .refine(weekPointsInside, "The weekly plan refers to a routine that isn't in the file.");

/** One chunk of parsed workouts (<= 500 per call; send 200 or fewer). */
export const importWorkoutsAction = defineAction(
  z.object({
    source: z.enum(["strong", "hevy", "fitnotes", "backup"]),
    workouts: z.array(workoutSchema).max(MAX_WORKOUTS),
  }),
  ({ source, workouts }) => importWorkouts(workouts, source),
  { name: "health:gym-import-workouts" },
);

/** One chunk of body weights (<= 20 000 per call). */
export const importWeighInsAction = defineAction(
  z.object({ weighIns: z.array(weighInSchema).max(MAX_WEIGH_INS) }),
  ({ weighIns }) => importWeighIns(weighIns),
  { name: "health:gym-import-weigh-ins" },
);

export const importPlanFileAction = defineAction(
  z.object({ plan: planFileSchema }),
  ({ plan }) => importPlanFile(plan as PlanFileV1),
  { name: "health:gym-import-plan" },
);

/** A backup, or one piece of a split backup (<= 500 workouts per call). */
export const importBackupAction = defineAction(
  z.object({ backup: backupSchema }),
  ({ backup }) => importBackup(backup as GymBackupV1),
  { name: "health:gym-import-backup" },
);

export const exportPlanFileAction = defineAction(
  z.object({ routineIds: z.array(z.number().int()).max(500).optional() }),
  ({ routineIds }) => exportPlanFile(routineIds),
  { name: "health:gym-export-plan", revalidate: false, readOnly: true },
);

export const exportBackupAction = defineAction(z.object({}), () => exportBackup(), {
  name: "health:gym-export-backup",
  revalidate: false,
  readOnly: true,
});
