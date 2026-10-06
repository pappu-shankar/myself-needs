import { addDays, daysBetween, parseIsoDate, todayIso } from "@/lib/dates";
import { MUSCLES, type Muscle, type WeightUnit } from "../../../gym-types";
import type { ExercisePlan, WorkoutRecord } from "../../../engine/types";
import { sessionsInWeek, weekStartOf } from "../../../engine/calendar";
import { judgeHistory, stallCount } from "../../../engine/progression";
import { e1rmSeries } from "../../../engine/e1rm";
import {
  hardSetsByMuscle,
  landmarksWith,
  muscleVolumes,
  balance,
  weeklyTonnage,
} from "../../../engine/volume";
import { weightTrend } from "../../../engine/body-composition";
import { getGymSettings } from "../settings";
import { listRoutines, getRoutine, type RoutineEntry } from "../routines";
import { getPlannedRoutineForDate } from "../schedule";
import { getActiveWorkout, listWorkoutDates } from "../workouts";
import { getRecentSessionsByExercise, getWorkoutRecords } from "../history";
import { getBodyweightSeries } from "../vitals";
import { getLandmarkOverrides } from "../landmarks";
import { getReadiness, getRecentRecords, loadContext } from "../analytics";
import type { GymSnapshot } from "./types";

/** Look this far back for training history; enough for 28-day chronic load and 6-week plateaus. */
const LOOKBACK_DAYS = 90;
const NEGLECT_WINDOW_DAYS = 60;
const PLATEAU_WEEKS = 6;
const PLATEAU_MIN_SESSIONS = 4;
/** A week below this share of the trailing 4-week tonnage counts as a lighter (deload) week. */
const LIGHT_WEEK_SHARE = 0.6;

function localDateTimeMs(value: string): number {
  const [date, time = "00:00:00"] = value.split("T");
  const d = parseIsoDate(date);
  const [h, m, s] = time.split(":").map(Number);
  d.setHours(h || 0, m || 0, s || 0, 0);
  return d.getTime();
}

function toPlan(entry: RoutineEntry, weightUnit: WeightUnit): ExercisePlan {
  return {
    weightUnit,
    exerciseId: entry.exerciseId,
    bodyPart: entry.exercise.bodyPart,
    mode: entry.mode,
    sets: entry.sets,
    reps: entry.reps,
    repsMin: entry.repsMin,
    weightKg: entry.weightKg,
    durationSec: entry.durationSec,
    distanceKm: entry.distanceKm,
    perSide: entry.perSide,
    isBodyweight: entry.isBodyweight,
    policy: entry.effectivePolicy,
    incrementKg: entry.incrementKg,
    targetRpe: entry.targetRpe,
    scheme: entry.scheme,
  };
}

/** Each exercise's first standard entry across live routines — what its progression is judged by. */
function plansByExercise(
  weightUnit: WeightUnit,
): Map<number, { plan: ExercisePlan; name: string }> {
  const plans = new Map<number, { plan: ExercisePlan; name: string }>();
  for (const summary of listRoutines()) {
    for (const entry of getRoutine(summary.id).entries) {
      if (entry.scheme !== "standard" || plans.has(entry.exerciseId)) continue;
      plans.set(entry.exerciseId, {
        plan: toPlan(entry, weightUnit),
        name: entry.exercise.name,
      });
    }
  }
  return plans;
}

function trainedExercises(records: readonly WorkoutRecord[], from: string) {
  const out = new Map<number, string>();
  for (const w of records) {
    if (w.date < from) continue;
    for (const e of w.entries) {
      if (e.sets.some((s) => s.completed && s.kind !== "warmup"))
        out.set(e.exerciseId, e.exerciseName);
    }
  }
  return out;
}

function lastTrainedByMuscle(records: readonly WorkoutRecord[]): Map<Muscle, string> {
  const last = new Map<Muscle, string>();
  for (const w of records) {
    for (const e of w.entries) {
      if (e.mode === "cardio" || !e.sets.some((s) => s.completed && s.kind !== "warmup")) continue;
      for (const muscle of Object.keys(e.muscles) as Muscle[]) {
        const prev = last.get(muscle);
        if (!prev || w.date > prev) last.set(muscle, w.date);
      }
    }
  }
  return last;
}

/** Consecutive training weeks (counting back from last week) with no lighter week among them. */
function consecutiveHardWeeks(records: readonly WorkoutRecord[], today: string): number {
  const weeks = new Map(weeklyTonnage(records).map((w) => [w.weekStart, w.tonnageKg]));
  const thisWeek = weekStartOf(today);
  let count = 0;
  for (let i = 1; i <= 12; i++) {
    const start = addDays(thisWeek, -7 * i);
    const tonnage = weeks.get(start) ?? 0;
    if (tonnage <= 0) break;
    const trailing = [1, 2, 3, 4].map((k) => weeks.get(addDays(start, -7 * k)) ?? 0);
    const trained = trailing.filter((t) => t > 0);
    const average = trained.length ? trained.reduce((a, b) => a + b, 0) / trained.length : 0;
    if (average > 0 && tonnage < average * LIGHT_WEEK_SHARE) break;
    count++;
  }
  return count;
}

