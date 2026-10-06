import type { PlannedSet } from "./types";
import { snapToStep } from "./units";

/**
 * Warm-up ramp for a loaded working weight: a groove set with the empty bar,
 * then ~40 % × 5, 60 % × 3 and 80 % × 2 — the usual "fewer reps as it gets
 * heavier" pyramid, so the warm-up primes without tiring. Heavy triples and
 * singles (working reps ≤ 3) take only a single at 80 %.
 */

export interface WarmupInput {
  workingKg: number;
  workingReps: number;
  /** Empty bar; 0 for dumbbells/machines (no bar set then). */
  barKg: number;
  stepKg?: number;
  isBodyweight: boolean;
}

/** Reps for the empty-bar groove set. */
export const BAR_WARMUP_REPS = 10;

function warmup(weightKg: number, reps: number): PlannedSet {
  return { kind: "warmup", weightKg, reps, durationSec: null, distanceKm: null };
}

/**
 * Warm-up sets, lightest first, each snapped to `stepKg`, at least the bar and
 * strictly lighter than the working weight; a step that snaps onto the one
 * before it is dropped. Nothing for bodyweight work or when the working
 * weight is the bar itself.
 */
export function warmupSets({
  workingKg,
  workingReps,
  barKg,
  stepKg = 2.5,
  isBodyweight,
}: WarmupInput): PlannedSet[] {
  if (isBodyweight || !Number.isFinite(workingKg) || workingKg <= 0 || workingKg <= barKg) {
    return [];
  }
  const ramp: Array<[fraction: number, reps: number]> = [
    [0.4, 5],
    [0.6, 3],
    [0.8, workingReps <= 3 ? 1 : 2],
  ];
  const sets: PlannedSet[] = barKg > 0 ? [warmup(barKg, BAR_WARMUP_REPS)] : [];
  let heaviest = barKg > 0 ? barKg : 0;
  for (const [fraction, reps] of ramp) {
    const kg = snapToStep(workingKg * fraction, stepKg);
    if (kg <= heaviest || kg < barKg || kg >= workingKg) continue;
    sets.push(warmup(kg, reps));
    heaviest = kg;
  }
  return sets;
}
