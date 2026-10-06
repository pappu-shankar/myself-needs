import { addDays, daysBetween } from "@/lib/dates";
import type { BodyPart, LoadingScheme, WeightUnit } from "../gym-types";
import type { PlannedSet } from "./types";
import { formatWeight, lbToKg, roundTo, snapToStep } from "./units";

/**
 * Jim Wendler's 5/3/1 (5/3/1: The Simplest and Most Effective Training System
 * for Raw Strength, 2009/2011): four-week cycles of percentages of a training
 * max (TM), the last set of weeks 1–3 taken for as many reps as possible
 * ("+"), week 4 a deload. The TM itself is derived, never stored: the base TM
 * the user set, plus a bump per completed cycle that earned one.
 */

export type WendlerWeek = 1 | 2 | 3 | 4;

export interface WendlerWeekSpec {
  label: string;
  /** Share of the TM per main set. */
  percents: readonly [number, number, number];
  reps: readonly [number, number, number];
  /** Last main set is "+" (AMRAP). */
  amrap: boolean;
}

export const WENDLER_WEEKS: Readonly<Record<WendlerWeek, WendlerWeekSpec>> = {
  1: { label: "5s week", percents: [0.65, 0.75, 0.85], reps: [5, 5, 5], amrap: true },
  2: { label: "3s week", percents: [0.7, 0.8, 0.9], reps: [3, 3, 3], amrap: true },
  3: { label: "5/3/1 week", percents: [0.75, 0.85, 0.95], reps: [5, 3, 1], amrap: true },
  4: { label: "Deload week", percents: [0.4, 0.5, 0.6], reps: [5, 5, 5], amrap: false },
};

export const WEEKS_PER_CYCLE = 4;
const DAYS_PER_CYCLE = WEEKS_PER_CYCLE * 7;

/** Wendler's TM is 90 % of a true 1RM; a TM reset also takes 10 % off. */
export const TM_FACTOR = 0.9;

function isWendlerWeek(week: number): week is WendlerWeek {
  return week === 1 || week === 2 || week === 3 || week === 4;
}

/** Cycle (1-based) and week 1–4 that `date` falls in; null before the program starts. */
export function wendlerCycleWeek(
  programStart: string,
  date: string,
): { cycle: number; week: WendlerWeek } | null {
  const days = daysBetween(programStart, date);
  if (days < 0) return null;
  const weekIndex = Math.floor(days / 7);
  return {
    cycle: Math.floor(weekIndex / WEEKS_PER_CYCLE) + 1,
    week: ((weekIndex % WEEKS_PER_CYCLE) + 1) as WendlerWeek,
  };
}

function set(kind: PlannedSet["kind"], weightKg: number, reps: number): PlannedSet {
  return { kind, weightKg, reps, durationSec: null, distanceKm: null };
}

/**
 * The prescribed sets for one 5/3/1 scheme and week, loads snapped to
 * `stepKg`:
 * - wendler_main: the week's three sets, the last an AMRAP (not on the deload)
 * - wendler_bbb: Boring But Big, 5 × 10 at `bbbPct` of the TM
 * - wendler_fsl: First Set Last, 5 × 5 at the week's first-set percentage
 * - standard: nothing — not a 5/3/1 entry
 */
export function wendlerSets(
  scheme: LoadingScheme,
  tmKg: number,
  week: number,
  stepKg: number,
  { bbbPct = 0.5 }: { bbbPct?: number } = {},
): PlannedSet[] {
  if (scheme === "standard" || !isWendlerWeek(week) || !Number.isFinite(tmKg) || tmKg <= 0) {
    return [];
  }
  const spec = WENDLER_WEEKS[week];
  const load = (pct: number) => snapToStep(tmKg * pct, stepKg);
  switch (scheme) {
    case "wendler_main":
      return spec.percents.map((pct, i) =>
        set(
          spec.amrap && i === spec.percents.length - 1 ? "amrap" : "working",
          load(pct),
          spec.reps[i],
        ),
      );
    case "wendler_bbb":
      return Array.from({ length: 5 }, () => set("working", load(bbbPct), 10));
    case "wendler_fsl":
      return Array.from({ length: 5 }, () => set("working", load(spec.percents[0]), 5));
  }
}

const LOWER_BODY: ReadonlySet<string> = new Set<BodyPart>(["upper legs", "lower legs"]);

/** Per-cycle TM bump: Wendler's +10 lb lower body / +5 lb upper body — as metric
 * 5 / 2.5 kg for kg users, exact pounds (in kg) for lb users. */
export function tmIncrementKg(bodyPart: BodyPart | string, unit: WeightUnit = "kg"): number {
  const lower = LOWER_BODY.has(bodyPart.toLowerCase().trim());
  if (unit === "lb") return lbToKg(lower ? 10 : 5);
  return lower ? 5 : 2.5;
}