export function buildGymSnapshot(today: string = todayIso()): GymSnapshot {
  const settings = getGymSettings();
  const records = getWorkoutRecords({ from: addDays(today, -LOOKBACK_DAYS), to: today });
  const dates = listWorkoutDates(addDays(today, -27), today);
  const weekStart = weekStartOf(today);

  // Progression: stalls (routine exercises) and e1RM plateaus.
  const recent = trainedExercises(records, addDays(today, -28));
  const plans = plansByExercise(settings.weightUnit);
  const histories = getRecentSessionsByExercise([...recent.keys()], 30);
  const stalls: GymSnapshot["stalls"] = [];
  const plateaus: GymSnapshot["plateaus"] = [];
  const plateauFrom = addDays(today, -7 * PLATEAU_WEEKS);
  for (const [exerciseId, name] of recent) {
    const history = histories.get(exerciseId) ?? [];
    const planned = plans.get(exerciseId);
    if (planned && planned.plan.policy !== "off") {
      const count = stallCount(judgeHistory(planned.plan, history));
      if (count > 0)
        stalls.push({ exerciseId, name, stallCount: count, policy: planned.plan.policy });
    }
    const series = e1rmSeries(history, settings.e1rmFormula);
    const inWindow = series.filter((p) => p.date >= plateauFrom);
    const before = series.filter((p) => p.date < plateauFrom);
    if (inWindow.length >= PLATEAU_MIN_SESSIONS && before.length > 0) {
      const bestBefore = Math.max(...before.map((p) => p.e1rmKg));
      const bestNow = Math.max(...inWindow.map((p) => p.e1rmKg));
      if (bestNow <= bestBefore) {
        const bestPoint = before.reduce((a, b) => (b.e1rmKg >= a.e1rmKg ? b : a));
        plateaus.push({
          exerciseId,
          name,
          weeks: Math.floor(daysBetween(bestPoint.date, today) / 7),
          bestE1rmKg: bestBefore,
        });
      }
    }
  }

  // Muscles and volume.
  const neglectFrom = addDays(today, -NEGLECT_WINDOW_DAYS);
  const lastTrained = lastTrainedByMuscle(records.filter((r) => r.date >= neglectFrom));
  const neglected = MUSCLES.flatMap((muscle) => {
    const last = lastTrained.get(muscle);
    return last ? [{ muscle, daysSince: daysBetween(last, today) }] : [];
  });
  const monthSets = hardSetsByMuscle(records, addDays(today, -27), today);
  const landmarks = landmarksWith(getLandmarkOverrides());

  // Plan adherence.
  const planned = getPlannedRoutineForDate(today);
  const yesterday = addDays(today, -1);
  const plannedYesterday = getPlannedRoutineForDate(yesterday);
  const loggedOn = (date: string) => dates.includes(date);

  // Weight.
  const weights = getBodyweightSeries(addDays(today, -60));
  const trend = weightTrend(
    weights.map((p) => ({ date: p.date, value: p.weightKg })),
    28,
    today,
  );

  const active = getActiveWorkout();
  const load = loadContext(records, today);

  return {
    today,
    weightUnit: settings.weightUnit,
    weeklySessionGoal: settings.weeklySessionGoal,
    sessionsThisWeek: sessionsInWeek(dates, today),
    sessionsLast28Days: dates.length,
    daysLeftInWeek: 7 - daysBetween(weekStart, today),
    stalls,
    plateaus,
    neglected,
    weekVolumes: muscleVolumes(hardSetsByMuscle(records, addDays(today, -6), today), landmarks),
    trainedRecently: MUSCLES.filter((m) => (monthSets[m] ?? 0) > 0),
    balance: balance(monthSets),
    acwr: { ratio: load.today.ratio, zone: load.zone },
    consecutiveHardWeeks: consecutiveHardWeeks(records, today),
    readiness: getReadiness(today, records),
    plannedToday:
      planned.routineId !== null && planned.routineName !== null
        ? { routineId: planned.routineId, routineName: planned.routineName }
        : null,
    loggedToday: loggedOn(today),
    missedYesterday:
      plannedYesterday.routineId !== null &&
      plannedYesterday.routineName !== null &&
      !loggedOn(yesterday)
        ? { routineId: plannedYesterday.routineId, routineName: plannedYesterday.routineName }
        : null,
    weight: {
      goalKg: settings.goalWeightKg,
      currentKg: weights[weights.length - 1]?.weightKg ?? null,
      perWeekKg: trend?.perWeekKg ?? null,
      perWeekPct: trend?.perWeekPct ?? null,
    },
    recentPrs: getRecentRecords(today, 7, records).map((r) => ({
      exerciseId: r.exerciseId,
      name: r.exerciseName,
      type: r.type,
      context: r.context,
      date: r.date,
    })),
    activeWorkout: active
      ? {
          id: active.id,
          name: active.name,
          hoursOpen: Math.max(0, (Date.now() - localDateTimeMs(active.startedAt)) / 3_600_000),
        }
      : null,
  };
}
