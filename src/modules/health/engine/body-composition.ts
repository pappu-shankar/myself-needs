import { addDays, daysBetween, todayIso } from "@/lib/dates";
import type { Sex } from "../gym-types";
import type { BodyComposition } from "./types";

/**
 * Body composition from tape measurements and body weight: BMI, US Navy
 * body-fat estimate, lean mass, FFMI, waist-to-height, weight trend and goal
 * progress. All lengths in cm, masses in kg.
 */

const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;
const positive = (n: number | null | undefined): n is number =>
  typeof n === "number" && Number.isFinite(n) && n > 0;

/** Body-mass index, kg/m², 0.1. Null on missing or non-positive input. */
export function bmi(weightKg: number | null, heightCm: number | null): number | null {
  if (!positive(weightKg) || !positive(heightCm)) return null;
  const m = heightCm / 100;
  return round1(weightKg / (m * m));
}

export type BmiCategory = "underweight" | "normal" | "overweight" | "obese";

/**
 * WHO adult BMI classes: < 18.5 underweight, < 25 normal, < 30 overweight,
 * ≥ 30 obese. (WHO 2004 suggests lower action points for Asian populations;
 * BMI also misreads muscular lifters — the UI shows it beside body fat.)
 */
export function bmiCategory(value: number): BmiCategory {
  if (value < 18.5) return "underweight";
  if (value < 25) return "normal";
  if (value < 30) return "overweight";
  return "obese";
}

export interface NavyInput {
  sex: Sex;
  heightCm: number | null;
  neckCm: number | null | undefined;
  waistCm: number | null | undefined;
  /** Required for women, ignored for men. */
  hipsCm?: number | null;
}

/**
 * US Navy circumference body-fat estimate (Hodgdon & Beckett 1984), the
 * metric (cm) form:
 *   men:   495 / (1.0324 − 0.19077·log10(waist − neck) + 0.15456·log10(height)) − 450
 *   women: 495 / (1.29579 − 0.35004·log10(waist + hips − neck) + 0.22100·log10(height)) − 450
 * Waist at the navel for men, narrowest point for women. Null when a
 * measurement is missing, a log argument is non-positive (waist ≤ neck), or
 * the result is outside 0–100 %. Rounded to 0.1.
 */
export function navyBodyFat(input: NavyInput): number | null {
  const { sex, heightCm, neckCm, waistCm, hipsCm } = input;
  if (!positive(heightCm) || !positive(neckCm) || !positive(waistCm)) return null;
  let density: number;
  if (sex === "male") {
    const girth = waistCm - neckCm;
    if (girth <= 0) return null;
    density = 1.0324 - 0.19077 * Math.log10(girth) + 0.15456 * Math.log10(heightCm);
  } else {
    if (!positive(hipsCm)) return null;
    const girth = waistCm + hipsCm - neckCm;
    if (girth <= 0) return null;
    density = 1.29579 - 0.35004 * Math.log10(girth) + 0.221 * Math.log10(heightCm);
  }
  const pct = 495 / density - 450;
  return Number.isFinite(pct) && pct > 0 && pct < 100 ? round1(pct) : null;
}

/** Fat-free mass index: lean kg / height m², 0.1 (Kouri et al. 1995). */
export function ffmi(leanKg: number | null, heightCm: number | null): number | null {
  if (!positive(leanKg) || !positive(heightCm)) return null;
  const m = heightCm / 100;
  return round1(leanKg / (m * m));
}

/**
 * FFMI normalized to 1.8 m: FFMI + 6.1 × (1.8 − height m) (Kouri et al.
 * 1995), so tall and short lifters compare fairly. 0.1.
 */
export function normalizedFfmi(leanKg: number | null, heightCm: number | null): number | null {
  if (!positive(leanKg) || !positive(heightCm)) return null;
  const m = heightCm / 100;
  return round1(leanKg / (m * m) + 6.1 * (1.8 - m));
}

export type BodyCompositionSite = "neck" | "waist" | "hips" | "body_fat_pct";

/**
 * Everything derivable from the latest weight and measurements. A measured
 * body_fat_pct (calipers, DEXA, scale) takes precedence over the Navy tape
 * estimate. Each derived field is null when its inputs are missing.
 */
