import { addDays, daysBetween, todayIso } from "@/lib/dates";
import type { Muscle, MeasurementSite } from "../../gym-types";
import type {
  ExerciseSession,
  PersonalRecord,
  ReadinessResult,
  SetRecord,
  StrengthStandard,
  WorkoutRecord,
} from "../../engine/types";
import {
  activityHeatmap,
  longestStreakWeeks,
  streakWeeks,
  weekStartOf,
} from "../../engine/calendar";
import { effortHistogram, effortSummary, weeklyEffort } from "../../engine/effort";
import {
  balance,
  hardSetsByMuscle,
  landmarksWith,
  muscleVolumes,
  weeklyTonnage,
} from "../../engine/volume";
import { acwr, acwrZone, dailyLoads, type Acwr, type AcwrZone } from "../../engine/load";
import { readinessScore } from "../../engine/readiness";
import { bodyComposition, goalProgress, weightTrend } from "../../engine/body-composition";
import {
  dotsScore,
  LIFT_CATALOG_KEYS,
  LIFTS,
  strengthStandard,
  type Lift,
} from "../../engine/strength";
import { bestE1rm, e1rmSeries, repMaxTable } from "../../engine/e1rm";
import { suggestTrainingMax } from "../../engine/wendler";
import { newRecords, personalRecords } from "../../engine/records";
import {
  muscleLevels,
  muscleLoad,
  musclesOf,
  rankMuscles,
  type MuscleLevel,
} from "../../engine/muscles";
import { tonnageOf } from "../../engine/volume";
import { workoutMinutes } from "../../engine/calendar";
import {
  countWorkSetsByExercise,
  listExercisesByCatalogKeys,
  trainingTotals,
} from "../../db/queries/gym/analytics";
import { getGymSettings } from "./settings";
import { getExercise } from "./exercises";
import { ensureExerciseCatalog } from "./catalog";
import {
  getExerciseHistory,
  getExerciseSessions,
  getRecentSessionsByExercise,
  getWorkoutRecords,
} from "./history";
import { getWorkout, listWorkoutDates, type WorkoutDetail } from "./workouts";
import {
  getBodyweightOn,
  getBodyweightSeries,
  getLatestBodyweight,
  getSleepHoursOn,
} from "./vitals";
import { getReadinessCheckin, type ReadinessCheckin } from "./readiness";
import { getLandmarkOverrides } from "./landmarks";
import { getMeasurementSeries, latestMeasurements } from "./measurements";
import { listTrainingMaxes } from "./training-maxes";

/**
 * Read-side composition for the gym pages: gathers rows from the data
 * services and runs them through the pure engine. Nothing here is stored —
 * see "Derived, never stored" in docs/prd/health/gym.md.
 */

const STREAK_LOOKBACK_DAYS = 730;
/** ACWR needs 28 days of chronic history before the window it reports on. */
const LOAD_SERIES_DAYS = 42;

// ---------------------------------------------------------------------------
// Shared helpers

export function setRecordOf(set: {
  kind: SetRecord["kind"];
  weightKg: number | null;
  reps: number | null;
  durationSec: number | null;
  distanceKm: number | null;
  rir: number | null;
  rpe: number | null;
  completed: boolean;
}): SetRecord {
  return {
    kind: set.kind,
    weightKg: set.weightKg,
    reps: set.reps,
    durationSec: set.durationSec,
    distanceKm: set.distanceKm,
    rir: set.rir,
    rpe: set.rpe,
    completed: set.completed,
  };
}

/** A live/finished workout in the engine's analytics shape. */
export function workoutRecordOf(workout: WorkoutDetail): WorkoutRecord {
  return {
    id: workout.id,
    date: workout.date,
    startedAt: workout.startedAt,
    finishedAt: workout.finishedAt,
    sessionRpe: workout.sessionRpe,
    entries: workout.entries.map((entry) => ({
      exerciseId: entry.exerciseId,
      exerciseName: entry.exercise.name,
      mode: entry.mode,
      isBodyweight: entry.isBodyweight,
      muscles: musclesOf(entry.exercise),
      sets: entry.sets.map(setRecordOf),
    })),
  };
}

