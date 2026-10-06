/**
 * The full gym backup: everything gym-related that lives in the database,
 * as one JSON document. Importing merges and is idempotent (workouts by `ref`,
 * routines by name, weigh-ins by date + value, measurements by date + site,
 * readiness by date, settings only when none exist). In-progress sessions and
 * programs/training maxes are not part of the backup.
 */
import {
  E1RM_FORMULAS,
  EFFORT_SCALES,
  MEASUREMENT_SITES,
  SET_KINDS,
  SEXES,
  type E1rmFormula,
  type EffortScale,
  type MeasurementSite,
  type Sex,
} from "../gym-types";
import { readPlanExercise, readRoutines, readWeek } from "./plan-file";
import type { ImportedWeighIn, ImportedWorkout, PlanFileExercise, PlanFileV1 } from "./types";
import {
  ImportFormatError,
  readArray,
  readBoolean,
  readDate,
  readDateTime,
  readEnum,
  readInt,
  readNullableNumber,
  readNullableString,
  readNumber,
  readObject,
  readString,
} from "./validate";

export const BACKUP_FORMAT = "personal-life-os/gym-backup" as const;

export interface GymBackupMeasurement {
  date: string;
  site: MeasurementSite;
  value: number;
  note: string | null;
}

export interface GymBackupReadiness {
  date: string;
  sleepQuality: number;
  energy: number;
  soreness: number;
  stress: number;
  motivation: number;
  note: string | null;
}

export interface GymBackupSettings {
  sex: Sex | null;
  heightCm: number | null;
  goalWeightKg: number | null;
  effortScale: EffortScale;
  defaultRestSec: number;
  e1rmFormula: E1rmFormula;
  barWeightKg: number;
  platesKg: number[];
  ownedEquipment: string[];
  weeklySessionGoal: number;
  sleepTargetHours: number;
  askBodyweightOnStart: boolean;
  keepAwake: boolean;
  restSound: boolean;
  restNotifications: boolean;
}

export interface GymBackupV1 {
  format: typeof BACKUP_FORMAT;
  version: 1;
  exportedAt: string;
  customExercises: PlanFileExercise[];
  routines: PlanFileV1["routines"];
  week: PlanFileV1["week"];
  workouts: ImportedWorkout[];
  weighIns: ImportedWeighIn[];
  measurements: GymBackupMeasurement[];
  readiness: GymBackupReadiness[];
  settings: GymBackupSettings | null;
}

export const BACKUP_LIMITS = {
  workouts: 100_000,
  weighIns: 100_000,
  measurements: 100_000,
  readiness: 20_000,
  customExercises: 5000,
} as const;

const finite = (value: unknown, path: string, min: number, max: number) =>
  readNullableNumber(value, path, min, max);

function readWorkout(value: unknown, path: string): ImportedWorkout {
  const o = readObject(value, path);
  const startedAt = readDateTime(o.startedAt, `${path}.startedAt`);
  const finishedAt =
    o.finishedAt === null || o.finishedAt === undefined
      ? null
      : readDateTime(o.finishedAt, `${path}.finishedAt`);
  return {
    ref: readString(o.ref, `${path}.ref`, { min: 1, max: 300 }),
    date: readDate(o.date, `${path}.date`),
    startedAt,
    finishedAt,
    name: readString(o.name, `${path}.name`, { max: 200 }),
    notes: readNullableString(o.notes, `${path}.notes`),
    exercises: readArray(o.exercises, `${path}.exercises`, 200).map((e, i) => {
      const ep = `${path}.exercises[${i}]`;
      const eo = readObject(e, ep);
      return {
        name: readString(eo.name, `${ep}.name`, { min: 1, max: 200 }),
        notes: readNullableString(eo.notes, `${ep}.notes`),
        sets: readArray(eo.sets, `${ep}.sets`, 500).map((s, j) => {
          const sp = `${ep}.sets[${j}]`;
          const so = readObject(s, sp);
          return {
            kind: readEnum(so.kind, `${sp}.kind`, SET_KINDS, "working"),
            weightKg: finite(so.weightKg, `${sp}.weightKg`, 0, 5000),
            reps:
              so.reps === null || so.reps === undefined
                ? null
                : readInt(so.reps, `${sp}.reps`, 0, 100_000),
            durationSec: finite(so.durationSec, `${sp}.durationSec`, 0, 604_800),
            distanceKm: finite(so.distanceKm, `${sp}.distanceKm`, 0, 100_000),
            rpe: finite(so.rpe, `${sp}.rpe`, 0, 10),
            rir: finite(so.rir, `${sp}.rir`, 0, 20),
          };
        }),
      };
    }),
  };
}

