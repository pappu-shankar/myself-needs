import { DomainError } from "@/modules/core/errors";
import type { ExerciseMode, ImportSource, SetKind } from "../../gym-types";
import { BACKUP_FORMAT, type GymBackupV1 } from "../../importers/backup";
import { guessExerciseTraits, matchExercise } from "../../importers/name-match";
import { PLAN_FILE_FORMAT } from "../../importers/plan-file";
import { addSecondsLocal } from "../../importers/shared";
import type {
  ImportedSet,
  ImportedWeighIn,
  ImportedWorkout,
  PlanFileEntry,
  PlanFileExercise,
  PlanFileV1,
} from "../../importers/types";
import {
  findExistingImportRefs,
  getSettingsRow,
  inTransaction,
  insertExercise,
  insertMeasurement,
  insertReadinessIfMissing,
  insertRoutineTree,
  insertSettingsIfMissing,
  insertWorkoutTree,
  listActiveExercises,
  listMeasurements,
  listReadiness,
  listRoutineNames,
  listRoutinesForExport,
  listWeekSchedule,
  listWeightEntries,
  listWorkoutsForExport,
  setWeekdayIfEmpty,
  type ImportExerciseRow,
  type WorkoutTree,
} from "../../db/queries/gym/import";
import { createMetric } from "../metrics";
import { ensureExerciseCatalog } from "./catalog";

/**
 * Importing and exporting gym data: workout history from other apps (matched
 * onto the catalog by name, unknown names become custom exercises so nothing is
 * dropped), body weight, shareable plan files and the full gym backup. Every
 * import is idempotent — re-running a file adds nothing new. The parsers in
 * importers/ run in the browser; this layer only sees their normalized output.
 * See docs/prd/health/gym.md.
 */

export interface ImportWorkoutsResult {
  created: number;
  /** Already imported (same `ref`), left untouched. */
  skipped: number;
  exercisesCreated: number;
  /** Distinct source names mapped to an existing exercise. */
  matched: Array<{ from: string; to: string }>;
  /** Names with no confident match — each became a custom exercise. */
  unmatched: string[];
}

export interface ImportWeighInsResult {
  created: number;
  skipped: number;
}

export interface ImportPlanResult {
  routinesCreated: number;
  exercisesCreated: number;
}

export interface ImportBackupResult {
  exercisesCreated: number;
  routinesCreated: number;
  routinesSkipped: number;
  workouts: ImportWorkoutsResult;
  weighIns: ImportWeighInsResult;
  measurementsCreated: number;
  readinessCreated: number;
  settingsApplied: boolean;
}

const WEIGH_IN_TOLERANCE_KG = 0.05;

/* ---------------------------------------------------------------- helpers */

const lower = (s: string) => s.trim().toLowerCase();

/** reps → weight × reps; distance → cardio; a held duration with no reps → time. */
export function inferMode(sets: readonly ImportedSet[]): ExerciseMode {
  if (sets.some((s) => (s.distanceKm ?? 0) > 0)) return "cardio";
  if (sets.length > 0 && sets.every((s) => !s.reps && (s.durationSec ?? 0) > 0)) return "time";
  return "reps";
}

/** The exercise list (catalog + custom) with lookups, extended as exercises are created. */
class ExerciseIndex {
  readonly rows: ImportExerciseRow[];
  private readonly byId = new Map<number, ImportExerciseRow>();
  private readonly byKey = new Map<string, ImportExerciseRow>();
  private readonly byName = new Map<string, ImportExerciseRow>();
  /** Stable array handed to the matcher (it caches preparation per array). */
  readonly candidates: Array<{ id: number; name: string; equipment: string }> = [];
  created = 0;

  constructor() {
    ensureExerciseCatalog();
    this.rows = listActiveExercises();
    for (const row of this.rows) this.register(row);
  }

  private register(row: ImportExerciseRow): void {
    this.byId.set(row.id, row);
    if (row.catalogKey) this.byKey.set(row.catalogKey, row);
    const name = lower(row.name);
    const known = this.byName.get(name);
    if (!known || (row.isCustom && !known.isCustom)) this.byName.set(name, row);
    this.candidates.push({ id: row.id, name: row.name, equipment: row.equipment });
  }