export interface LoadContext {
  /** Daily session-RPE load for the last LOAD_SERIES_DAYS days, with that day's ACWR. */
  series: Array<{ date: string; load: number; ratio: number | null }>;
  today: Acwr;
  zone: AcwrZone | null;
}

/** Training load and acute:chronic ratio, from records that reach 28 days before the series. */
export function loadContext(records: readonly WorkoutRecord[], today: string): LoadContext {
  const seriesFrom = addDays(today, -(LOAD_SERIES_DAYS - 1));
  const daily = dailyLoads(records, addDays(seriesFrom, -28), today);
  const series = daily
    .filter((d) => d.date >= seriesFrom)
    .map((d) => ({ date: d.date, load: d.load, ratio: acwr(daily, d.date).ratio }));
  const current = acwr(daily, today);
  return { series, today: current, zone: acwrZone(current.ratio) };
}

function recordsForLoad(today: string): WorkoutRecord[] {
  return getWorkoutRecords({ from: addDays(today, -(LOAD_SERIES_DAYS + 28)), to: today });
}

// ---------------------------------------------------------------------------
// Readiness

export interface ReadinessOverview extends ReadinessResult {
  date: string;
  sleepHours: number | null;
  sleepTargetHours: number;
  checkin: ReadinessCheckin | null;
  acwr: number | null;
}

/** Today's readiness: last night's sleep metric + the day's check-in + training load. */
export function getReadiness(
  date: string = todayIso(),
  records?: WorkoutRecord[],
): ReadinessOverview {
  const settings = getGymSettings();
  const sleepHours = getSleepHoursOn(date);
  const checkin = getReadinessCheckin(date);
  const load = loadContext(records ?? recordsForLoad(date), date);
  const result = readinessScore({
    sleepHours,
    sleepTargetHours: settings.sleepTargetHours,
    checkin: checkin
      ? {
          sleepQuality: checkin.sleepQuality,
          energy: checkin.energy,
          soreness: checkin.soreness,
          stress: checkin.stress,
          motivation: checkin.motivation,
        }
      : null,
    acwr: load.today.ratio,
  });
  return {
    ...result,
    date,
    sleepHours,
    sleepTargetHours: settings.sleepTargetHours,
    checkin,
    acwr: load.today.ratio,
  };
}

// ---------------------------------------------------------------------------
// Muscles

export interface MuscleMapData {
  load: Partial<Record<Muscle, number>>;
  levels: Record<Muscle, MuscleLevel>;
  worked: Muscle[];
  missed: Muscle[];
}

/**
 * Sets per muscle for a window (null `from` = all time), straight from SQL
 * counts. `hardOnly` counts only sets rated within 3 reps of failure — "where
 * did the hard work go", which can differ from where the sets went. Unrated
 * sets are left out of that view (rather than assumed hard, as the volume
 * landmarks do), or it would just repeat the all-sets map.
 */
export function getMuscleMap(
  from: string | null,
  to: string,
  { hardOnly = false }: { hardOnly?: boolean } = {},
): MuscleMapData {
  const load = muscleLoad(
    countWorkSetsByExercise(from, to, { hardOnly })
      .filter((row) => row.mode !== "cardio")
      .map((row) => ({ muscles: musclesOf(row), sets: row.sets })),
  );
  for (const muscle of Object.keys(load) as Muscle[]) {
    load[muscle] = Math.round((load[muscle] ?? 0) * 10) / 10;
  }
  return { load, levels: muscleLevels(load), ...rankMuscles(load) };
}

// ---------------------------------------------------------------------------
// Stats page

export const STATS_RANGES = ["week", "month", "quarter", "year", "all"] as const;
export type StatsRange = (typeof STATS_RANGES)[number];
const RANGE_DAYS: Record<Exclude<StatsRange, "all">, number> = {
  week: 7,
  month: 30,
  quarter: 90,
  year: 365,
};

export function rangeStart(range: StatsRange, today: string): string | null {
  return range === "all" ? null : addDays(today, -(RANGE_DAYS[range] - 1));
}

