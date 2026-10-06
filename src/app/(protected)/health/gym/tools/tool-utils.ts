import {
  fromDisplayWeight,
  formatWeight,
  smallestStepKg,
  toDisplayWeight,
} from "@/modules/health/engine/units";
import type { WeightUnit } from "@/modules/health/types";

/** A positive finite number from a text field, or null when blank/invalid. */
export function parsePositive(text: string): number | null {
  const n = Number(text.trim());
  return text.trim() !== "" && Number.isFinite(n) && n > 0 ? n : null;
}

/** "25, 20 15" → [25, 20, 15]; null if anything isn't a positive number. */
export function parsePlates(text: string): number[] | null {
  const parts = text.split(/[,\s]+/).filter(Boolean);
  const plates = parts.map(Number);
  return plates.every((p) => Number.isFinite(p) && p > 0) ? plates : null;
}

/** The smallest jump the plates allow (a pair of the lightest plate); 2.5 kg / 5 lb without plates. */
export function loadStepKg(platesKg: readonly number[], unit: WeightUnit = "kg"): number {
  const smallest = Math.min(...platesKg.filter((p) => p > 0));
  return Number.isFinite(smallest) ? Math.round(smallest * 2 * 1000) / 1000 : smallestStepKg(unit);
}

/** A weight typed in the display unit, as kg for the engine functions. */
export function typedToKg(value: number | null, unit: WeightUnit): number | null {
  return value === null ? null : fromDisplayWeight(value, unit);
}

/** A value already in the display unit, printed with its unit ("225 lb"). */
export function formatInUnit(value: number, unit: WeightUnit): string {
  return formatWeight(fromDisplayWeight(value, unit), unit);
}

/** The settings' kg plates/bar as numbers in the display unit. */
export function plateSizesInUnit(platesKg: readonly number[], unit: WeightUnit): number[] {
  return platesKg.map((p) => toDisplayWeight(p, unit));
}