  get(id: number): ImportExerciseRow | undefined {
    return this.byId.get(id);
  }

  add(values: Parameters<typeof insertExercise>[0]): ImportExerciseRow {
    const id = insertExercise(values);
    const row: ImportExerciseRow = {
      id,
      name: values.name,
      equipment: values.equipment,
      bodyPart: values.bodyPart,
      target: values.target,
      secondaryMuscles: values.secondaryMuscles ?? [],
      catalogKey: values.catalogKey ?? null,
      defaultMode: values.defaultMode ?? "reps",
      isCustom: values.isCustom ?? false,
      isBodyweight: values.isBodyweight ?? false,
      isUnilateral: values.isUnilateral ?? false,
    };
    this.register(row);
    this.created++;
    return row;
  }

  /** Exercise for a plan-file / backup exercise: by catalog key, then name, else a new custom one. */
  resolvePlanExercise(ex: PlanFileExercise): ImportExerciseRow {
    const hit =
      (ex.catalogKey ? this.byKey.get(ex.catalogKey) : undefined) ??
      this.byName.get(lower(ex.name));
    if (hit) return hit;
    return this.add({
      name: ex.name,
      bodyPart: ex.bodyPart,
      equipment: ex.equipment,
      target: ex.target,
      secondaryMuscles: ex.secondaryMuscles,
      defaultMode: ex.defaultMode,
      isBodyweight: ex.isBodyweight,
      isUnilateral: ex.isUnilateral,
      isCustom: true,
    });
  }

  /** Exercise for a foreign name: confident match, else a custom exercise guessed from the name. */
  resolveForeignName(
    name: string,
    sets: readonly ImportedSet[],
  ): { row: ImportExerciseRow; matched: boolean } {
    const match = matchExercise(name, this.candidates);
    const matchedRow = match ? this.byId.get(match.id) : undefined;
    if (matchedRow) return { row: matchedRow, matched: true };
    const mode = inferMode(sets);
    const traits = guessExerciseTraits(name);
    const row = this.add({
      name: name.trim(),
      bodyPart: mode === "cardio" ? "cardio" : traits.bodyPart,
      equipment: traits.equipment,
      target: traits.target,
      defaultMode: mode,
      isBodyweight: mode === "reps" && sets.every((s) => s.weightKg === null),
      isCustom: true,
    });
    return { row, matched: false };
  }
}

/* --------------------------------------------------------------- workouts */

export function importWorkouts(
  workouts: readonly ImportedWorkout[],
  source: ImportSource,
): ImportWorkoutsResult {
  const existing = findExistingImportRefs(workouts.map((w) => w.ref));
  return inTransaction(() => {
    const index = new ExerciseIndex();
    const seen = new Set(existing);
    const matched = new Map<string, string>();
    const unmatched = new Set<string>();
    const resolved = new Map<string, ImportExerciseRow>();
    let created = 0;
    let skipped = 0;

    for (const workout of workouts) {
      if (seen.has(workout.ref)) {
        skipped++;
        continue;
      }
      seen.add(workout.ref);

      const setCount = workout.exercises.reduce((n, e) => n + e.sets.length, 0);
      const tree: WorkoutTree = {
        workout: {
          date: workout.date,
          startedAt: workout.startedAt,
          // No end time in the file: a minute per set is a fair stand-in.
          finishedAt:
            workout.finishedAt ?? addSecondsLocal(workout.startedAt, Math.max(1, setCount) * 60),
          name: workout.name.trim() || "Imported workout",
          notes: workout.notes,
          source: "import",
          importSource: source,
          importRef: workout.ref,
        },
        entries: [],
      };

      workout.exercises.forEach((exercise, position) => {
        const cacheKey = lower(exercise.name);
        let row = resolved.get(cacheKey);
        if (!row) {
          const result = index.resolveForeignName(exercise.name, exercise.sets);
          row = result.row;
          resolved.set(cacheKey, row);
          if (result.matched) matched.set(exercise.name.trim(), row.name);
          else unmatched.add(exercise.name.trim());
        }
        const mode = inferMode(exercise.sets);
        tree.entries.push({
          entry: {
            exerciseId: row.id,
            position,
            mode,
            isBodyweight: row.isBodyweight,
            notes: exercise.notes,
          },
          sets: exercise.sets.map((s, i) => ({
            position: i,
            kind: s.kind as SetKind,
            weightKg: s.weightKg,
            reps: s.reps,
            durationSec: s.durationSec,
            distanceKm: s.distanceKm,
            rpe: s.rpe,
            rir: s.rir,
            completed: true,
            completedAt: workout.startedAt,
          })),
        });
      });

      insertWorkoutTree(tree);
      created++;
    }

    return {
      created,
      skipped,
      exercisesCreated: index.created,
      matched: [...matched].map(([from, to]) => ({ from, to })),
      unmatched: [...unmatched],
    };
  });
}

