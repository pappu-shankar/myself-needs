import { MUSCLES, type Muscle } from "../gym-types";
import { weekStartOf } from "./calendar";
import { isHardSet, isWorkingSet } from "./effort";
import type { MuscleVolume, VolumeLandmark, VolumeStatus, WorkoutRecord } from "./types";

/**
 * Weekly hard sets per muscle against volume landmarks, push/pull and
 * quad/hamstring balance, and tonnage.
 */

const lm = (mev: number, mavLow: number, mavHigh: number, mrv: number): VolumeLandmark => ({
  mev,
  mavLow,
  mavHigh,
  mrv,
});

/**
 * Weekly hard-set landmarks — MEV (minimum effective volume), MAV (maximum
 * adaptive volume, a range) and MRV (maximum recoverable volume) — from
 * Renaissance Periodization's published per-muscle guidelines (Israetel,
 * "Training Volume Landmarks for Muscle Growth", RP Strength). Deltoids use
 * RP's side/rear-delt figures, the part of the muscle that needs direct work;
 * upper-back uses RP's "back". Muscles RP doesn't list (obliques, lower back,
 * serratus, adductors, hip flexors, tibialis, forearms) get small, deliberately
 * conservative values: they mostly grow from indirect work in compound lifts.
 * Users can override any of these (health_volume_landmarks).
 */
export const DEFAULT_LANDMARKS: Record<Muscle, VolumeLandmark> = {
  trapezius: lm(0, 12, 20, 26),
  deltoids: lm(8, 16, 22, 26),
  chest: lm(8, 12, 20, 22),
  "upper-back": lm(10, 14, 22, 25),
  serratus: lm(0, 2, 6, 10),
  biceps: lm(8, 14, 20, 26),
  triceps: lm(6, 10, 14, 18),
  forearm: lm(0, 4, 10, 16),
  abs: lm(0, 16, 20, 25),
  obliques: lm(0, 4, 8, 12),
  "lower-back": lm(0, 3, 6, 10),
  gluteal: lm(0, 4, 12, 16),
  quadriceps: lm(8, 12, 18, 20),
  hamstring: lm(6, 10, 16, 20),
  adductors: lm(0, 4, 8, 12),
  "hip-flexors": lm(0, 2, 6, 10),
  calves: lm(8, 12, 16, 20),
  tibialis: lm(0, 2, 6, 10),
};

