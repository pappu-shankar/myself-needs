import type { Sex } from "../gym-types";
import type { StrengthLevel, StrengthStandard } from "./types";

/**
 * Strength standards: the DOTS score for a powerlifting total, and per-lift
 * bodyweight-multiple levels from beginner to elite.
 */

export type Lift = StrengthStandard["lift"];
export const LIFTS: readonly Lift[] = [
  "squat",
  "bench",
  "deadlift",
  "overhead_press",
  "row",
  "pullup",
];

/** The levels a bodyweight ratio can reach, weakest first ("untrained" is below beginner). */
export const STRENGTH_LEVELS = ["beginner", "novice", "intermediate", "advanced", "elite"] as const;
type RatedLevel = (typeof STRENGTH_LEVELS)[number];

/**
 * DOTS polynomial coefficients [a, b, c, d, e] for a·bw⁴ + b·bw³ + c·bw² + d·bw + e —
 * the official DOTS formula (Tim Konertz for the German federation BVDK, 2019;
 * the coefficients OpenPowerlifting publishes and most federations use).
 */
const DOTS: Record<Sex, { coefficients: readonly number[]; minBw: number; maxBw: number }> = {
  male: {
    coefficients: [-0.000001093, 0.0007391293, -0.1918759221, 24.0900756, -307.75076],
    minBw: 40,
    maxBw: 210,
  },
  female: {
    coefficients: [-0.0000010706, 0.0005158568, -0.1126655495, 13.6175032, -57.96288],
    minBw: 40,
    maxBw: 150,
  },
};

/**
 * DOTS multiplier: 500 / poly(bodyweight), with bodyweight clamped to the
 * formula's valid range (men 40–210 kg, women 40–150 kg) — outside it the
 * polynomial turns over and would reward extreme bodyweights.
 */
export function dotsCoefficient(bodyweightKg: number, sex: Sex): number {
  const { coefficients, minBw, maxBw } = DOTS[sex];
  const bw = Math.min(maxBw, Math.max(minBw, bodyweightKg));
  const poly = coefficients.reduce((acc, c) => acc * bw + c, 0);
  return 500 / poly;
}

/** DOTS score for a total (squat + bench + deadlift, kg), 0.01. */
export function dotsScore(totalKg: number, bodyweightKg: number, sex: Sex): number {
  return Math.round(totalKg * dotsCoefficient(bodyweightKg, sex) * 100) / 100;
}

/**
 * 1RM ÷ bodyweight needed for each level, per lift and sex. These are
 * widely used approximate general-population standards (in the spirit of
 * the ExRx / Strength Level tables), not federation data — good for "where
 * am I roughly", not for ranking. Row = barbell bent-over row. Pull-up
 * ratios are total load ÷ bodyweight with bodyweight included, so 1.0 is
 * one strict bodyweight rep and 1.5 is a +50 % bodyweight weighted single.
 */
export const STRENGTH_RATIOS: Record<Lift, Record<Sex, Record<RatedLevel, number>>> = {
  squat: {
    male: { beginner: 0.75, novice: 1.25, intermediate: 1.5, advanced: 2.25, elite: 2.75 },
    female: { beginner: 0.5, novice: 0.75, intermediate: 1.25, advanced: 1.5, elite: 2 },
  },
  bench: {
    male: { beginner: 0.5, novice: 0.75, intermediate: 1.25, advanced: 1.75, elite: 2 },
    female: { beginner: 0.25, novice: 0.5, intermediate: 0.75, advanced: 1, elite: 1.5 },
  },
  deadlift: {
    male: { beginner: 1, novice: 1.5, intermediate: 2, advanced: 2.5, elite: 3 },
    female: { beginner: 0.5, novice: 1, intermediate: 1.25, advanced: 1.75, elite: 2.5 },
  },
  overhead_press: {
    male: { beginner: 0.4, novice: 0.55, intermediate: 0.8, advanced: 1.05, elite: 1.35 },
    female: { beginner: 0.2, novice: 0.35, intermediate: 0.5, advanced: 0.75, elite: 1 },
  },
  row: {
    male: { beginner: 0.5, novice: 0.75, intermediate: 1, advanced: 1.5, elite: 1.75 },
    female: { beginner: 0.25, novice: 0.4, intermediate: 0.65, advanced: 0.9, elite: 1.2 },
  },
  pullup: {
    male: { beginner: 1, novice: 1.2, intermediate: 1.45, advanced: 1.75, elite: 2 },
    female: { beginner: 1, novice: 1.1, intermediate: 1.25, advanced: 1.45, elite: 1.7 },
  },
};

/**
 * Level for one lift. `e1rmKg` is the estimated 1RM — for pull-ups it must
 * include bodyweight (bodyweight + added load), matching STRENGTH_RATIOS.
 * Below beginner reads "untrained". `nextLevelKg` is the e1RM (same basis,
 * not the difference) the next level needs at the current bodyweight,
 * rounded up to 0.5 kg; null at elite. Missing e1RM or bodyweight → all null.
 */
export function strengthStandard(
  lift: Lift,
  e1rmKg: number | null,
  bodyweightKg: number | null,
  sex: Sex,
): StrengthStandard {
  if (e1rmKg == null || !(e1rmKg > 0) || bodyweightKg == null || !(bodyweightKg > 0)) {
    return { lift, e1rmKg, ratio: null, level: null, nextLevelKg: null };
  }
  const thresholds = STRENGTH_RATIOS[lift][sex];
  const ratio = e1rmKg / bodyweightKg;
  let level: StrengthLevel = "untrained";
  let next: RatedLevel | null = STRENGTH_LEVELS[0];
  for (let i = 0; i < STRENGTH_LEVELS.length; i++) {
    if (ratio < thresholds[STRENGTH_LEVELS[i]]) break;
    level = STRENGTH_LEVELS[i];
    next = STRENGTH_LEVELS[i + 1] ?? null;
  }
  return {
    lift,
    e1rmKg,
    ratio: Math.round(ratio * 100) / 100,
    level,
    nextLevelKg: next ? ceilHalfKg(thresholds[next] * bodyweightKg) : null,
  };
}

/** Round up to 0.5 kg, ignoring float noise (0.55 × 80 is 44.000000000000007, not 44.5). */
function ceilHalfKg(kg: number): number {
  return Math.ceil(Math.round(kg * 2 * 1e6) / 1e6) / 2;
}

/**
 * Catalog keys (src/modules/health/data/exercise-catalog.json `key`) of the
 * exercises that count as each standard lift — the canonical barbell
 * movement and its close variants, never assistance lifts (front squats,
 * Romanian deadlifts, incline bench). Hard-coded because engine/ can't import
 * the JSON; strength.test.ts checks every key still names what it says.
 */
export const LIFT_CATALOG_KEYS: Record<Lift, readonly string[]> = {
  // Barbell Full Squat (+ its two camera-angle duplicates), Low Bar Squat, High Bar Squat
  squat: ["0043", "1461", "1462", "1435", "1436"],
  // Barbell Bench Press
  bench: ["0025"],
  // Barbell Deadlift, Barbell Sumo Deadlift
  deadlift: ["0032", "0117"],
  // Barbell Standing Close Grip / Wide Military Press, Barbell Seated Overhead Press
  overhead_press: ["1456", "1457", "0091"],
  // Barbell Bent Over Row, Barbell Pendlay Row, Barbell Reverse Grip Bent Over Row
  row: ["0027", "3017", "0118"],
  // Pull-Up, Weighted Pull-Up, Wide Grip Pull-Up, Pull Up (Neutral Grip), Chin-Up
  pullup: ["0652", "0841", "1429", "0651", "1326"],
};