export function getGymStats(range: StatsRange = "month", today: string = todayIso()) {
  const from = rangeStart(range, today);
  const yearStart = addDays(weekStartOf(today), -7 * 52);
  // One read covers the heatmap year, trends, effort and the load window.
  const recordsFrom = from && from < yearStart ? from : yearStart;
  const records = getWorkoutRecords({ from: recordsFrom, to: today });
  const inRange = records.filter((r) => !from || r.date >= from);
  const dates = listWorkoutDates(addDays(today, -STREAK_LOOKBACK_DAYS), today);
  const landmarks = landmarksWith(getLandmarkOverrides());
  const weekSets = hardSetsByMuscle(records, addDays(today, -6), today);
  const monthSets = hardSetsByMuscle(records, addDays(today, -27), today);
  const sets = inRange.flatMap((r) => r.entries.flatMap((e) => e.sets));
  const recentWeeks = records.filter((r) => r.date >= addDays(weekStartOf(today), -7 * 25));

  return {
    range,
    from,
    to: today,
    totals: trainingTotals(from, today),
    heatmap: activityHeatmap(records, today),
    streak: { current: streakWeeks(dates, today), longest: longestStreakWeeks(dates) },
    muscles: getMuscleMap(from, today),
    hardMuscles: getMuscleMap(from, today, { hardOnly: true }),
    volume: muscleVolumes(weekSets, landmarks),
    balance: balance(monthSets),
    weeklyTonnage: weeklyTonnage(recentWeeks),
    effort: {
      summary: effortSummary(sets),
      histogram: effortHistogram(sets),
      weekly: weeklyEffort(recentWeeks),
    },
    load: loadContext(records, today),
  };
}
export type GymStats = ReturnType<typeof getGymStats>;

// ---------------------------------------------------------------------------
// Personal records

export interface RecentRecord extends PersonalRecord {
  exerciseName: string;
}

/**
 * PRs set in the last `days` days. Each session is compared only with the
 * sessions before it; an exercise's very first session isn't a "record".
 */
