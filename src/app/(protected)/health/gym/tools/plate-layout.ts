import { nearestLoadable } from "@/modules/health/engine/plates";
import type { WeightUnit } from "@/modules/health/types";

export interface PlateShape {
  /** Plate size in the display unit. */
  size: number;
  /** Height as a percentage of the tallest plate (25 kg / 45 lb = 100). */
  heightPct: number;
  widthPx: number;
  color: string;
}

const REFERENCE: Record<WeightUnit, number> = { kg: 25, lb: 45 };

const COLORS_LB: Array<[number, string]> = [
  [45, "var(--chart-8)"],
  [35, "var(--chart-1)"],
  [25, "var(--chart-4)"],
  [10, "var(--chart-6)"],
  [5, "var(--chart-7)"],
];

const COLORS_KG: Array<[number, string]> = [
  [25, "var(--chart-8)"],
  [20, "var(--chart-1)"],
  [15, "var(--chart-4)"],
  [10, "var(--chart-6)"],
  [5, "var(--chart-7)"],
];

/** Colour by size (heavier plates get the competition-style hues); odd sizes stay neutral. */
export function plateColor(size: number, unit: WeightUnit = "kg"): string {
  const colors = unit === "lb" ? COLORS_LB : COLORS_KG;
  return colors.find(([s]) => s === size)?.[1] ?? "var(--muted-foreground)";
}

/** Drawn size for each plate on one side, in the order given: bigger plate, bigger shape. */
export function plateShapes(plates: readonly number[], unit: WeightUnit = "kg"): PlateShape[] {
  return plates.map((size) => {
    const ratio = Math.min(1, size / REFERENCE[unit]);
    return {
      size,
      heightPct: Math.round(35 + 65 * ratio),
      widthPx: Math.round(10 + 14 * ratio),
      color: plateColor(size, unit),
    };
  });
}

/** "2 × 20 kg, 1 × 5 kg" (or lb) for plates listed heaviest first. */
export function describePlates(plates: readonly number[], unit: WeightUnit = "kg"): string {
  const counts = new Map<number, number>();
  for (const size of plates) counts.set(size, (counts.get(size) ?? 0) + 1);
  return [...counts].map(([size, n]) => `${n} × ${size} ${unit}`).join(", ");
}

const grams = (kg: number) => Math.round(kg * 1000);

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

/**
 * The lightest loadable total at or above `targetKg` (unlimited plates), the
 * counterpart of `nearestLoadable(…, "down")`. Walks up from the load below
 * in steps of the plate pairs' gcd, so odd plate sets are still exact.
 */
export function loadableAbove(
  targetKg: number,
  barKg: number,
  platesKg: readonly number[],
): number | null {
  const sizes = [...new Set(platesKg.map(grams).filter((g) => g > 0))];
  if (sizes.length === 0) return null;
  if (targetKg <= barKg) return barKg;
  const down = nearestLoadable(targetKg, barKg, platesKg, "down");
  if (grams(down) === grams(targetKg)) return down;
  const pairs = sizes.map((g) => 2 * g);
  const unit = pairs.reduce(gcd);
  const reach = Math.max(...pairs);
  for (let g = grams(down) + unit; g <= grams(down) + reach + unit; g += unit) {
    if (grams(nearestLoadable(g / 1000, barKg, platesKg, "down")) === g) return g / 1000;
  }
  return null;
}
