import { addDays, daysBetween } from "@/lib/dates";
import { workoutMinutes } from "./calendar";
import { isWorkingSet } from "./effort";
import type { WorkoutRecord } from "./types";

/**
 * Training load and the acute:chronic workload ratio (ACWR). Load is the
 * session-RPE method (Foster et al. 2001): duration in minutes × the session's
 * RPE, in arbitrary units (AU).
 */

/** Session RPE assumed when nothing in the workout was rated — a moderate session. */
export const DEFAULT_SESSION_RPE = 5;

/** Minimum days of training history before a ratio is reported. */
export const MIN_HISTORY_DAYS = 21;

const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Session load in AU: minutes × (sessionRpe ?? mean effective set RPE ?? 5).
 * Effective set RPE is the logged RPE, else 10 − RIR, over rated working
 * sets. Foster's method asks for one whole-session rating on the CR-10 scale;
 * averaging RIR-based set RPEs is an approximation used only when that
 * rating is missing.
 */
export function sessionLoad(w: WorkoutRecord): number {
  let rpe = w.sessionRpe;
  if (rpe == null) {
    const rated: number[] = [];
    for (const entry of w.entries) {
      for (const set of entry.sets) {
        if (!isWorkingSet(set)) continue;
        if (set.rpe != null) rated.push(set.rpe);
        else if (set.rir != null) rated.push(10 - set.rir);
      }
    }
    rpe = rated.length ? rated.reduce((a, b) => a + b, 0) / rated.length : DEFAULT_SESSION_RPE;
  }
  return Math.round(workoutMinutes(w) * rpe);
}

export interface DailyLoad {
  date: string;
  load: number;
}

/** Load per calendar day from `from` to `to` inclusive, rest days as 0; sessions on one day add up. */
export function dailyLoads(
  workouts: readonly WorkoutRecord[],
  from: string,
  to: string,
): DailyLoad[] {
  const byDate = new Map<string, number>();
  for (const w of workouts) {
    if (w.date < from || w.date > to) continue;
    byDate.set(w.date, (byDate.get(w.date) ?? 0) + sessionLoad(w));
  }
  const days: DailyLoad[] = [];
  for (let date = from; date <= to; date = addDays(date, 1)) {
    days.push({ date, load: byDate.get(date) ?? 0 });
  }
  return days;
}

export interface Acwr {
  /** Acute (7-day) average daily load, AU. */
  acute: number;
  /** Chronic (28-day) average daily load, AU. */
  chronic: number;
  /** acute ÷ chronic; null with < 21 days of history or no chronic load. */
  ratio: number | null;
}

/** Daily loads by date (duplicates summed), and the first day with any load on or before `onDate`. */
function indexLoads(daily: readonly DailyLoad[], onDate: string) {
  const loads = new Map<string, number>();
  let firstLoaded: string | null = null;
  for (const { date, load } of daily) {
    if (date > onDate) continue;
    loads.set(date, (loads.get(date) ?? 0) + load);
    if (load > 0 && (firstLoaded === null || date < firstLoaded)) firstLoaded = date;
  }
  const historyDays = firstLoaded ? daysBetween(firstLoaded, onDate) + 1 : 0;
  return { loads, firstLoaded, historyDays };
}

function ratioOf(acute: number, chronic: number, historyDays: number): number | null {
  return historyDays >= MIN_HISTORY_DAYS && chronic > 0 ? round2(acute / chronic) : null;
}

/**
 * Rolling-average ACWR on `onDate`: mean daily load over the last 7 days
 * (including `onDate`) vs the last 28 (Hulin et al. 2014; Gabbett 2016 —
 * the "coupled" form, the chronic window contains the acute one). Days
 * missing from `daily` count as rest. History starts at the first day with
 * any load; until it reaches 28 days the chronic mean is taken over the days
 * that exist rather than padded with pre-history zeros, which would make a
 * steady newcomer look like they were spiking.
 */
export function acwr(daily: readonly DailyLoad[], onDate: string): Acwr {
  const { loads, historyDays } = indexLoads(daily, onDate);
  const sumOver = (days: number) => {
    let sum = 0;
    for (let i = 0; i < days; i++) sum += loads.get(addDays(onDate, -i)) ?? 0;
    return sum;
  };
  const acute = sumOver(7) / 7;
  const chronic = sumOver(28) / Math.max(7, Math.min(28, historyDays));
  return {
    acute: round1(acute),
    chronic: round1(chronic),
    ratio: ratioOf(acute, chronic, historyDays),
  };
}

/** EWMA decay constants, λ = 2 / (N + 1) (Williams et al. 2017). */
export const LAMBDA_ACUTE = 2 / (7 + 1);
export const LAMBDA_CHRONIC = 2 / (28 + 1);

/**
 * Exponentially weighted ACWR (Williams et al. 2017): each day,
 * ewma = λ × load + (1 − λ) × yesterday's ewma, with λa = 2/8 and λc = 2/29.
 * It reacts to recent days more than to old ones and has no cliff when a big
 * session drops out of a window. Both averages are seeded with the mean daily
 * load of the first week of history rather than 0, so the slow chronic
 * average isn't understated for weeks while it warms up.
 */
export function acwrEwma(daily: readonly DailyLoad[], onDate: string): Acwr {
  const { loads, firstLoaded, historyDays } = indexLoads(daily, onDate);
  if (!firstLoaded) return { acute: 0, chronic: 0, ratio: null };
  const seedDays = Math.min(7, historyDays);
  let seed = 0;
  for (let i = 0; i < seedDays; i++) seed += loads.get(addDays(firstLoaded, i)) ?? 0;
  let acute = seed / seedDays;
  let chronic = acute;
  for (let date = firstLoaded; date <= onDate; date = addDays(date, 1)) {
    const load = loads.get(date) ?? 0;
    acute = LAMBDA_ACUTE * load + (1 - LAMBDA_ACUTE) * acute;
    chronic = LAMBDA_CHRONIC * load + (1 - LAMBDA_CHRONIC) * chronic;
  }
  return {
    acute: round1(acute),
    chronic: round1(chronic),
    ratio: ratioOf(acute, chronic, historyDays),
  };
}

export type AcwrZone = "low" | "optimal" | "high" | "danger";

/**
 * Gabbett 2016's zones: < 0.8 under-prepared ("low"), 0.8–1.3 the "sweet
 * spot", 1.3–1.5 elevated, > 1.5 the "danger zone" for injury risk.
 * Boundaries belong to the safer zone (1.3 is optimal, 1.5 is high).
 */
export function acwrZone(ratio: number | null): AcwrZone | null {
  if (ratio == null || !Number.isFinite(ratio)) return null;
  if (ratio < 0.8) return "low";
  if (ratio <= 1.3) return "optimal";
  if (ratio <= 1.5) return "high";
  return "danger";
}