export function bodyComposition(input: {
  sex: Sex | null;
  heightCm: number | null;
  weightKg: number | null;
  measured: Partial<Record<BodyCompositionSite, number>>;
}): BodyComposition {
  const { sex, heightCm, weightKg, measured } = input;
  const measuredFat = measured.body_fat_pct;
  let bodyFatPct: number | null = null;
  let bodyFatSource: BodyComposition["bodyFatSource"] = null;
  if (typeof measuredFat === "number" && measuredFat > 0 && measuredFat < 100) {
    bodyFatPct = round1(measuredFat);
    bodyFatSource = "measured";
  } else if (sex) {
    bodyFatPct = navyBodyFat({
      sex,
      heightCm,
      neckCm: measured.neck,
      waistCm: measured.waist,
      hipsCm: measured.hips,
    });
    if (bodyFatPct != null) bodyFatSource = "navy";
  }
  const leanMassKg =
    positive(weightKg) && bodyFatPct != null ? round1(weightKg * (1 - bodyFatPct / 100)) : null;
  return {
    bmi: bmi(weightKg, heightCm),
    bodyFatPct,
    bodyFatSource,
    leanMassKg,
    ffmi: ffmi(leanMassKg, heightCm),
    normalizedFfmi: normalizedFfmi(leanMassKg, heightCm),
    waistToHeight:
      positive(measured.waist) && positive(heightCm) ? round2(measured.waist / heightCm) : null,
  };
}

export type BodyFatCategory = "essential" | "athletes" | "fitness" | "average" | "obese";

/**
 * American Council on Exercise body-fat categories. ACE's bands are
 * essential 2–5 / athletes 6–13 / fitness 14–17 / average 18–24 / obese 25+ %
 * for men and 10–13 / 14–20 / 21–24 / 25–31 / 32+ % for women; the gaps
 * between bands are closed by treating each band's next lower bound as the
 * cut-off, and anything under "essential" still reads as essential.
 */
export function bodyFatCategory(sex: Sex, pct: number): BodyFatCategory {
  const [athletes, fitness, average, obese] = sex === "male" ? [6, 14, 18, 25] : [14, 21, 25, 32];
  if (pct < athletes) return "essential";
  if (pct < fitness) return "athletes";
  if (pct < average) return "fitness";
  if (pct < obese) return "average";
  return "obese";
}

export interface WeightTrend {
  /** Fitted change per week, kg (negative = losing), 0.01. */
  perWeekKg: number;
  /** perWeekKg as % of the fitted current weight, 0.01. */
  perWeekPct: number;
}

/**
 * Rate of weight change over the last `days` days (ending `today`), from an
 * ordinary least-squares line through the weigh-ins — daily water swings
 * average out instead of one high morning setting the trend. Null with fewer
 * than 2 points in the window or less than 7 days between first and last.
 */
export function weightTrend(
  points: ReadonlyArray<{ date: string; value: number }>,
  days = 28,
  today: string = todayIso(),
): WeightTrend | null {
  const from = addDays(today, -days);
  const window = points.filter(
    (p) => p.date >= from && p.date <= today && Number.isFinite(p.value),
  );
  if (window.length < 2) return null;
  const first = window.reduce((min, p) => (p.date < min ? p.date : min), window[0].date);
  const xs = window.map((p) => daysBetween(first, p.date));
  const span = Math.max(...xs);
  if (span < 7) return null;
  const n = window.length;
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = window.reduce((a, p) => a + p.value, 0) / n;
  let sxy = 0;
  let sxx = 0;
  window.forEach((p, i) => {
    sxy += (xs[i] - meanX) * (p.value - meanY);
    sxx += (xs[i] - meanX) ** 2;
  });
  const slopePerDay = sxy / sxx;
  const current = meanY + slopePerDay * (span - meanX);
  const perWeekKg = slopePerDay * 7;
  return {
    perWeekKg: round2(perWeekKg),
    perWeekPct: current > 0 ? round2((perWeekKg / current) * 100) : 0,
  };
}

/**
 * How far from start to goal weight the current weight is, 0–1 (clamped:
 * moving the wrong way is 0, overshooting is 1). Works for cutting and
 * bulking alike. Null when start equals goal or an input is missing.
 */
export function goalProgress(
  startKg: number | null,
  currentKg: number | null,
  goalKg: number | null,
): number | null {
  if (!positive(startKg) || !positive(currentKg) || !positive(goalKg) || startKg === goalKg) {
    return null;
  }
  return Math.min(1, Math.max(0, (startKg - currentKg) / (startKg - goalKg)));
}
