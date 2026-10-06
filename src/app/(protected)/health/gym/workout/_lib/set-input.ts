import type { ExerciseMode, WeightUnit } from "@/modules/health/types";
import {
  formatDuration,
  fromDisplayWeight,
  roundTo,
  toDisplayWeight,
} from "@/modules/health/engine/units";

/**
 * Text ↔ number for the set inputs. Inputs are plain text (`inputMode`
 * picks the phone keypad) so a half-typed value never gets mangled by a
 * number input; these parse on blur/complete and never throw.
 */

export type SetField = "weightKg" | "reps" | "durationSec" | "distanceKm";

export type ParseResult = { ok: true; value: number | null } | { ok: false; error: string };

const MAX_WEIGHT_KG = 1000;
const MAX_REPS = 1000;
const MAX_DISTANCE_KM = 1000;
const MAX_DURATION_SEC = 24 * 3600;

/** Trimmed, with a decimal comma accepted (phone keypads in many locales). */
function clean(text: string): string {
  return text.trim().replace(",", ".");
}

function decimal(text: string): number | null {
  return /^\d*\.?\d+$|^\d+\.$/.test(text) ? Number(text) : null;
}

/** Whole grams — what a weight typed in either unit is stored as. */
function toStoredKg(value: number, unit: WeightUnit): number {
  const kg = Math.round(fromDisplayWeight(value, unit) * 1000) / 1000;
  return kg === 0 ? 0 : kg;
}

/**
 * A weight typed in the display unit, returned in kg (to the gram) — every
 * action takes kg. "225" in lb → 102.058.
 */
export function parseWeight(text: string, unit: WeightUnit = "kg"): ParseResult {
  const value = clean(text);
  if (value === "") return { ok: true, value: null };
  const n = decimal(value);
  const kg = n === null ? null : toStoredKg(n, unit);
  if (kg === null || kg > MAX_WEIGHT_KG) {
    return {
      ok: false,
      error:
        unit === "lb"
          ? "Weight must be a number of lb, like 185."
          : "Weight must be a number of kg, like 82.5.",
    };
  }
  return { ok: true, value: kg };
}

/** A stored kg value as the input shows it: "102.06" kg or "225" lb; "" when empty. */
export function formatWeightInput(kg: number | null, unit: WeightUnit = "kg"): string {
  return kg === null ? "" : String(toDisplayWeight(kg, unit));
}

export function parseReps(text: string): ParseResult {
  const value = clean(text);
  if (value === "") return { ok: true, value: null };
  if (!/^\d+$/.test(value) || Number(value) > MAX_REPS) {
    return { ok: false, error: "Reps must be a whole number." };
  }
  return { ok: true, value: Number(value) };
}

export function parseDistance(text: string): ParseResult {
  const value = clean(text);
  if (value === "") return { ok: true, value: null };
  const n = decimal(value);
  if (n === null || n > MAX_DISTANCE_KM) {
    return { ok: false, error: "Distance must be a number of km, like 5.2." };
  }
  return { ok: true, value: roundTo(n, 3) };
}

/** "1:30" / "1:02:03" → seconds, or null when it isn't clock-shaped. */
function clockSeconds(text: string): number | null {
  const match = /^(?:(\d+):)?(\d+):([0-5]\d)$/.exec(text);
  if (!match) return null;
  const [hours, minutes, seconds] = [Number(match[1] ?? 0), Number(match[2]), Number(match[3])];
  if (match[1] !== undefined && minutes > 59) return null;
  return hours * 3600 + minutes * 60 + seconds;
}

function durationResult(seconds: number | null, error: string): ParseResult {
  if (seconds === null || !Number.isFinite(seconds) || seconds > MAX_DURATION_SEC) {
    return { ok: false, error };
  }
  return { ok: true, value: Math.round(seconds) };
}