/** Wendler's starting TM: 90 % of a (estimated) 1RM, snapped. */
export function suggestTrainingMax(e1rmKg: number, stepKg: number): number {
  return snapToStep(e1rmKg * TM_FACTOR, stepKg);
}

export interface AmrapResult {
  date: string;
  /** 5/3/1 week the AMRAP belonged to (1–3). */
  week: number;
  weightKg: number;
  reps: number;
  /** The "+" set's prescribed reps (5, 3 or 1). */
  requiredReps: number;
}

export interface TrainingMaxChange {
  cycle: number;
  change: "bump" | "hold" | "reset";
  /** TM after this cycle. */
  tmKg: number;
  reason: string;
}

export interface TrainingMaxInput {
  /** The TM the user set… */
  baseTmKg: number;
  /** …and the date they set it; cycles that ended before it don't count. */
  effectiveFrom: string;
  programStart: string;
  today: string;
  bodyPart: BodyPart | string;
  stepKg: number;
  amrapResults: readonly AmrapResult[];
  /** Unit for bumps and the reasons' text; default kg. */
  weightUnit?: WeightUnit;
}

/** The deciding AMRAP of a cycle: its week-3 (5/3/1) set if logged, else its latest. */
function decidingAmrap(results: readonly AmrapResult[]): AmrapResult | null {
  const byDate = [...results].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const week3 = byDate.filter((r) => r.week === 3);
  return week3[week3.length - 1] ?? byDate[byDate.length - 1] ?? null;
}

/**
 * The TM in force today. Each completed cycle since `effectiveFrom` is judged
 * on its deciding AMRAP: requirement met → bump by tmIncrementKg; missed →
 * hold; two misses in a row → reset to 90 %, snapped (Wendler's "5 forward,
 * 3 back" reset, simplified to 10 %). A cycle with no AMRAP logged holds and
 * neither starts nor breaks a run of misses — no data is not a failure.
 */
export function effectiveTrainingMax(input: TrainingMaxInput): {
  tmKg: number;
  changes: TrainingMaxChange[];
} {
  const { programStart, effectiveFrom, today, stepKg } = input;
  const unit = input.weightUnit ?? "kg";
  const formatKg = (kg: number) => formatWeight(kg, unit);
  const increment = tmIncrementKg(input.bodyPart, unit);
  const elapsed = daysBetween(programStart, today);
  const completedCycles = elapsed < 0 ? 0 : Math.floor(elapsed / DAYS_PER_CYCLE);
  const changes: TrainingMaxChange[] = [];
  let tmKg = input.baseTmKg;
  let misses = 0;

  for (let cycle = 1; cycle <= completedCycles; cycle++) {
    const cycleStart = addDays(programStart, (cycle - 1) * DAYS_PER_CYCLE);
    const cycleEnd = addDays(cycleStart, DAYS_PER_CYCLE);
    if (cycleEnd <= effectiveFrom) continue;
    const windowStart = cycleStart > effectiveFrom ? cycleStart : effectiveFrom;
    const amrap = decidingAmrap(
      input.amrapResults.filter((r) => r.date >= windowStart && r.date < cycleEnd),
    );

    if (!amrap) {
      changes.push({
        cycle,
        change: "hold",
        tmKg,
        reason: `Cycle ${cycle}: no AMRAP logged — TM stays at ${formatKg(tmKg)}.`,
      });
      continue;
    }
    const set = `${formatKg(amrap.weightKg)} × ${amrap.reps}`;
    if (amrap.reps >= amrap.requiredReps) {
      tmKg = roundTo(tmKg + increment, 2);
      misses = 0;
      changes.push({
        cycle,
        change: "bump",
        tmKg,
        reason: `Cycle ${cycle}: ${set} on the week-${amrap.week} AMRAP (needed ${amrap.requiredReps}) — TM +${formatKg(increment)} to ${formatKg(tmKg)}.`,
      });
      continue;
    }
    misses++;
    if (misses >= 2) {
      tmKg = snapToStep(tmKg * TM_FACTOR, stepKg);
      misses = 0;
      changes.push({
        cycle,
        change: "reset",
        tmKg,
        reason: `Cycle ${cycle}: second missed AMRAP in a row (${set}, needed ${amrap.requiredReps}) — TM reset 10 % to ${formatKg(tmKg)}.`,
      });
    } else {
      changes.push({
        cycle,
        change: "hold",
        tmKg,
        reason: `Cycle ${cycle}: ${set} missed the ${amrap.requiredReps} required — TM held at ${formatKg(tmKg)}; another miss resets it.`,
      });
    }
  }
  return { tmKg, changes };
}