/* --------------------------------------------------------------- weigh-ins */

/** Adds body weights as `health_metrics` rows, skipping a date that already has ~the same weight. */
export function importWeighIns(weighIns: readonly ImportedWeighIn[]): ImportWeighInsResult {
  const byDate = new Map<string, number[]>();
  for (const e of listWeightEntries()) {
    const list = byDate.get(e.date) ?? [];
    list.push(e.value);
    byDate.set(e.date, list);
  }
  return inTransaction(() => {
    let created = 0;
    let skipped = 0;
    for (const w of weighIns) {
      const values = byDate.get(w.date) ?? [];
      if (values.some((v) => Math.abs(v - w.weightKg) <= WEIGH_IN_TOLERANCE_KG)) {
        skipped++;
        continue;
      }
      createMetric({
        type: "weight",
        date: w.date,
        label: "Weight",
        value: w.weightKg,
        unit: "kg",
      });
      values.push(w.weightKg);
      byDate.set(w.date, values);
      created++;
    }
    return { created, skipped };
  });
}

/* ------------------------------------------------------------------ plans */

function toPlanExercise(row: {
  catalogKey: string | null;
  name: string;
  bodyPart: string;
  equipment: string;
  target: string;
  secondaryMuscles: string[];
  defaultMode: ExerciseMode;
  isBodyweight: boolean;
  isUnilateral: boolean;
}): PlanFileExercise {
  return {
    catalogKey: row.catalogKey,
    name: row.name,
    bodyPart: row.bodyPart,
    equipment: row.equipment,
    target: row.target,
    secondaryMuscles: row.secondaryMuscles,
    defaultMode: row.defaultMode,
    isBodyweight: row.isBodyweight,
    isUnilateral: row.isUnilateral,
  };
}

function readRoutines(routineIds?: readonly number[]) {
  const { routines, entries } = listRoutinesForExport(routineIds);
  const week = listWeekSchedule();
  const indexById = new Map(routines.map((r, i) => [r.id, i]));
  const weekMap: PlanFileV1["week"] = {};
  for (let d = 0; d < 7; d++) {
    const row = week.find((w) => w.weekday === d);
    weekMap[String(d)] = row?.routineId != null ? (indexById.get(row.routineId) ?? null) : null;
  }
  return {
    routines: routines.map((r) => ({
      name: r.name,
      notes: r.notes,
      progressionPolicy: r.progressionPolicy,
      entries: entries
        .filter((e) => e.entry.routineId === r.id)
        .map(({ entry, exercise }): PlanFileEntry => ({
          exercise: toPlanExercise(exercise),
          mode: entry.mode,
          sets: entry.sets,
          reps: entry.reps,
          repsMin: entry.repsMin,
          weightKg: entry.weightKg,
          durationSec: entry.durationSec,
          distanceKm: entry.distanceKm,
          restSec: entry.restSec,
          supersetGroup: entry.supersetGroup,
          perSide: entry.perSide,
          isBodyweight: entry.isBodyweight,
          progressionPolicy: entry.progressionPolicy,
          incrementKg: entry.incrementKg,
          targetRpe: entry.targetRpe,
          scheme: entry.scheme,
          notes: entry.notes,
        })),
    })),
    week: weekMap,
  };
}

/** Non-archived routines (or just `routineIds`) plus the weekly schedule, as a shareable file. */
export function exportPlanFile(routineIds?: number[]): PlanFileV1 {
  const { routines, week } = readRoutines(routineIds);
  return {
    format: PLAN_FILE_FORMAT,
    version: 1,
    exportedAt: new Date().toISOString(),
    routines,
    week,
  };
}

