import {
  MEASUREMENT_LABELS,
  MEASUREMENT_SITES,
  measurementUnit,
  type MeasurementSite,
} from "@/modules/health/types";
import type { StrengthLevel, StrengthStandard } from "@/modules/health/engine/types";
import { fromDisplayWeight, toDisplayWeight } from "@/modules/health/engine/units";
import type { WeightUnit } from "@/modules/health/types";

export interface SeriesPoint {
  id: number;
  date: string;
  value: number;
}

export interface MeasurementRow {
  site: MeasurementSite;
  label: string;
  unit: "cm" | "%";
  latest: SeriesPoint;
  /** Null when this is the first reading. */
  change: number | null;
}

/** One row per site that has readings, in the form's order: latest value and change vs the reading before. */
export function measurementRows(
  series: ReadonlyArray<{ site: MeasurementSite; points: readonly SeriesPoint[] }>,
): MeasurementRow[] {
  const bySite = new Map(series.map((s) => [s.site, s.points]));
  return MEASUREMENT_SITES.flatMap((site) => {
    const points = bySite.get(site) ?? [];
    const latest = points[points.length - 1];
    if (!latest) return [];
    const previous = points[points.length - 2];
    return [
      {
        site,
        label: MEASUREMENT_LABELS[site],
        unit: measurementUnit(site),
        latest,
        change: previous ? Math.round((latest.value - previous.value) * 10) / 10 : null,
      },
    ];
  });
}

/** "+0.5", "−1.2" (true minus sign), "0" — null when there is nothing to compare. */
export function formatChange(delta: number | null): string {
  if (delta === null) return "—";
  if (delta === 0) return "0";
  const abs = Math.abs(delta).toLocaleString(undefined, { maximumFractionDigits: 1 });
  return `${delta > 0 ? "+" : "−"}${abs}`;
}

/** "−0.4 kg/week" (or "−0.9 lb/week") for the fitted weight trend, given in kg. */
export function formatTrend(perWeekKg: number, unit: WeightUnit = "kg"): string {
  return `${formatChange(toDisplayWeight(perWeekKg, unit))} ${unit}/week`;
}

/** A weight typed in the display unit, as kg rounded to grams — what the actions take. */
export function toStorageKg(value: number, unit: WeightUnit): number {
  return Math.round(fromDisplayWeight(value, unit) * 1000) / 1000;
}

export type GoalDirection = "toward" | "away" | "flat" | "first" | "no-goal";

/**
 * Whether the move from `previousKg` to `currentKg` brought the weight closer
 * to the goal. "first" is the opening weigh-in (nothing to compare), "flat" an
 * unchanged weight, "no-goal" when there is no goal to measure against.
 */
export function goalDirection(
  previousKg: number | null,
  currentKg: number,
  goalKg: number | null,
): GoalDirection {
  if (previousKg === null) return "first";
  if (goalKg === null) return "no-goal";
  const before = Math.abs(previousKg - goalKg);
  const after = Math.abs(currentKg - goalKg);
  if (after < before) return "toward";
  if (after > before) return "away";
  return "flat";
}

export interface WeightPoint {
  date: string;
  weightKg: number;
}

export interface WeightChangePoint extends WeightPoint {
  /** Weight in the display unit. */
  display: number;
  /** Change since the previous weigh-in, in the display unit (null for the first). */
  change: number | null;
  direction: GoalDirection;
}

/** Each weigh-in with its change since the one before and whether that moved toward the goal. */
export function withGoalDirection(
  points: readonly WeightPoint[],
  goalKg: number | null,
  unit: WeightUnit,
): WeightChangePoint[] {
  return points.map((p, i) => {
    const prev = i > 0 ? points[i - 1] : null;
    const display = toDisplayWeight(p.weightKg, unit);
    return {
      ...p,
      display,
      change: prev ? Math.round((display - toDisplayWeight(prev.weightKg, unit)) * 10) / 10 : null,
      direction: goalDirection(prev ? prev.weightKg : null, p.weightKg, goalKg),
    };
  });
}

export const DIRECTION_TEXT: Record<GoalDirection, string> = {
  toward: "Toward goal",
  away: "Away from goal",
  flat: "No change",
  first: "First weigh-in",
  "no-goal": "No goal set",
};

export const LIFT_LABELS: Record<StrengthStandard["lift"], string> = {
  squat: "Squat",
  bench: "Bench press",
  deadlift: "Deadlift",
  overhead_press: "Overhead press",
  row: "Barbell row",
  pullup: "Pull-up (with bodyweight)",
};

export const LEVEL_LABELS: Record<StrengthLevel, string> = {
  untrained: "Untrained",
  beginner: "Beginner",
  novice: "Novice",
  intermediate: "Intermediate",
  advanced: "Advanced",
  elite: "Elite",
};

/** Days kept in the weight chart for each range choice; null = everything. */
export const WEIGHT_RANGES = [
  { key: "90", label: "90 days", days: 90 },
  { key: "365", label: "1 year", days: 365 },
  { key: "all", label: "All", days: null },
] as const;
