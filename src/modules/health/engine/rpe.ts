import { addDays } from "@/lib/dates";
import type { E1rmFormula } from "../gym-types";
import { estimate1rm, isWorkSet, REP_CAP } from "./e1rm";
import { defaultIncrementKg, nextPrescription } from "./progression";
import type { ExercisePlan, ExerciseSession, Prescription, SetRecord } from "./types";
import { formatWeight, roundTo, snapToStep } from "./units";

/**
 * RPE-based loading: how heavy a set of N reps at a given RPE is, as a share
 * of 1RM, and the inverse (what a logged set says about e1RM).
 */

/** The chart's RPE columns, hardest first. */
export const RPE_STEPS = [10, 9.5, 9, 8.5, 8, 7.5, 7, 6.5] as const;

/**
 * % of 1RM for reps 1–12 (rows) × RPE_STEPS (columns) — Mike Tuchscherer's
 * Reactive Training Systems (RTS) RPE chart. Each half-point of RPE is worth
 * half a rep: every row is the previous one shifted two columns, so e.g.
 * 5 @ 8 = 4 @ 7 = 81.1 %.
 */
export const RTS_PERCENT_CHART: ReadonlyArray<readonly number[]> = [
  /*  1 */ [100, 97.8, 95.5, 93.9, 92.2, 90.7, 89.2, 87.8],
  /*  2 */ [95.5, 93.9, 92.2, 90.7, 89.2, 87.8, 86.3, 85.0],
  /*  3 */ [92.2, 90.7, 89.2, 87.8, 86.3, 85.0, 83.7, 82.4],
  /*  4 */ [89.2, 87.8, 86.3, 85.0, 83.7, 82.4, 81.1, 79.9],
  /*  5 */ [86.3, 85.0, 83.7, 82.4, 81.1, 79.9, 78.6, 77.4],
  /*  6 */ [83.7, 82.4, 81.1, 79.9, 78.6, 77.4, 76.2, 75.1],
  /*  7 */ [81.1, 79.9, 78.6, 77.4, 76.2, 75.1, 73.9, 72.3],
  /*  8 */ [78.6, 77.4, 76.2, 75.1, 73.9, 72.3, 70.7, 69.4],
  /*  9 */ [76.2, 75.1, 73.9, 72.3, 70.7, 69.4, 68.0, 66.7],
  /* 10 */ [73.9, 72.3, 70.7, 69.4, 68.0, 66.7, 65.3, 64.0],
  /* 11 */ [70.7, 69.4, 68.0, 66.7, 65.3, 64.0, 62.6, 61.3],
  /* 12 */ [68.0, 66.7, 65.3, 64.0, 62.6, 61.3, 59.9, 58.6],
];

/** Chart row for a rep count, or null outside 1–12 / for partial reps. */
function rowOf(reps: number): readonly number[] | null {
  return Number.isInteger(reps) && reps >= 1 && reps <= REP_CAP
    ? RTS_PERCENT_CHART[reps - 1]
    : null;
}

/** Chart column for an RPE snapped to the nearest half point, or null off the chart. */
function columnOf(rpe: number): number | null {
  if (!Number.isFinite(rpe)) return null;
  const column = (10 - Math.round(rpe * 2) / 2) * 2;
  return column >= 0 && column < RPE_STEPS.length ? column : null;
}

/** Share of 1RM (0.811, not 81.1) for `reps` at `rpe`; null off the chart. */
export function percentOf1rm(reps: number, rpe: number): number | null {
  const row = rowOf(reps);
  const column = columnOf(rpe);
  return row && column !== null ? roundTo(row[column] / 100, 4) : null;
}

/** Load for `reps` at `rpe` from an e1RM, snapped to `stepKg`. */
export function loadForRpe(
  e1rmKg: number,
  reps: number,
  rpe: number,
  stepKg: number,
): number | null {
  const pct = percentOf1rm(reps, rpe);
  if (pct === null || !Number.isFinite(e1rmKg) || e1rmKg <= 0) return null;
  return snapToStep(e1rmKg * pct, stepKg);
}

/**
 * The chart RPE nearest to what `weightKg × reps` was at this e1RM. Heavier
 * than RPE 10 predicts reads as 10 (the e1RM was simply low); lighter than
 * the chart's RPE 6.5 by more than half a step returns null — too easy to rate.
 */