interface RoutinesImport {
  routinesCreated: number;
  routinesSkipped: number;
  exercisesCreated: number;
}

/**
 * Merges routines + week into the database. `onClash` decides what a routine
 * whose name already exists does: "rename" adds it as "<name> (imported)",
 * "skip" (backups — re-import must not duplicate) keeps the existing one.
 * Week assignments only fill weekdays that are currently empty.
 */
function mergeRoutines(
  routines: PlanFileV1["routines"],
  week: PlanFileV1["week"],
  onClash: "rename" | "skip",
  index: ExerciseIndex,
): RoutinesImport {
  const names = new Map(listRoutineNames().map((r) => [lower(r.name), r.id]));
  const idByIndex = new Map<number, number>();
  let routinesCreated = 0;
  let routinesSkipped = 0;

  routines.forEach((routine, i) => {
    let name = routine.name;
    const clash = names.get(lower(name));
    if (clash !== undefined) {
      if (onClash === "skip") {
        idByIndex.set(i, clash);
        routinesSkipped++;
        return;
      }
      name = `${routine.name} (imported)`;
      for (let n = 2; names.has(lower(name)); n++) name = `${routine.name} (imported ${n})`;
    }
    const id = insertRoutineTree(
      { name, notes: routine.notes, progressionPolicy: routine.progressionPolicy },
      routine.entries.map((entry, position) => {
        const exercise = index.resolvePlanExercise(entry.exercise);
        return {
          exerciseId: exercise.id,
          position,
          mode: entry.mode,
          sets: entry.sets,
          reps: entry.reps,
          repsMin: entry.repsMin,
          weightKg: entry.weightKg,
          durationSec: entry.durationSec,
          distanceKm: entry.distanceKm,
          restSec: entry.restSec,
          supersetGroup: entry.supersetGroup,
          perSide: entry.perSide,
          isBodyweight: entry.isBodyweight,
          progressionPolicy: entry.progressionPolicy,
          incrementKg: entry.incrementKg,
          targetRpe: entry.targetRpe,
          scheme: entry.scheme,
          notes: entry.notes,
        };
      }),
    );
    names.set(lower(name), id);
    idByIndex.set(i, id);
    routinesCreated++;
  });

  for (const [weekday, routineIndex] of Object.entries(week)) {
    const routineId = routineIndex === null ? undefined : idByIndex.get(routineIndex);
    if (routineId !== undefined) setWeekdayIfEmpty(Number(weekday), routineId);
  }
  return { routinesCreated, routinesSkipped, exercisesCreated: index.created };
}

/** Merges a plan file: nothing is overwritten (clashing routine names get " (imported)"). */
export function importPlanFile(plan: PlanFileV1): ImportPlanResult {
  if (plan.format !== PLAN_FILE_FORMAT) throw new DomainError("This isn't a gym plan file.");
  return inTransaction(() => {
    const result = mergeRoutines(plan.routines, plan.week, "rename", new ExerciseIndex());
    return { routinesCreated: result.routinesCreated, exercisesCreated: result.exercisesCreated };
  });
}

/* ----------------------------------------------------------------- backup */

