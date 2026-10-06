import { addDays } from "@/lib/dates";
import { weekStartOf } from "@/modules/health/engine/calendar";
import type { AcwrZone } from "@/modules/health/engine/load";
import type { MuscleVolume, VolumeLandmark, VolumeStatus } from "@/modules/health/engine/types";
import type { WeeklyTonnage } from "@/modules/health/engine/volume";
import { toDisplayWeight } from "@/modules/health/engine/units";
import type { WeightUnit } from "@/modules/health/types";

export const RANGE_LABELS = {
  week: "7 days",
  month: "30 days",
  quarter: "90 days",
  year: "12 months",
  all: "All time",
} as const;

export type RangeKey = keyof typeof RANGE_LABELS;

export function parseRange(value: string | string[] | undefined): RangeKey {
  const v = Array.isArray(value) ? value[0] : value;
  return v && v in RANGE_LABELS ? (v as RangeKey) : "month";
}

// ---------------------------------------------------------------------------
// Volume landmarks

export const STATUS_INFO: Record<VolumeStatus, { label: string; color: string }> = {
  none: { label: "Not trained", color: "var(--muted-foreground)" },
  below_mev: { label: "Below MEV", color: "var(--chart-4)" },
  maintenance: { label: "Maintenance", color: "var(--chart-1)" },
  productive: { label: "Productive", color: "var(--chart-6)" },
  high: { label: "High", color: "var(--chart-2)" },
  above_mrv: { label: "Above MRV", color: "var(--chart-8)" },
};

/** Muscles worth a row: ones with landmarks, or ones that were trained anyway. */
export function visibleVolumes(volume: readonly MuscleVolume[]): MuscleVolume[] {
  return volume.filter((v) => v.landmark.mrv > 0 || v.hardSets > 0);
}

export interface LandmarkGeometry {
  /** Axis maximum in sets. */
  max: number;
  /** All positions are percentages of the track width, 0–100. */
  mev: number;
  bandLeft: number;
  bandWidth: number;
  mrv: number;
  value: number;
}

/** Bar geometry for one muscle: MEV/MRV ticks, the MAV band and the set count on one scale. */
export function landmarkGeometry(landmark: VolumeLandmark, sets: number): LandmarkGeometry {
  const max = Math.max(landmark.mrv * 1.15, sets * 1.05, 1);
  const pct = (n: number) => Math.min(100, Math.max(0, (n / max) * 100));
  return {
    max,
    mev: pct(landmark.mev),
    bandLeft: pct(landmark.mavLow),
    bandWidth: Math.max(0, pct(landmark.mavHigh) - pct(landmark.mavLow)),
    mrv: pct(landmark.mrv),
    value: pct(sets),
  };
}

// ---------------------------------------------------------------------------
// Balance

export interface Reading {
  label: string;
  text: string;
}

export function pushPullReading(ratio: number | null, push: number, pull: number): Reading {
  if (push === 0 && pull === 0) {
    return { label: "No data", text: "No pressing or pulling sets in the last 4 weeks." };
  }
  if (ratio === null) {
    return {
      label: "All push",
      text: "You logged pressing but no pulling in the last 4 weeks — add rows or pull-downs.",
    };
  }
  if (ratio > 1.25) {
    return {
      label: "Push-heavy",
      text: `About ${ratio.toFixed(1)} pressing sets for every pulling set. Rows and pull-downs would even it out; many coaches aim for roughly 1:1 or a bit more pulling.`,
    };
  }
  if (ratio < 0.8) {
    return {
      label: "Pull-heavy",
      text: `About ${(1 / ratio).toFixed(1)} pulling sets for every pressing set. Not a problem on its own, but check chest and shoulders are getting enough.`,
    };
  }
  return {
    label: "Balanced",
    text: "Pressing and pulling volume are within about 25% of each other.",
  };
}

export function quadHamReading(ratio: number | null, quad: number, ham: number): Reading {
  if (quad === 0 && ham === 0) {
    return { label: "No data", text: "No quad or hamstring sets in the last 4 weeks." };
  }
  if (ratio === null) {
    return {
      label: "All quads",
      text: "Quad work but no hamstring work in the last 4 weeks — add leg curls or hip hinges.",
    };
  }
  if (ratio > 2) {
    return {
      label: "Quad-dominant",
      text: `About ${ratio.toFixed(1)} quad sets per hamstring set. A ratio up to roughly 2:1 is common; beyond that, hamstrings may be lagging.`,
    };
  }
  if (ratio < 1) {
    return {
      label: "Hamstring-heavy",
      text: "More hamstring than quad sets — uncommon, so check quads are getting enough work.",
    };
  }
  return {
    label: "Balanced",
    text: "Quad and hamstring volume are in a typical range (up to about 2:1).",
  };
}

// ---------------------------------------------------------------------------
// Training load

export const ZONE_INFO: Record<AcwrZone, { label: string; color: string; text: string }> = {
  low: {
    label: "Under-prepared",
    color: "var(--chart-1)",
    text: "This week's load is below your 4-week norm. Fine for a deload; if it is not intentional, there is room to do more.",
  },
  optimal: {
    label: "Sweet spot",
    color: "var(--chart-6)",
    text: "This week's load is close to what you are used to, the range where injury risk looked lowest in Gabbett's studies.",
  },
  high: {
    label: "Elevated",
    color: "var(--chart-2)",
    text: "Load is climbing faster than your body has adapted to. Hold steady rather than adding more.",
  },
  danger: {
    label: "Spike",
    color: "var(--chart-8)",
    text: "This week is far above your usual load, the pattern linked to the most injuries. Consider an easier few days.",
  },
};

// ---------------------------------------------------------------------------
// Weekly tonnage

/** The last `weeks` Monday-start weeks ending with the current one, zero-filled. */
export function fillWeeks(
  weekly: readonly WeeklyTonnage[],
  today: string,
  weeks = 26,
): WeeklyTonnage[] {
  const byWeek = new Map(weekly.map((w) => [w.weekStart, w]));
  const last = weekStartOf(today);
  return Array.from({ length: weeks }, (_, i) => {
    const weekStart = addDays(last, -7 * (weeks - 1 - i));
    return byWeek.get(weekStart) ?? { weekStart, tonnageKg: 0, sets: 0, sessions: 0 };
  });
}

// ---------------------------------------------------------------------------
// Muscle map and weights

/** True when at least one muscle has a non-zero load. */
export function hasMuscleLoad(map: { load: Partial<Record<string, number>> }): boolean {
  return Object.values(map.load).some((v) => (v ?? 0) > 0);
}

/** "12,500 kg" / "27,557 lb": tonnage in the display unit, whole numbers. */
export function formatTonnage(kg: number, unit: WeightUnit): string {
  return `${Math.round(toDisplayWeight(kg, unit)).toLocaleString()} ${unit}`;
}