export function rpeForSet(e1rmKg: number, weightKg: number, reps: number): number | null {
  const row = rowOf(reps);
  if (!row || !(e1rmKg > 0) || !(weightKg > 0)) return null;
  const pct = (weightKg / e1rmKg) * 100;
  const last = row.length - 1;
  if (pct < row[last] - (row[last - 1] - row[last]) / 2) return null;
  let nearest = 0;
  for (let column = 1; column < row.length; column++) {
    if (Math.abs(row[column] - pct) < Math.abs(row[nearest] - pct)) nearest = column;
  }
  return RPE_STEPS[nearest];
}

/** e1RM implied by a set and the RPE it was logged at, rounded to 0.1 kg. */
export function e1rmFromRpe(weightKg: number, reps: number, rpe: number): number | null {
  const pct = percentOf1rm(reps, rpe);
  if (pct === null || !Number.isFinite(weightKg) || weightKg <= 0) return null;
  return roundTo(weightKg / pct, 1);
}

/** The RPE a set was logged at: its RPE, else 10 − RIR (RPE 8 ≈ RIR 2), else null. */
export function effectiveRpe(set: Pick<SetRecord, "rpe" | "rir">): number | null {
  if (set.rpe !== null) return set.rpe;
  return set.rir !== null ? 10 - set.rir : null;
}

export interface AutoregOptions {
  /** ISO date the prescription is for. */
  today: string;
  formula: E1rmFormula;
  /** How far back an e1RM still counts — strength drifts, so six weeks by default. */
  lookbackDays?: number;
}

/**
 * Target-RPE autoregulation: load = best recent e1RM × chart %(plan.reps,
 * plan.targetRpe), snapped to the exercise's increment. A set logged with an
 * RPE/RIR estimates e1RM through the chart (it says how hard the set really
 * was); one without falls back to the e1RM formula. Plans without a target
 * RPE — or whose reps/RPE are off the chart — fall back to the progression
 * policy, so callers can route every standard entry through here.
 */
export function autoregulatedPrescription(
  plan: ExercisePlan,
  history: readonly ExerciseSession[],
  { today, formula, lookbackDays = 42 }: AutoregOptions,
): Prescription {
  const { targetRpe, reps } = plan;
  const pct = targetRpe !== null && reps !== null ? percentOf1rm(reps, targetRpe) : null;
  if (plan.mode !== "reps" || targetRpe === null || reps === null || pct === null) {
    return nextPrescription(plan, history);
  }

  const from = addDays(today, -lookbackDays);
  let best: number | null = null;
  for (const session of history) {
    const date = session.date.slice(0, 10);
    if (date < from || date > today) continue;
    for (const set of session.sets) {
      if (!isWorkSet(set) || set.weightKg === null || set.weightKg <= 0 || set.reps === null) {
        continue;
      }
      const rpe = effectiveRpe(set);
      const fromRpe = rpe !== null ? e1rmFromRpe(set.weightKg, set.reps, rpe) : null;
      const e1rm = fromRpe ?? estimate1rm(set.weightKg, set.reps, formula);
      if (e1rm !== null && (best === null || e1rm > best)) best = e1rm;
    }
  }

  if (best === null) {
    return {
      policy: plan.policy,
      kind: "first",
      reason: `No loaded sets in the last ${lookbackDays} days to estimate from — pick a load that feels like RPE ${targetRpe} for ${reps}.`,
    };
  }
  const step =
    plan.incrementKg && plan.incrementKg > 0
      ? plan.incrementKg
      : defaultIncrementKg(plan.bodyPart, plan.weightUnit);
  const weightKg = Math.max(step, snapToStep(best * pct, step));
  const rpe = Math.round(targetRpe * 2) / 2;
  return {
    policy: plan.policy,
    kind: "autoreg",
    weightKg,
    reps,
    reason: `Best recent e1RM ${formatWeight(best, plan.weightUnit)} → ${reps} reps @ RPE ${rpe} (${Math.round(pct * 100)} %) = ${formatWeight(weightKg, plan.weightUnit)}.`,
  };
}