/** The defaults with the user's per-muscle overrides applied. */
export function landmarksWith(
  overrides: Partial<Record<Muscle, VolumeLandmark>>,
): Record<Muscle, VolumeLandmark> {
  const out = { ...DEFAULT_LANDMARKS };
  for (const muscle of MUSCLES) {
    const override = overrides[muscle];
    if (override) out[muscle] = override;
  }
  return out;
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Hard sets per muscle for workouts dated `from`–`to` (inclusive). Each hard
 * set (effort.ts isHardSet — unrated working sets count) credits every muscle
 * of its exercise by that muscle's weight: 1 for the primary mover, 0.5 for
 * supporting muscles ("fractional sets"). Cardio entries are skipped — a run
 * is not hypertrophy volume for the quads it lists. Rounded to 0.1.
 */
export function hardSetsByMuscle(
  workouts: readonly WorkoutRecord[],
  from: string,
  to: string,
): Partial<Record<Muscle, number>> {
  const sets: Partial<Record<Muscle, number>> = {};
  for (const w of workouts) {
    if (w.date < from || w.date > to) continue;
    for (const entry of w.entries) {
      if (entry.mode === "cardio") continue;
      const hard = entry.sets.filter(isHardSet).length;
      if (!hard) continue;
      for (const [muscle, weight] of Object.entries(entry.muscles) as [Muscle, number][]) {
        sets[muscle] = (sets[muscle] ?? 0) + weight * hard;
      }
    }
  }
  for (const muscle of Object.keys(sets) as Muscle[]) sets[muscle] = round1(sets[muscle] ?? 0);
  return sets;
}

/**
 * Where a week's hard sets sit against a landmark: 0 → none; < MEV →
 * below_mev; < MAV low → maintenance; ≤ MAV high → productive; ≤ MRV → high;
 * > MRV → above_mrv.
 */
export function volumeStatus(sets: number, landmark: VolumeLandmark): VolumeStatus {
  if (sets <= 0) return "none";
  if (sets < landmark.mev) return "below_mev";
  if (sets < landmark.mavLow) return "maintenance";
  if (sets <= landmark.mavHigh) return "productive";
  if (sets <= landmark.mrv) return "high";
  return "above_mrv";
}

/** Every body-map muscle (MUSCLES order) with its hard sets, landmark and status. */
export function muscleVolumes(
  hardSets: Partial<Record<Muscle, number>>,
  landmarks: Record<Muscle, VolumeLandmark>,
): MuscleVolume[] {
  return MUSCLES.map((muscle) => {
    const sets = hardSets[muscle] ?? 0;
    const landmark = landmarks[muscle];
    return { muscle, hardSets: sets, landmark, status: volumeStatus(sets, landmark) };
  });
}

export interface Balance {
  pushPull: { push: number; pull: number; ratio: number | null };
  quadHam: { quad: number; ham: number; ratio: number | null };
}

/**
 * Push:pull and quad:hamstring hard-set ratios (1 = even).
 * push = chest + triceps + ½ deltoids; pull = upper back + biceps + ½ traps —
 * shoulders and traps are split because both get worked by presses and pulls
 * alike. quad = quadriceps; ham = hamstring. A ratio is null when its
 * denominator is 0 (nothing to compare against, rather than "infinitely
 * unbalanced"). Sums round to 0.1, ratios to 0.01.
 */
export function balance(hardSets: Partial<Record<Muscle, number>>): Balance {
  const v = (m: Muscle) => hardSets[m] ?? 0;
  const push = v("chest") + v("triceps") + 0.5 * v("deltoids");
  const pull = v("upper-back") + v("biceps") + 0.5 * v("trapezius");
  const quad = v("quadriceps");
  const ham = v("hamstring");
  return {
    pushPull: {
      push: round1(push),
      pull: round1(pull),
      ratio: pull > 0 ? round2(push / pull) : null,
    },
    quadHam: { quad: round1(quad), ham: round1(ham), ratio: ham > 0 ? round2(quad / ham) : null },
  };
}

/**
 * Tonnage (volume load): Σ weight × reps over completed working sets, in kg,
 * rounded to 0.1. On bodyweight entries `weightKg` is the *added* load (a dip
 * belt), so an unloaded bodyweight set contributes 0 — the body itself isn't
 * counted, as in openGym's workoutVolume. Warm-ups are excluded.
 */
export function tonnageOf(workout: WorkoutRecord): number {
  let total = 0;
  for (const entry of workout.entries) {
    for (const set of entry.sets) {
      if (!isWorkingSet(set)) continue;
      total += (set.weightKg ?? 0) * (set.reps ?? 0);
    }
  }
  return round1(total);
}

export interface WeeklyTonnage {
  weekStart: string;
  tonnageKg: number;
  /** Completed working sets. */
  sets: number;
  sessions: number;
}

/** Tonnage, working sets and sessions per Monday–Sunday week, oldest first; weeks without a workout are absent. */
export function weeklyTonnage(workouts: readonly WorkoutRecord[]): WeeklyTonnage[] {
  const weeks = new Map<string, WeeklyTonnage>();
  for (const w of workouts) {
    const weekStart = weekStartOf(w.date);
    const week = weeks.get(weekStart) ?? { weekStart, tonnageKg: 0, sets: 0, sessions: 0 };
    week.tonnageKg += tonnageOf(w);
    week.sets += w.entries.reduce((n, e) => n + e.sets.filter(isWorkingSet).length, 0);
    week.sessions++;
    weeks.set(weekStart, week);
  }
  return [...weeks.values()]
    .map((week) => ({ ...week, tonnageKg: round1(week.tonnageKg) }))
    .sort((a, b) => a.weekStart.localeCompare(b.weekStart));
}
