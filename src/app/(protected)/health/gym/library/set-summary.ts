import { formatDuration, formatKg, formatWeight } from "@/modules/health/engine/units";
import type { WeightUnit } from "@/modules/health/gym-types";

/** A bare number in the formatter's style ("62.5", "1,250"). */
const num = (value: number, unit: WeightUnit = "kg") =>
  formatWeight(value, unit).replace(/ (kg|lb)$/, "");
const distanceNum = (value: number) => formatKg(value).replace(/ kg$/, "");

interface SummarySet {
  kind: string;
  weightKg: number | null;
  reps: number | null;
  durationSec: number | null;
  distanceKm: number | null;
  completed: boolean;
}

/** One completed set as text: "80 × 5", "BW × 12", "+10 × 8", "45s", "5 km · 25:00". */
export function formatSet(
  set: SummarySet,
  isBodyweight = false,
  unit: WeightUnit = "kg",
): string | null {
  if (!set.completed) return null;
  const hasWeight = set.weightKg !== null && set.weightKg > 0;
  if (set.reps !== null) {
    const load = hasWeight
      ? isBodyweight
        ? `+${num(set.weightKg!, unit)}`
        : num(set.weightKg!, unit)
      : isBodyweight
        ? "BW"
        : "—";
    return `${load} × ${set.reps}`;
  }
  if (set.distanceKm !== null) {
    const distance = `${distanceNum(set.distanceKm)} km`;
    return set.durationSec ? `${distance} · ${formatDuration(set.durationSec)}` : distance;
  }
  if (set.durationSec !== null) {
    const time = formatDuration(set.durationSec);
    return hasWeight ? `${time} @ ${num(set.weightKg!, unit)}` : time;
  }
  return null;
}

/** "80 × 5, 80 × 5, 82.5 × 4" — completed working sets only; warm-ups are left out. */
export function formatSetsSummary(
  sets: readonly SummarySet[],
  isBodyweight = false,
  unit: WeightUnit = "kg",
): string {
  const parts = sets
    .filter((s) => s.kind !== "warmup")
    .map((s) => formatSet(s, isBodyweight, unit))
    .filter((s): s is string => s !== null);
  return parts.length ? parts.join(", ") : "—";
}
