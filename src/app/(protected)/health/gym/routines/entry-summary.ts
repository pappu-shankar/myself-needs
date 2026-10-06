import { formatDuration, formatWeight } from "@/modules/health/engine/units";
import {
  LOADING_SCHEME_LABELS,
  POLICY_LABELS,
  type ExerciseMode,
  type LoadingScheme,
  type ProgressionPolicy,
} from "@/modules/health/types";
import type { WeightUnit } from "@/modules/health/gym-types";

export interface SummaryEntry {
  mode: ExerciseMode;
  sets: number;
  reps: number | null;
  repsMin: number | null;
  weightKg: number | null;
  durationSec: number | null;
  distanceKm: number | null;
  restSec: number | null;
  perSide: boolean;
  isBodyweight: boolean;
  effectivePolicy: ProgressionPolicy;
  scheme: LoadingScheme;
}

/** "8–10" for a rep range, "8" for a fixed count, "?" when unset. */
export function repsLabel(reps: number | null, repsMin: number | null): string {
  if (reps === null) return repsMin === null ? "?" : String(repsMin);
  if (repsMin !== null && repsMin < reps) return `${repsMin}–${reps}`;
  return String(reps);
}

/**
 * One line describing a routine entry, e.g.
 * "3 × 8–10 · 60 kg · rest 2:00 · Double progression".
 */
export function summarizeEntry(entry: SummaryEntry, unit: WeightUnit = "kg"): string {
  const parts: string[] = [];
  const side = entry.perSide ? " per side" : "";
  if (entry.mode === "reps") {
    parts.push(`${entry.sets} × ${repsLabel(entry.reps, entry.repsMin)}${side}`);
    if (entry.isBodyweight) {
      parts.push(
        entry.weightKg ? `bodyweight + ${formatWeight(entry.weightKg, unit)}` : "bodyweight",
      );
    } else if (entry.weightKg) {
      parts.push(formatWeight(entry.weightKg, unit));
    }
  } else if (entry.mode === "time") {
    parts.push(
      `${entry.sets} × ${entry.durationSec ? formatDuration(entry.durationSec) : "?"}${side}`,
    );
    if (entry.weightKg) parts.push(formatWeight(entry.weightKg, unit));
  } else {
    parts.push(entry.durationSec ? formatDuration(entry.durationSec) : "Cardio");
    if (entry.distanceKm) parts.push(`${entry.distanceKm} km`);
  }
  if (entry.restSec !== null) parts.push(`rest ${formatDuration(entry.restSec)}`);
  if (entry.scheme !== "standard") parts.push(LOADING_SCHEME_LABELS[entry.scheme]);
  else if (entry.mode !== "cardio") parts.push(POLICY_LABELS[entry.effectivePolicy]);
  return parts.join(" · ");
}

export interface SupersetGroupItem {
  id: number;
  supersetGroup: number | null;
}

/** Groups adjacent items sharing a non-null supersetGroup; everything else is its own group. */
export function groupSupersets<T extends SupersetGroupItem>(items: readonly T[]): T[][] {
  const groups: T[][] = [];
  for (const item of items) {
    const last = groups[groups.length - 1];
    if (
      last &&
      item.supersetGroup !== null &&
      last[last.length - 1].supersetGroup === item.supersetGroup
    ) {
      last.push(item);
    } else {
      groups.push([item]);
    }
  }
  return groups;
}

/** The ids with the item at `index` moved by `delta`, or null when it can't move. */
export function movedOrder(ids: readonly number[], index: number, delta: -1 | 1): number[] | null {
  const target = index + delta;
  if (index < 0 || index >= ids.length || target < 0 || target >= ids.length) return null;
  const next = [...ids];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}
