import type { ReadinessBand } from "../gym-types";
import { acwrZone, type AcwrZone } from "./load";
import type { ReadinessInput, ReadinessResult } from "./types";

/**
 * Daily readiness: last night's sleep, a 1–5 self-rating check-in and the
 * acute:chronic workload ratio, blended into a 0–100 score and a train-hard /
 * normal / easy / rest call. The weights are this app's own heuristic, not a
 * validated instrument; the check-in items follow the common wellness
 * questionnaire shape (McLean et al. 2010: sleep quality, fatigue, soreness,
 * stress, mood).
 */

/** Overall weights, renormalized over the parts actually present. */
export const READINESS_WEIGHTS = { sleep: 0.3, checkin: 0.5, load: 0.2 } as const;

/** Check-in item weights (sum 1). Soreness and stress are inverted: 5 = worst. */
export const CHECKIN_WEIGHTS = {
  sleepQuality: 0.25,
  energy: 0.25,
  soreness: 0.2,
  stress: 0.15,
  motivation: 0.15,
} as const;

/** The load part's score per ACWR zone (Gabbett 2016 zones, see load.ts). */
export const LOAD_ZONE_SCORES: Record<AcwrZone, number> = {
  optimal: 100,
  low: 80,
  high: 60,
  danger: 25,
};

export const BAND_RECOMMENDATIONS: Record<ReadinessBand, string> = {
  push: "Good day to push — go for PRs",
  normal: "Train as planned",
  easy: "Keep it lighter: drop a set or cap effort at RPE 7",
  rest: "Rest or do light mobility",
};

const NO_DATA_RECOMMENDATION =
  "Log last night's sleep or a quick check-in to get a readiness score";

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const fmt = (n: number) => String(Math.round(n * 10) / 10);

/** Score ≥ 80 push, 60–79 normal, 40–59 easy, < 40 rest. */
export function readinessBand(score: number): ReadinessBand {
  if (score >= 80) return "push";
  if (score >= 60) return "normal";
  if (score >= 40) return "easy";
  return "rest";
}

/** 100 at or above target, falling linearly to 0 at half the target. Null when not logged. */
export function sleepScore(hours: number | null, targetHours: number): number | null {
  if (hours == null || !(targetHours > 0)) return null;
  const half = targetHours / 2;
  return clamp(((hours - half) / half) * 100, 0, 100);
}

/** Weighted 1–5 check-in → 0–100; soreness and stress count inverted. */
export function checkinScore(checkin: NonNullable<ReadinessInput["checkin"]>): number {
  const up = (v: number) => ((clamp(v, 1, 5) - 1) / 4) * 100;
  const down = (v: number) => 100 - up(v);
  return (
    CHECKIN_WEIGHTS.sleepQuality * up(checkin.sleepQuality) +
    CHECKIN_WEIGHTS.energy * up(checkin.energy) +
    CHECKIN_WEIGHTS.soreness * down(checkin.soreness) +
    CHECKIN_WEIGHTS.stress * down(checkin.stress) +
    CHECKIN_WEIGHTS.motivation * up(checkin.motivation)
  );
}

type Impact = ReadinessResult["factors"][number]["impact"];
const impactOf = (score: number): Impact =>
  score >= 75 ? "positive" : score >= 50 ? "neutral" : "negative";

const ZONE_WORDS: Record<AcwrZone, string> = {
  optimal: "in the 0.8–1.3 sweet spot",
  low: "below 0.8 — training less than your recent norm",
  high: "1.3–1.5 — load is climbing fast",
  danger: "above 1.5 — a spike well over your usual load",
};

/**
 * Readiness score (0–100, rounded) with band, recommendation and a plain-words
 * factor per part. Parts: sleep (weight .3), check-in (.5), training load
 * (.2); missing parts drop out and the rest are renormalized, so a check-in
 * alone still gives a score. Nothing at all → score null.
 */
export function readinessScore(input: ReadinessInput): ReadinessResult {
  const parts: Array<{ weight: number; score: number }> = [];
  const factors: ReadinessResult["factors"] = [];

  const sleep = sleepScore(input.sleepHours, input.sleepTargetHours);
  if (sleep != null && input.sleepHours != null) {
    parts.push({ weight: READINESS_WEIGHTS.sleep, score: sleep });
    factors.push({
      label: "Sleep",
      detail: `${fmt(input.sleepHours)} h slept, target ${fmt(input.sleepTargetHours)} h — ${Math.round(sleep)}/100`,
      impact: impactOf(sleep),
    });
  } else {
    factors.push({
      label: "Sleep",
      detail: "Not logged — left out of the score",
      impact: "neutral",
    });
  }

  if (input.checkin) {
    const c = input.checkin;
    const score = checkinScore(c);
    parts.push({ weight: READINESS_WEIGHTS.checkin, score });
    factors.push({
      label: "Check-in",
      detail:
        `Sleep quality ${c.sleepQuality}/5, energy ${c.energy}/5, motivation ${c.motivation}/5, ` +
        `soreness ${c.soreness}/5, stress ${c.stress}/5 — ${Math.round(score)}/100`,
      impact: impactOf(score),
    });
  } else {
    factors.push({
      label: "Check-in",
      detail: "No check-in today — left out of the score",
      impact: "neutral",
    });
  }

  const zone = acwrZone(input.acwr);
  if (zone && input.acwr != null) {
    const score = LOAD_ZONE_SCORES[zone];
    parts.push({ weight: READINESS_WEIGHTS.load, score });
    factors.push({
      label: "Training load",
      detail: `Acute:chronic workload ratio ${input.acwr.toFixed(2)}, ${ZONE_WORDS[zone]} — ${score}/100`,
      impact: zone === "optimal" ? "positive" : zone === "low" ? "neutral" : "negative",
    });
  } else {
    factors.push({
      label: "Training load",
      detail: "Not enough training history yet for a workload ratio (3 weeks needed)",
      impact: "neutral",
    });
  }

  const totalWeight = parts.reduce((sum, p) => sum + p.weight, 0);
  if (totalWeight === 0) {
    return { score: null, band: null, recommendation: NO_DATA_RECOMMENDATION, factors };
  }
  const score = Math.round(parts.reduce((sum, p) => sum + p.weight * p.score, 0) / totalWeight);
  const band = readinessBand(score);
  return { score, band, recommendation: BAND_RECOMMENDATIONS[band], factors };
}