export function getRecentRecords(
  today: string = todayIso(),
  days = 7,
  records?: WorkoutRecord[],
): RecentRecord[] {
  const from = addDays(today, -(days - 1));
  const window = (records ?? getWorkoutRecords({ from, to: today })).filter((r) => r.date >= from);
  const exercises = new Map<
    number,
    { name: string; mode: WorkoutRecord["entries"][number]["mode"]; isBodyweight: boolean }
  >();
  for (const w of window) {
    for (const e of w.entries) {
      if (!exercises.has(e.exerciseId)) {
        exercises.set(e.exerciseId, {
          name: e.exerciseName,
          mode: e.mode,
          isBodyweight: e.isBodyweight,
        });
      }
    }
  }
  if (exercises.size === 0) return [];
  const { e1rmFormula, weightUnit } = getGymSettings();
  const histories = getRecentSessionsByExercise([...exercises.keys()], 200);
  const out: RecentRecord[] = [];
  for (const [exerciseId, info] of exercises) {
    const sessions = histories.get(exerciseId) ?? [];
    sessions.forEach((session, i) => {
      if (session.date < from || i === 0) return;
      const found = newRecords(exerciseId, sessions.slice(0, i), session, {
        formula: e1rmFormula,
        mode: info.mode,
        isBodyweight: info.isBodyweight,
        weightUnit,
      });
      for (const record of found) out.push({ ...record, exerciseName: info.name });
    });
  }
  return out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

// ---------------------------------------------------------------------------
// Exercise detail

export function getExerciseOverview(
  exerciseId: number,
  { historyLimit = 20, historyOffset = 0, today = todayIso() } = {},
) {
  ensureExerciseCatalog();
  const exercise = getExercise(exerciseId);
  const settings = getGymSettings();
  const sessions = getExerciseSessions(exerciseId, { limit: 300 });
  const lastMode = [...sessions].reverse().find((s) => s.target)?.target?.mode;
  const mode = lastMode ?? exercise.defaultMode;
  const options = {
    formula: settings.e1rmFormula,
    mode,
    isBodyweight: exercise.isBodyweight,
    weightUnit: settings.weightUnit,
  };
  const series = e1rmSeries(sessions, settings.e1rmFormula);
  const recentFrom = addDays(today, -90);
  const recent = series.filter((p) => p.date >= recentFrom);
  const best = (recent.length ? recent : series).reduce<(typeof series)[number] | null>(
    (top, p) => (top === null || p.e1rmKg > top.e1rmKg ? p : top),
    null,
  );
  return {
    exercise,
    muscles: musclesOf(exercise),
    mode,
    sessionCount: sessions.length,
    records: personalRecords(exerciseId, sessions, options),
    e1rmSeries: series,
    bestRecentE1rm: best,
    repMaxes: best ? repMaxTable(best.e1rmKg, settings.e1rmFormula) : [],
    history: getExerciseHistory(exerciseId, { limit: historyLimit, offset: historyOffset }),
    trainingMaxes: listTrainingMaxes(exerciseId, { limit: 10 }),
    formula: settings.e1rmFormula,
  };
}
export type ExerciseOverview = ReturnType<typeof getExerciseOverview>;

// ---------------------------------------------------------------------------
// Finish summary

export interface WorkoutSummaryEntry {
  entryId: number;
  exerciseId: number;
  exerciseName: string;
  setsCompleted: number;
  /** PRs this session set against everything logged before it. */
  records: PersonalRecord[];
  /** No earlier session of this exercise to compare against. */
  firstTime: boolean;
}

export function getWorkoutSummary(workoutId: number) {
  const workout = getWorkout(workoutId);
  const { e1rmFormula, weightUnit } = getGymSettings();
  const record = workoutRecordOf(workout);
  const entries: WorkoutSummaryEntry[] = workout.entries.map((entry) => {
    const history = getExerciseSessions(entry.exerciseId, {
      limit: 300,
      beforeWorkoutId: workout.id,
    });
    const session: ExerciseSession = {
      workoutId: workout.id,
      date: workout.date,
      target: entry.target,
      sets: entry.sets.map(setRecordOf),
    };
    const completed = entry.sets.filter((s) => s.completed && s.kind !== "warmup").length;
    return {
      entryId: entry.id,
      exerciseId: entry.exerciseId,
      exerciseName: entry.exercise.name,
      setsCompleted: completed,
      records:
        history.length > 0 && completed > 0
          ? newRecords(entry.exerciseId, history, session, {
              formula: e1rmFormula,
              mode: entry.mode,
              isBodyweight: entry.isBodyweight,
              weightUnit,
            })
          : [],
      firstTime: history.length === 0,
    };
  });
  const load = muscleLoad(
    record.entries
      .filter((e) => e.mode !== "cardio")
      .map((e) => ({
        muscles: e.muscles,
        sets: e.sets.filter((s) => s.completed && s.kind !== "warmup").length,
      })),
  );
  const allSets = record.entries.flatMap((e) => e.sets);
  return {
    workout,
    entries,
    recordCount: entries.reduce((n, e) => n + e.records.length, 0),
    tonnageKg: Math.round(tonnageOf(record)),
    setsCompleted: allSets.filter((s) => s.completed && s.kind !== "warmup").length,
    minutes: workoutMinutes(record),
    muscles: { load, levels: muscleLevels(load), ...rankMuscles(load) },
    effort: effortSummary(allSets),
  };
}
export type WorkoutSummary = ReturnType<typeof getWorkoutSummary>;

// ---------------------------------------------------------------------------
// Body page

const COMPOSITION_SITES = ["neck", "waist", "hips", "body_fat_pct"] as const;
/** Best e1RM within this window counts toward strength standards — older bests may not hold anymore. */
const STRENGTH_WINDOW_DAYS = 180;

function bestLiftE1rm(
  lift: Lift,
  sessions: ReadonlyMap<number, ExerciseSession[]>,
  ids: readonly number[],
  formula: ReturnType<typeof getGymSettings>["e1rmFormula"],
  from: string,
): number | null {
  let best: number | null = null;
  for (const id of ids) {
    for (const session of sessions.get(id) ?? []) {
      if (session.date < from) continue;
      // Pull-up standards include bodyweight: a bodyweight rep at 80 kg is an 80 kg rep.
      const bodyweight =
        lift === "pullup" ? (getBodyweightOn(session.date)?.weightKg ?? null) : null;
      const sets =
        bodyweight === null
          ? session.sets
          : session.sets.map((s) => ({ ...s, weightKg: bodyweight + (s.weightKg ?? 0) }));
      const estimate = bestE1rm(sets, formula);
      if (estimate && (best === null || estimate.e1rmKg > best)) best = estimate.e1rmKg;
    }
  }
  return best;
}

export function getBodyOverview(today: string = todayIso()) {
  const settings = getGymSettings();
  const weights = getBodyweightSeries(addDays(today, -730));
  const latest = getLatestBodyweight();
  const points = weights.map((p) => ({ date: p.date, value: p.weightKg }));
  const trend = weightTrend(points, 28, today);
  const startWindow = weights.filter((p) => p.date >= addDays(today, -90));
  const start = startWindow[0]?.weightKg ?? null;

  const latestSites = latestMeasurements();
  const measured: Partial<Record<(typeof COMPOSITION_SITES)[number], number>> = {};
  for (const site of COMPOSITION_SITES) {
    const value = latestSites[site]?.value;
    if (value !== undefined) measured[site] = value;
  }
  const composition = bodyComposition({
    sex: settings.sex,
    heightCm: settings.heightCm,
    weightKg: latest?.weightKg ?? null,
    measured,
  });
  const measurementSeries = (Object.keys(latestSites) as MeasurementSite[]).map((site) => ({
    site,
    points: getMeasurementSeries(site),
  }));

  // Strength standards from the canonical lifts' best recent e1RM.
  ensureExerciseCatalog();
  const allKeys = LIFTS.flatMap((lift) => LIFT_CATALOG_KEYS[lift]);
  const byKey = new Map(listExercisesByCatalogKeys(allKeys).map((e) => [e.catalogKey, e.id]));
  const idsByLift = new Map(
    LIFTS.map((lift) => [
      lift,
      LIFT_CATALOG_KEYS[lift]
        .map((k) => byKey.get(k))
        .filter((id): id is number => id !== undefined),
    ]),
  );
  const sessions = getRecentSessionsByExercise([...idsByLift.values()].flat(), 60);
  const from = addDays(today, -STRENGTH_WINDOW_DAYS);
  const bodyweight = latest?.weightKg ?? null;
  const e1rms = new Map(
    LIFTS.map((lift) => [
      lift,
      bestLiftE1rm(lift, sessions, idsByLift.get(lift) ?? [], settings.e1rmFormula, from),
    ]),
  );
  const standards: StrengthStandard[] | null = settings.sex
    ? LIFTS.map((lift) =>
        strengthStandard(lift, e1rms.get(lift) ?? null, bodyweight, settings.sex!),
      )
    : null;
  const squat = e1rms.get("squat");
  const bench = e1rms.get("bench");
  const deadlift = e1rms.get("deadlift");
  const total =
    squat && bench && deadlift ? Math.round((squat + bench + deadlift) * 10) / 10 : null;

  return {
    settings,
    weight: {
      latest,
      series: weights,
      goalKg: settings.goalWeightKg,
      trend,
      progress: goalProgress(start, latest?.weightKg ?? null, settings.goalWeightKg),
      startKg: start,
    },
    measurements: { latest: latestSites, series: measurementSeries },
    composition,
    strength: {
      standards,
      e1rms: Object.fromEntries(e1rms) as Record<Lift, number | null>,
      total,
      dots: total && bodyweight && settings.sex ? dotsScore(total, bodyweight, settings.sex) : null,
    },
  };
}
export type BodyOverview = ReturnType<typeof getBodyOverview>;

/** Whole days since a date, for "last trained 9 days ago". */
export function daysAgo(date: string, today: string = todayIso()): number {
  return daysBetween(date, today);
}

// ---------------------------------------------------------------------------
// Training max suggestion

/** Sessions looked at for a TM suggestion — recent strength, not a peak from years ago. */
const TM_SUGGESTION_SESSIONS = 10;

/** 90 % of the lift's best e1RM over its last few sessions (Wendler's TM rule), or null without history. */
export function getTrainingMaxSuggestion(
  exerciseId: number,
): { e1rmKg: number; tmKg: number } | null {
  const { e1rmFormula } = getGymSettings();
  let best = 0;
  for (const session of getExerciseSessions(exerciseId, { limit: TM_SUGGESTION_SESSIONS })) {
    best = Math.max(best, bestE1rm(session.sets, e1rmFormula)?.e1rmKg ?? 0);
  }
  return best > 0 ? { e1rmKg: best, tmKg: suggestTrainingMax(best, 2.5) } : null;
}