/** Timed holds: plain seconds ("45") or a clock ("1:30"). */
export function parseSeconds(text: string): ParseResult {
  const value = clean(text);
  if (value === "") return { ok: true, value: null };
  const seconds = value.includes(":")
    ? clockSeconds(value)
    : /^\d+$/.test(value)
      ? Number(value)
      : null;
  return durationResult(seconds, "Enter seconds, like 45 or 1:30.");
}

/** Cardio: minutes ("30", "30.5") or a clock ("30:15", "1:05:00"). */
export function parseMinutes(text: string): ParseResult {
  const value = clean(text);
  if (value === "") return { ok: true, value: null };
  let seconds: number | null;
  if (value.includes(":")) {
    seconds = clockSeconds(value);
  } else {
    const minutes = decimal(value);
    seconds = minutes === null ? null : minutes * 60;
  }
  return durationResult(seconds, "Enter minutes, like 30 or 30:15.");
}

export interface FieldSpec {
  field: SetField;
  /** Short visible column heading. */
  column: string;
  /** Accessible name suffix, e.g. "weight in kg". */
  label: string;
  inputMode: "decimal" | "numeric";
  parse: (text: string) => ParseResult;
  format: (value: number | null) => string;
}

function formatPlain(value: number | null): string {
  return value === null ? "" : String(roundTo(value, 2));
}

function formatClock(value: number | null): string {
  return value === null ? "" : formatDuration(value);
}

/**
 * The two inputs a set row shows, in order, for an exercise's logging mode.
 * The weight field reads and writes kg but shows and accepts `unit`.
 */
export function fieldsFor(
  mode: ExerciseMode,
  isBodyweight: boolean,
  unit: WeightUnit = "kg",
): [FieldSpec, FieldSpec] {
  const weight: FieldSpec = {
    field: "weightKg",
    column: isBodyweight ? `+${unit}` : unit,
    label: isBodyweight ? `added weight in ${unit}` : `weight in ${unit}`,
    inputMode: "decimal",
    parse: (text) => parseWeight(text, unit),
    format: (value) => formatWeightInput(value, unit),
  };
  if (mode === "time") {
    return [
      {
        field: "durationSec",
        column: "Sec",
        label: "hold in seconds",
        inputMode: "numeric",
        parse: parseSeconds,
        format: formatPlain,
      },
      weight,
    ];
  }
  if (mode === "cardio") {
    return [
      {
        field: "durationSec",
        column: "Time",
        label: "time in minutes",
        inputMode: "decimal",
        parse: parseMinutes,
        format: formatClock,
      },
      {
        field: "distanceKm",
        column: "km",
        label: "distance in km",
        inputMode: "decimal",
        parse: parseDistance,
        format: formatPlain,
      },
    ];
  }
  return [
    weight,
    {
      field: "reps",
      column: "Reps",
      label: "reps",
      inputMode: "numeric",
      parse: parseReps,
      format: formatPlain,
    },
  ];
}

/** The field a set can't be logged without, per mode. */
export function requiredField(mode: ExerciseMode): SetField {
  return mode === "reps" ? "reps" : "durationSec";
}

/** Effort choices for the per-set picker: RIR 0–6, RPE 6–10 in halves. */
export function effortOptions(scale: "rir" | "rpe", current: number | null): number[] {
  const base = scale === "rir" ? [0, 1, 2, 3, 4, 5, 6] : [6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10];
  return current !== null && !base.includes(current)
    ? [...base, current].sort((a, b) => a - b)
    : base;
}

/** A set's effort on the chosen scale, converting a value logged on the other one. */
export function effortOn(
  scale: "rir" | "rpe",
  set: { rir: number | null; rpe: number | null },
): number | null {
  if (scale === "rir") return set.rir ?? (set.rpe !== null ? roundTo(10 - set.rpe, 1) : null);
  return set.rpe ?? (set.rir !== null ? roundTo(10 - set.rir, 1) : null);
}