/** Everything gym-related except in-progress sessions, programs and training maxes. */
export function exportBackup(): GymBackupV1 {
  ensureExerciseCatalog();
  const { routines, week } = readRoutines();
  const { workouts, entries, sets } = listWorkoutsForExport();

  const setsByEntry = new Map<number, ImportedSet[]>();
  for (const s of sets) {
    const list = setsByEntry.get(s.workoutExerciseId) ?? [];
    list.push({
      kind: s.kind,
      weightKg: s.weightKg,
      reps: s.reps,
      durationSec: s.durationSec,
      distanceKm: s.distanceKm,
      rpe: s.rpe,
      rir: s.rir,
    });
    setsByEntry.set(s.workoutExerciseId, list);
  }
  const entriesByWorkout = new Map<number, ImportedWorkout["exercises"]>();
  for (const e of entries) {
    const list = entriesByWorkout.get(e.workoutId) ?? [];
    list.push({ name: e.name, notes: e.notes, sets: setsByEntry.get(e.id) ?? [] });
    entriesByWorkout.set(e.workoutId, list);
  }
  const refs = new Set<string>();
  const exportedWorkouts = workouts.map((w): ImportedWorkout => {
    let ref = w.importRef ?? `backup:${w.startedAt}:${w.name}`;
    if (refs.has(ref)) ref = `${ref}#${w.id}`;
    refs.add(ref);
    return {
      ref,
      date: w.date,
      startedAt: w.startedAt,
      finishedAt: w.finishedAt,
      name: w.name,
      notes: w.notes,
      exercises: (entriesByWorkout.get(w.id) ?? []).filter((e) => e.sets.length > 0),
    };
  });

  const settings = getSettingsRow();
  return {
    format: BACKUP_FORMAT,
    version: 1,
    exportedAt: new Date().toISOString(),
    customExercises: listActiveExercises()
      .filter((e) => e.isCustom)
      .map(toPlanExercise),
    routines,
    week,
    workouts: exportedWorkouts,
    weighIns: listWeightEntries().map((e) => ({ date: e.date, weightKg: e.value })),
    measurements: listMeasurements().map((m) => ({
      date: m.date,
      site: m.site,
      value: m.value,
      note: m.note,
    })),
    readiness: listReadiness().map((r) => ({
      date: r.date,
      sleepQuality: r.sleepQuality,
      energy: r.energy,
      soreness: r.soreness,
      stress: r.stress,
      motivation: r.motivation,
      note: r.note,
    })),
    settings: settings
      ? {
          sex: settings.sex,
          heightCm: settings.heightCm,
          goalWeightKg: settings.goalWeightKg,
          effortScale: settings.effortScale,
          defaultRestSec: settings.defaultRestSec,
          e1rmFormula: settings.e1rmFormula,
          barWeightKg: settings.barWeightKg,
          platesKg: settings.platesKg,
          ownedEquipment: settings.ownedEquipment,
          weeklySessionGoal: settings.weeklySessionGoal,
          sleepTargetHours: settings.sleepTargetHours,
          askBodyweightOnStart: settings.askBodyweightOnStart,
          keepAwake: settings.keepAwake,
          restSound: settings.restSound,
          restNotifications: settings.restNotifications,
        }
      : null,
  };
}

/**
 * Merges a backup. Idempotent: exercises by name, routines by name (an existing
 * routine is kept, never renamed), workouts by `ref`, weigh-ins by date + value,
 * measurements by date + site, readiness by date; settings only when none exist.
 * Large backups should be sent in pieces (`splitBackup` in importers/backup.ts).
 */
export function importBackup(backup: GymBackupV1): ImportBackupResult {
  if (backup.format !== BACKUP_FORMAT) throw new DomainError("This isn't a gym backup.");
  const structural = inTransaction(() => {
    const index = new ExerciseIndex();
    for (const ex of backup.customExercises) index.resolvePlanExercise(ex);
    const routines = mergeRoutines(backup.routines, backup.week, "skip", index);

    const haveMeasurement = new Set(listMeasurements().map((m) => `${m.date}|${m.site}`));
    let measurementsCreated = 0;
    for (const m of backup.measurements) {
      const key = `${m.date}|${m.site}`;
      if (haveMeasurement.has(key)) continue;
      haveMeasurement.add(key);
      insertMeasurement({ date: m.date, site: m.site, value: m.value, note: m.note });
      measurementsCreated++;
    }
    let readinessCreated = 0;
    for (const r of backup.readiness) {
      if (insertReadinessIfMissing(r)) readinessCreated++;
    }
    let settingsApplied = false;
    if (backup.settings) settingsApplied = insertSettingsIfMissing({ id: 1, ...backup.settings });
    return { routines, measurementsCreated, readinessCreated, settingsApplied };
  });
  const workouts = importWorkouts(backup.workouts, "backup");
  const weighIns = importWeighIns(backup.weighIns);
  return {
    exercisesCreated: structural.routines.exercisesCreated + workouts.exercisesCreated,
    routinesCreated: structural.routines.routinesCreated,
    routinesSkipped: structural.routines.routinesSkipped,
    workouts,
    weighIns,
    measurementsCreated: structural.measurementsCreated,
    readinessCreated: structural.readinessCreated,
    settingsApplied: structural.settingsApplied,
  };
}