function readSettings(value: unknown): GymBackupSettings | null {
  if (value === null || value === undefined) return null;
  const o = readObject(value, "settings");
  const sex = o.sex === null || o.sex === undefined ? null : readEnum(o.sex, "settings.sex", SEXES);
  return {
    sex,
    heightCm: finite(o.heightCm, "settings.heightCm", 50, 280),
    goalWeightKg: finite(o.goalWeightKg, "settings.goalWeightKg", 1, 1000),
    effortScale: readEnum(o.effortScale, "settings.effortScale", EFFORT_SCALES, "none"),
    defaultRestSec:
      o.defaultRestSec === undefined
        ? 90
        : readInt(o.defaultRestSec, "settings.defaultRestSec", 0, 3600),
    e1rmFormula: readEnum(o.e1rmFormula, "settings.e1rmFormula", E1RM_FORMULAS, "epley"),
    barWeightKg:
      o.barWeightKg === undefined ? 20 : readNumber(o.barWeightKg, "settings.barWeightKg", 0, 100),
    platesKg: readArray(o.platesKg ?? [25, 20, 15, 10, 5, 2.5, 1.25], "settings.platesKg", 30).map(
      (p, i) => readNumber(p, `settings.platesKg[${i}]`, 0.1, 100),
    ),
    ownedEquipment: readArray(o.ownedEquipment ?? [], "settings.ownedEquipment", 50).map((e, i) =>
      readString(e, `settings.ownedEquipment[${i}]`, { max: 50 }),
    ),
    weeklySessionGoal:
      o.weeklySessionGoal === undefined
        ? 3
        : readInt(o.weeklySessionGoal, "settings.weeklySessionGoal", 0, 14),
    sleepTargetHours:
      o.sleepTargetHours === undefined
        ? 8
        : readNumber(o.sleepTargetHours, "settings.sleepTargetHours", 0, 24),
    askBodyweightOnStart: readBoolean(
      o.askBodyweightOnStart,
      "settings.askBodyweightOnStart",
      true,
    ),
    keepAwake: readBoolean(o.keepAwake, "settings.keepAwake", true),
    restSound: readBoolean(o.restSound, "settings.restSound", true),
    restNotifications: readBoolean(o.restNotifications, "settings.restNotifications", false),
  };
}

/** Validates an untrusted JSON value as a gym backup. Throws `ImportFormatError`. */
export function parseBackup(json: unknown): GymBackupV1 {
  const o = readObject(json, "backup");
  if (o.format !== BACKUP_FORMAT) {
    throw new ImportFormatError("This isn't a Personal Life OS gym backup (format mismatch).");
  }
  if (o.version !== 1) {
    throw new ImportFormatError(
      `This backup is version ${String(o.version)}, but only version 1 is supported.`,
    );
  }
  const routines = readRoutines(o.routines ?? [], "routines");
  const list = (key: string, max: number) => readArray(o[key] ?? [], key, max);
  return {
    format: BACKUP_FORMAT,
    version: 1,
    exportedAt:
      typeof o.exportedAt === "string" ? readString(o.exportedAt, "exportedAt", { max: 40 }) : "",
    customExercises: list("customExercises", BACKUP_LIMITS.customExercises).map((e, i) =>
      readPlanExercise(e, `customExercises[${i}]`),
    ),
    routines,
    week: readWeek(o.week, "week", routines.length),
    workouts: list("workouts", BACKUP_LIMITS.workouts).map((w, i) =>
      readWorkout(w, `workouts[${i}]`),
    ),
    weighIns: list("weighIns", BACKUP_LIMITS.weighIns).map((w, i) => {
      const wo = readObject(w, `weighIns[${i}]`);
      return {
        date: readDate(wo.date, `weighIns[${i}].date`),
        weightKg: readNumber(wo.weightKg, `weighIns[${i}].weightKg`, 1, 1000),
      };
    }),
    measurements: list("measurements", BACKUP_LIMITS.measurements).map((m, i) => {
      const mo = readObject(m, `measurements[${i}]`);
      return {
        date: readDate(mo.date, `measurements[${i}].date`),
        site: readEnum(mo.site, `measurements[${i}].site`, MEASUREMENT_SITES),
        value: readNumber(mo.value, `measurements[${i}].value`, 0, 1000),
        note: readNullableString(mo.note, `measurements[${i}].note`, 1000),
      };
    }),
    readiness: list("readiness", BACKUP_LIMITS.readiness).map((r, i) => {
      const ro = readObject(r, `readiness[${i}]`);
      const rate = (key: string) => readInt(ro[key], `readiness[${i}].${key}`, 1, 5);
      return {
        date: readDate(ro.date, `readiness[${i}].date`),
        sleepQuality: rate("sleepQuality"),
        energy: rate("energy"),
        soreness: rate("soreness"),
        stress: rate("stress"),
        motivation: rate("motivation"),
        note: readNullableString(ro.note, `readiness[${i}].note`, 1000),
      };
    }),
    settings: readSettings(o.settings),
  };
}

/**
 * Splits a backup into pieces small enough for the Server Action body limit:
 * the first piece carries everything except workouts (and the first slice of
 * workouts); later pieces carry only workouts. Importing every piece in order
 * is equivalent to importing the whole.
 */
export function splitBackup(backup: GymBackupV1, workoutsPerChunk = 200): GymBackupV1[] {
  const chunks: GymBackupV1[] = [];
  const size = Math.max(1, Math.min(workoutsPerChunk, 500));
  const base: GymBackupV1 = { ...backup, workouts: backup.workouts.slice(0, size) };
  chunks.push(base);
  for (let i = size; i < backup.workouts.length; i += size) {
    chunks.push({
      ...backup,
      customExercises: [],
      routines: [],
      week: {},
      weighIns: [],
      measurements: [],
      readiness: [],
      settings: null,
      workouts: backup.workouts.slice(i, i + size),
    });
  }
  return chunks;
}
