/**
 * The shareable plan file (routines + weekly schedule, no history, no body
 * data). `parsePlanFile` validates untrusted JSON thoroughly and throws an
 * `ImportFormatError` with a friendly, path-qualified message. Optional
 * exercise/entry fields fall back to sensible defaults so a hand-edited or
 * older file still loads.
 */
import { EXERCISE_MODES, LOADING_SCHEMES, PROGRESSION_POLICIES, WEEKDAYS } from "../gym-types";
import type { PlanFileEntry, PlanFileExercise, PlanFileV1 } from "./types";
import {
  ImportFormatError,
  readArray,
  readBoolean,
  readEnum,
  readInt,
  readNullableInt,
  readNullableNumber,
  readNullableString,
  readNumber,
  readObject,
  readString,
  type Obj,
} from "./validate";

export const PLAN_FILE_FORMAT = "personal-life-os/gym-plan" as const;

export const PLAN_LIMITS = { routines: 200, entriesPerRoutine: 100 } as const;

/** Reads one exercise description (shared with the backup's custom exercises). */
export function readPlanExercise(value: unknown, path: string): PlanFileExercise {
  const o = readObject(value, path);
  const secondaryRaw = o.secondaryMuscles === undefined ? [] : o.secondaryMuscles;
  return {
    catalogKey: readNullableString(o.catalogKey, `${path}.catalogKey`, 50),
    name: readString(o.name, `${path}.name`, { min: 1, max: 200 }).trim(),
    bodyPart:
      o.bodyPart === undefined ? "other" : readString(o.bodyPart, `${path}.bodyPart`, { max: 50 }),
    equipment:
      o.equipment === undefined
        ? "other"
        : readString(o.equipment, `${path}.equipment`, { max: 50 }),
    target: o.target === undefined ? "" : readString(o.target, `${path}.target`, { max: 100 }),
    secondaryMuscles: readArray(secondaryRaw, `${path}.secondaryMuscles`, 20).map((m, i) =>
      readString(m, `${path}.secondaryMuscles[${i}]`, { max: 100 }),
    ),
    defaultMode: readEnum(o.defaultMode, `${path}.defaultMode`, EXERCISE_MODES, "reps"),
    isBodyweight: readBoolean(o.isBodyweight, `${path}.isBodyweight`, false),
    isUnilateral: readBoolean(o.isUnilateral, `${path}.isUnilateral`, false),
  };
}

function readEntry(value: unknown, path: string): PlanFileEntry {
  const o = readObject(value, path);
  if (o.exercise === undefined) {
    throw new ImportFormatError(`${path}.exercise: every entry needs an exercise`);
  }
  const exercise = readPlanExercise(o.exercise, `${path}.exercise`);
  const mode = readEnum(o.mode, `${path}.mode`, EXERCISE_MODES, exercise.defaultMode);
  const policy =
    o.progressionPolicy === null || o.progressionPolicy === undefined
      ? null
      : readEnum(o.progressionPolicy, `${path}.progressionPolicy`, PROGRESSION_POLICIES);
  return {
    exercise,
    mode,
    sets: o.sets === undefined ? 3 : readInt(o.sets, `${path}.sets`, 1, 50),
    reps: readNullableInt(o.reps, `${path}.reps`, 0, 1000),
    repsMin: readNullableInt(o.repsMin, `${path}.repsMin`, 0, 1000),
    weightKg: readNullableNumber(o.weightKg, `${path}.weightKg`, 0, 2000),
    durationSec: readNullableInt(o.durationSec, `${path}.durationSec`, 0, 86_400),
    distanceKm: readNullableNumber(o.distanceKm, `${path}.distanceKm`, 0, 10_000),
    restSec: readNullableInt(o.restSec, `${path}.restSec`, 0, 3600),
    supersetGroup: readNullableInt(o.supersetGroup, `${path}.supersetGroup`, 0, 1000),
    perSide: readBoolean(o.perSide, `${path}.perSide`, false),
    isBodyweight: readBoolean(o.isBodyweight, `${path}.isBodyweight`, exercise.isBodyweight),
    progressionPolicy: policy,
    incrementKg: readNullableNumber(o.incrementKg, `${path}.incrementKg`, 0, 500),
    targetRpe: readNullableNumber(o.targetRpe, `${path}.targetRpe`, 1, 10),
    scheme: readEnum(o.scheme, `${path}.scheme`, LOADING_SCHEMES, "standard"),
    notes: readNullableString(o.notes, `${path}.notes`, 2000),
  };
}

/** Reads the `routines` array of a plan file / backup. */
export function readRoutines(value: unknown, path: string): PlanFileV1["routines"] {
  return readArray(value, path, PLAN_LIMITS.routines).map((r, i) => {
    const rp = `${path}[${i}]`;
    const o = readObject(r, rp);
    return {
      name: readString(o.name, `${rp}.name`, { min: 1, max: 200 }).trim(),
      notes: readNullableString(o.notes, `${rp}.notes`, 5000),
      progressionPolicy: readEnum(
        o.progressionPolicy,
        `${rp}.progressionPolicy`,
        PROGRESSION_POLICIES,
        "linear",
      ),
      entries: readArray(o.entries ?? [], `${rp}.entries`, PLAN_LIMITS.entriesPerRoutine).map(
        (e, j) => readEntry(e, `${rp}.entries[${j}]`),
      ),
    };
  });
}

/** Reads the `week` map: weekday "0"–"6" → routine index or null. */
export function readWeek(value: unknown, path: string, routineCount: number): PlanFileV1["week"] {
  const week: PlanFileV1["week"] = {};
  if (value === undefined || value === null) return week;
  const o: Obj = readObject(value, path);
  for (const [key, idx] of Object.entries(o)) {
    if (!(WEEKDAYS as readonly number[]).includes(Number(key)) || !/^\d$/.test(key)) {
      throw new ImportFormatError(`${path}.${key}: weekdays are 0 (Sunday) to 6 (Saturday)`);
    }
    if (idx === null) {
      week[key] = null;
      continue;
    }
    const n = readNumber(idx, `${path}.${key}`, 0, Math.max(0, routineCount - 1));
    if (!Number.isInteger(n) || n >= routineCount) {
      throw new ImportFormatError(`${path}.${key}: there is no routine number ${idx}`);
    }
    week[key] = n;
  }
  return week;
}

/** Validates an untrusted JSON value as a plan file. Throws `ImportFormatError`. */
export function parsePlanFile(json: unknown): PlanFileV1 {
  const o = readObject(json, "plan file");
  if (o.format !== PLAN_FILE_FORMAT) {
    throw new ImportFormatError("This isn't a Personal Life OS plan file (format mismatch).");
  }
  if (o.version !== 1) {
    throw new ImportFormatError(
      `This plan file is version ${String(o.version)}, but only version 1 is supported.`,
    );
  }
  const routines = readRoutines(o.routines, "routines");
  return {
    format: PLAN_FILE_FORMAT,
    version: 1,
    exportedAt:
      typeof o.exportedAt === "string" ? readString(o.exportedAt, "exportedAt", { max: 40 }) : "",
    routines,
    week: readWeek(o.week, "week", routines.length),
  };
}
