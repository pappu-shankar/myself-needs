/**
 * Number hygiene and display for training loads, durations and paces.
 *
 * Loads are snapped in integer grams: `2.5 × 0.9` is 2.2500000000000004 in
 * floating point, and a snap done on that directly can land a step off. Every
 * other file in engine/ rounds through here so a weight never prints as
 * "57.49999 kg".
 */

import type { WeightUnit } from "../gym-types";

const KG_PER_LB = 0.45359237;

const kgFormatter = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });

/** Round half-up to `decimals` places, via exponent notation so 1.005 → 1.01 (not 1.00). */
export function roundTo(n: number, decimals: number): number {
  if (!Number.isFinite(n)) return n;
  const factor = 10 ** decimals;
  // "1.005e2" is exactly 100.5; 1.005 * 100 is 100.49999999999999. Tiny values
  // already print in exponent form ("1e-7"), where the trick doesn't apply.
  const shifted = Number(`${n}e${decimals}`);
  const rounded = Number.isFinite(shifted)
    ? Math.round(shifted) / factor
    : Math.round(n * factor) / factor;
  return rounded === 0 ? 0 : rounded;
}

/** Whole grams; the shared unit every snap works in. */
function grams(kg: number): number {
  return Math.round(kg * 1000);
}

/**
 * Nearest multiple of `step` (halves round up). A step of 0 or less — "no
 * plates configured" — just rounds to 0.1 kg.
 */
export function snapToStep(kg: number, step: number): number {
  const stepG = grams(step);
  if (!(stepG > 0)) return roundTo(kg, 1);
  const snapped = (Math.round(grams(kg) / stepG) * stepG) / 1000;
  return snapped === 0 ? 0 : snapped;
}

/** Largest multiple of `step` not above `kg` — for "never round a load up". */
export function floorToStep(kg: number, step: number): number {
  const stepG = grams(step);
  if (!(stepG > 0)) return Math.floor(grams(kg) / 100) / 10;
  const floored = (Math.floor(grams(kg) / stepG) * stepG) / 1000;
  return floored === 0 ? 0 : floored;
}

/** "62.5 kg", "60 kg", "1,250 kg" — at most two decimals (1.25 kg plates). */
export function formatKg(kg: number): string {
  const rounded = roundTo(kg, 2);
  return `${kgFormatter.format(rounded === 0 ? 0 : rounded)} kg`;
}

/** Pounds to kilograms (international avoirdupois pound), unrounded — callers snap. */
export function lbToKg(lb: number): number {
  return lb * KG_PER_LB;
}

/** Kilograms to pounds, unrounded. */
export function kgToLb(kg: number): number {
  return kg / KG_PER_LB;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * "0:45", "12:05", "1:02:03". Seconds alone read badly past a minute ("90 s"
 * vs "1:30"); hours appear only when there are any. Negative or non-finite
 * input reads as 0:00.
 */
export function formatDuration(sec: number): string {
  const total = Number.isFinite(sec) ? Math.max(0, Math.round(sec)) : 0;
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return hours > 0 ? `${hours}:${pad2(minutes)}:${pad2(seconds)}` : `${minutes}:${pad2(seconds)}`;
}

/** Running/cycling pace: "5:30 /km". "—" when there is no meaningful pace. */
export function formatPace(secPerKm: number): string {
  if (!Number.isFinite(secPerKm) || secPerKm <= 0) return "—";
  return `${formatDuration(secPerKm)} /km`;
}

// ---------------------------------------------------------------------------
// Display unit (kg or lb). Storage is always kg; these convert at the edges.

const lbFormatter = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 1 });

/**
 * A stored kg value in the display unit: kg to 0.01, lb to 0.1 — enough that
 * a load entered as 225 lb (102.058 kg) reads back as exactly 225.
 */
export function toDisplayWeight(kg: number, unit: WeightUnit): number {
  return unit === "lb" ? roundTo(kgToLb(kg), 1) : roundTo(kg, 2);
}

/** A value typed in the display unit, as kg for storage (unrounded — callers snap). */
export function fromDisplayWeight(value: number, unit: WeightUnit): number {
  return unit === "lb" ? lbToKg(value) : value;
}

/** "62.5 kg" or "137.8 lb" for a stored kg value. */
export function formatWeight(kg: number, unit: WeightUnit = "kg"): string {
  if (unit === "kg") return formatKg(kg);
  const lb = toDisplayWeight(kg, "lb");
  return `${lbFormatter.format(lb === 0 ? 0 : lb)} lb`;
}

/**
 * The usual smallest load jump, in kg: 2.5 kg, or 5 lb (a pair of 2.5 lb
 * plates). Steps for lb users are whole pounds converted, so snapping to them
 * keeps loads on round pound numbers.
 */
export function smallestStepKg(unit: WeightUnit): number {
  return unit === "lb" ? lbToKg(5) : 2.5;
}

/** Average speed in km/h, or null without both a distance and a duration. */
export function speedKmh(distanceKm: number | null, durationSec: number | null): number | null {
  if (!distanceKm || !durationSec || distanceKm <= 0 || durationSec <= 0) return null;
  return roundTo(distanceKm / (durationSec / 3600), 1);
}

/** Seconds per km, or null without both a distance and a duration. */
export function paceSecPerKm(distanceKm: number | null, durationSec: number | null): number | null {
  if (!distanceKm || !durationSec || distanceKm <= 0 || durationSec <= 0) return null;
  return Math.round(durationSec / distanceKm);
}
