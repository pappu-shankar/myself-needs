import type { SetRecord, WorkoutRecord } from "./types";
import { weekStartOf } from "./calendar";

/**
 * Effort as a statistic. A set carries either `rir` or `rpe` (never rewritten
 * when the setting changes), so a history can mix both — own logs in RIR, an
 * imported Hevy file in RPE. Everything aggregates in RIR and is converted
 * back for display: RIR has a real zero (a set taken to failure), where RPE's
 * floor is a convention. RPE 8 ≈ RIR 2 (Zourdos et al. 2016 RIR-based RPE).
 * Follows openGym's frontend/src/lib/effort.js closely.
 */

/**
 * At or below this RIR a set is close enough to failure to drive adaptation.
 * 3 rather than 2, as in openGym: the line is a convention, and drawn one rep
 * generously it still separates working sets from warm-up-range ones.
 */
export const HARD_RIR = 3;

/** Below this many rated sets an average is noise — callers show a dash. */
export const MIN_RATED = 5;

/** A set's effort in RIR, or null if never rated. 0 is a rating, not "empty". */
export function rirOf(set: Pick<SetRecord, "rir" | "rpe">): number | null {
  if (set.rir != null) return set.rir;
  if (set.rpe != null) return 10 - set.rpe;
  return null;
}

/** RIR → the display scale (RPE = 10 − RIR), rounded to 0.1. */
export function toScale(scale: "rir" | "rpe", rir: number | null): number | null {
  if (rir == null) return null;
  return Math.round((scale === "rpe" ? 10 - rir : rir) * 10) / 10;
}

/** A completed set that isn't a warm-up — drop, failure and AMRAP sets all count. */
export function isWorkingSet(set: Pick<SetRecord, "kind" | "completed">): boolean {
  return set.completed && set.kind !== "warmup";
}

/**
 * A working set that counts toward hard-set volume: RIR ≤ HARD_RIR, OR not
 * rated at all. Unrated working sets count as hard — effort logging is
 * optional and off by default, and the volume-landmark literature
 * (Renaissance Periodization) assumes working sets are taken reasonably close
 * to failure. Without this, anyone not logging RIR would show zero volume.
 * (openGym's muscle-map filter counts rated sets only; we deliberately differ.)
 */
export function isHardSet(set: SetRecord): boolean {
  if (!isWorkingSet(set)) return false;
  const rir = rirOf(set);
  return rir == null || rir <= HARD_RIR;
}

export interface EffortSummary {
  /** Completed working sets. */
  done: number;
  /** …of which carry an RIR or RPE. */
  rated: number;
  /** Rated sets at RIR ≤ HARD_RIR (rated only — `hardPct` is a share of rated sets). */
  hard: number;
  /** Mean RIR, 0.1; null below MIN_RATED rated sets. */
  avgRir: number | null;
  /** hard / rated as a 0–1 fraction; null below MIN_RATED rated sets. */
  hardPct: number | null;
}

/**
 * Headline effort numbers over working sets. `done` and `rated` travel with
 * the averages so the UI can say how much of the training was rated at all —
 * an average without its denominator speaks for sets nobody rated.
 */
export function effortSummary(sets: readonly SetRecord[]): EffortSummary {
  let done = 0;
  let rated = 0;
  let hard = 0;
  let sum = 0;
  for (const set of sets) {
    if (!isWorkingSet(set)) continue;
    done++;
    const rir = rirOf(set);
    if (rir == null) continue;
    rated++;
    sum += rir;
    if (rir <= HARD_RIR) hard++;
  }
  const enough = rated >= MIN_RATED;
  return {
    done,
    rated,
    hard,
    avgRir: enough ? Math.round((sum / rated) * 10) / 10 : null,
    hardPct: enough ? hard / rated : null,
  };
}

export type EffortBucket = 0 | 1 | 2 | 3 | "4+";

export interface EffortHistogramBin {
  bucket: EffortBucket;
  count: number;
  /** count / rated, 0–1; 0 when nothing is rated. */
  pct: number;
}

/**
 * How rated working sets spread across RIR 0, 1, 2, 3 and a "4+" tail
 * (fractional RIR floors: 1.5 → 1). An average alone hides "half at failure,
 * half far from it", which both average to a healthy-looking 2.
 */
export function effortHistogram(sets: readonly SetRecord[]): EffortHistogramBin[] {
  const counts = [0, 0, 0, 0, 0];
  let rated = 0;
  for (const set of sets) {
    if (!isWorkingSet(set)) continue;
    const rir = rirOf(set);
    if (rir == null) continue;
    rated++;
    counts[Math.min(4, Math.max(0, Math.floor(rir)))]++;
  }
  const buckets: EffortBucket[] = [0, 1, 2, 3, "4+"];
  return buckets.map((bucket, i) => ({
    bucket,
    count: counts[i],
    pct: rated ? counts[i] / rated : 0,
  }));
}

export interface WeeklyEffort {
  weekStart: string;
  /** Mean RIR of the week's rated working sets, 0.1. */
  avgRir: number;
  rated: number;
  /** All completed working sets that week — the volume to read effort against. */
  sets: number;
}

/**
 * Average effort per Monday–Sunday week, oldest first, with the week's set
 * count alongside: volume up with effort up is fatigue accumulating; volume up
 * with effort flat is adaptation. Weeks with fewer than 2 rated sets are
 * dropped so one tap doesn't become a peak (as openGym's effortWeeks).
 */
export function weeklyEffort(workouts: readonly WorkoutRecord[]): WeeklyEffort[] {
  const weeks = new Map<string, { sum: number; rated: number; sets: number }>();
  for (const w of workouts) {
    const key = weekStartOf(w.date);
    const week = weeks.get(key) ?? { sum: 0, rated: 0, sets: 0 };
    for (const entry of w.entries) {
      for (const set of entry.sets) {
        if (!isWorkingSet(set)) continue;
        week.sets++;
        const rir = rirOf(set);
        if (rir == null) continue;
        week.rated++;
        week.sum += rir;
      }
    }
    weeks.set(key, week);
  }
  return [...weeks.entries()]
    .filter(([, week]) => week.rated >= 2)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([weekStart, week]) => ({
      weekStart,
      avgRir: Math.round((week.sum / week.rated) * 10) / 10,
      rated: week.rated,
      sets: week.sets,
    }));
}
