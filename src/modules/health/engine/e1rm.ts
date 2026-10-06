import type { E1rmFormula } from "../gym-types";
import type { E1rmEstimate, ExerciseSession, SetRecord } from "./types";
import { roundTo } from "./units";

/**
 * Estimated one-rep max from a submaximal set.
 *
 * Only sets with both a load and a rep count can produce an estimate, so timed
 * and cardio sets drop out on their own — there is no mode check to keep in
 * sync. All three formulas agree closely at low reps and diverge as reps rise,
 * which is why REP_CAP exists. Behavior follows openGym's onerm.js.
 */

/**
 * Above this many reps an estimate says more about work capacity than maximal
 * strength, and the formulas disagree by double digits. Refusing to guess beats
 * printing a fantasy (openGym's 12-rep cap).
 */
export const REP_CAP = 12;

/** e1RM as a multiple of the lifted weight, for reps ≥ 2. */
const MULTIPLIER: Record<E1rmFormula, (reps: number) => number> = {
  // Epley 1985: w · (1 + r/30)
  epley: (reps) => 1 + reps / 30,
  // Brzycki 1993: w · 36/(37 − r) — undefined at r ≥ 37, far above REP_CAP
  brzycki: (reps) => 36 / (37 - reps),
  // Lombardi 1989: w · r^0.10
  lombardi: (reps) => reps ** 0.1,
};

function validReps(reps: number): boolean {
  return Number.isFinite(reps) && reps >= 1 && reps <= REP_CAP;
}

/**
 * e1RM from one set, rounded to 0.1 kg. Null for anything it can't honestly
 * answer: non-finite input, no load, under one rep, or more than REP_CAP. A
 * single is not an estimate — it is the measurement — and comes back as is.
 */
export function estimate1rm(weightKg: number, reps: number, formula: E1rmFormula): number | null {
  if (!Number.isFinite(weightKg) || weightKg <= 0 || !validReps(reps)) return null;
  const r = Math.round(reps);
  if (r === 1) return roundTo(weightKg, 1);
  const estimate = weightKg * MULTIPLIER[formula](r);
  return Number.isFinite(estimate) && estimate > 0 ? roundTo(estimate, 1) : null;
}

/** Sets that say something about strength: performed, not a warm-up. */
export function isWorkSet(set: SetRecord): boolean {
  return set.completed && set.kind !== "warmup";
}

/**
 * Best estimate among one session's completed work sets, with the set it came
 * from — "142.5 kg est. from 100 × 10" is a very different claim from "from
 * 140 × 1". Ties keep the earlier set.
 */
export function bestE1rm(sets: readonly SetRecord[], formula: E1rmFormula): E1rmEstimate | null {
  let best: E1rmEstimate | null = null;
  for (const set of sets) {
    if (!isWorkSet(set) || set.weightKg === null || set.reps === null) continue;
    const e1rmKg = estimate1rm(set.weightKg, set.reps, formula);
    if (e1rmKg !== null && (best === null || e1rmKg > best.e1rmKg)) {
      best = { e1rmKg, weightKg: set.weightKg, reps: Math.round(set.reps) };
    }
  }
  return best;
}

export interface E1rmPoint extends E1rmEstimate {
  date: string;
  workoutId: number;
}

/** One point per session that produced an estimate, in input order — the trend chart. */
export function e1rmSeries(
  sessions: readonly ExerciseSession[],
  formula: E1rmFormula,
): E1rmPoint[] {
  const points: E1rmPoint[] = [];
  for (const session of sessions) {
    const best = bestE1rm(session.sets, formula);
    if (best) points.push({ date: session.date, workoutId: session.workoutId, ...best });
  }
  return points;
}

/**
 * The inverse: the load a lifter with this e1RM should manage for `reps`,
 * rounded to 0.1 kg (not snapped — callers snap to their plates). Null outside
 * 1..REP_CAP or without a positive e1RM.
 */
export function weightForReps(e1rmKg: number, reps: number, formula: E1rmFormula): number | null {
  if (!Number.isFinite(e1rmKg) || e1rmKg <= 0 || !validReps(reps)) return null;
  const r = Math.round(reps);
  if (r === 1) return roundTo(e1rmKg, 1);
  return roundTo(e1rmKg / MULTIPLIER[formula](r), 1);
}

/** Rep maxes for 1..REP_CAP from one e1RM — the 1RM calculator's table. */
export function repMaxTable(
  e1rmKg: number,
  formula: E1rmFormula,
): Array<{ reps: number; weightKg: number }> {
  const rows: Array<{ reps: number; weightKg: number }> = [];
  for (let reps = 1; reps <= REP_CAP; reps++) {
    const weightKg = weightForReps(e1rmKg, reps, formula);
    if (weightKg !== null) rows.push({ reps, weightKg });
  }
  return rows;
}
