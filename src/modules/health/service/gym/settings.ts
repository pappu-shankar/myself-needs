import { DomainError } from "@/modules/core/errors";
import {
  DEFAULT_BAR_WEIGHT_KG,
  DEFAULT_BAR_WEIGHT_LB,
  DEFAULT_PLATES_KG,
  DEFAULT_PLATES_LB,
  DEFAULT_REST_SEC,
  E1RM_FORMULAS,
  EFFORT_SCALES,
  SEXES,
  WEIGHT_UNITS,
  type E1rmFormula,
  type EffortScale,
  type Sex,
  type WeightUnit,
} from "../../gym-types";
import { lbToKg } from "../../engine/units";
import {
  getGymSettingsRow,
  upsertGymSettings,
  type GymSettingsPatch,
  type GymSettingsRow,
} from "../../db/queries/gym/settings";

/** Gym preferences as every caller sees them — defaults when nothing was saved yet. */
export interface GymSettings {
  sex: Sex | null;
  heightCm: number | null;
  goalWeightKg: number | null;
  effortScale: EffortScale;
  defaultRestSec: number;
  e1rmFormula: E1rmFormula;
  barWeightKg: number;
  /** Distinct plate sizes, heaviest first (pairs are assumed). */
  platesKg: number[];
  /** Lower-case equipment names; empty = "I have everything". */
  ownedEquipment: string[];
  weeklySessionGoal: number;
  sleepTargetHours: number;
  askBodyweightOnStart: boolean;
  keepAwake: boolean;
  restSound: boolean;
  restNotifications: boolean;
  /** Weights are shown and typed in this unit; storage stays kg. */
  weightUnit: WeightUnit;
  /** Camera rep counter speaks counts and cues. */
  voiceCoach: boolean;
  /** Camera rep counter logs the set by itself when you stop moving. */
  cameraAutoLog: boolean;
  /** Null until the first save. */
  updatedAt: string | null;
}

export type GymSettingsUpdate = Partial<Omit<GymSettings, "updatedAt">>;

/** Mirrors the column defaults in db/schema/gym/settings.ts. */
export const DEFAULT_GYM_SETTINGS: Readonly<GymSettings> = Object.freeze({
  sex: null,
  heightCm: null,
  goalWeightKg: null,
  effortScale: "none",
  defaultRestSec: DEFAULT_REST_SEC,
  e1rmFormula: "epley",
  barWeightKg: DEFAULT_BAR_WEIGHT_KG,
  platesKg: [...DEFAULT_PLATES_KG],
  ownedEquipment: [],
  weeklySessionGoal: 3,
  sleepTargetHours: 8,
  askBodyweightOnStart: true,
  keepAwake: true,
  restSound: true,
  restNotifications: false,
  weightUnit: "kg",
  voiceCoach: false,
  cameraAutoLog: true,
  updatedAt: null,
});

/** The standard bar and plates for each unit, in kg. */
const UNIT_EQUIPMENT: Record<WeightUnit, { barKg: number; platesKg: number[] }> = {
  kg: { barKg: DEFAULT_BAR_WEIGHT_KG, platesKg: [...DEFAULT_PLATES_KG] },
  lb: {
    barKg: lbToKg(DEFAULT_BAR_WEIGHT_LB),
    platesKg: DEFAULT_PLATES_LB.map((lb) => Math.round(lbToKg(lb) * 1000) / 1000),
  },
};

const sameGrams = (a: number, b: number) => Math.round(a * 1000) === Math.round(b * 1000);
const samePlates = (a: readonly number[], b: readonly number[]) =>
  a.length === b.length && [...a].sort().every((v, i) => sameGrams(v, [...b].sort()[i]));

function fromRow(row: GymSettingsRow): GymSettings {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { id, ...settings } = row;
  return settings;
}

export function getGymSettings(): GymSettings {
  const row = getGymSettingsRow();
  return row
    ? fromRow(row)
    : {
        ...DEFAULT_GYM_SETTINGS,
        platesKg: [...DEFAULT_GYM_SETTINGS.platesKg],
        ownedEquipment: [],
      };
}

function assertRange(
  value: number,
  min: number,
  max: number,
  message: string,
  integer = false,
): void {
  if (
    !Number.isFinite(value) ||
    value < min ||
    value > max ||
    (integer && !Number.isInteger(value))
  ) {
    throw new DomainError(message);
  }
}

function normalizePlates(plates: readonly number[]): number[] {
  if (plates.some((plate) => !(Number.isFinite(plate) && plate > 0 && plate <= 50))) {
    throw new DomainError("Plates must be more than 0 and at most 50 kg each.");
  }
  // Rounded to grams so 2.5 and 2.50000001 don't count as two sizes.
  const distinct = [...new Set(plates.map((plate) => Math.round(plate * 1000) / 1000))];
  if (distinct.length === 0) throw new DomainError("Add at least one plate size.");
  if (distinct.length > 20) throw new DomainError("That's more plate sizes than any gym has.");
  return distinct.sort((a, b) => b - a);
}

/** Lower-case, trimmed, de-duplicated — the catalog stores equipment in lower case. */
export function normalizeEquipmentList(values: readonly string[]): string[] {
  const list = [...new Set(values.map((v) => v.trim().toLowerCase()).filter(Boolean))];
  if (list.some((v) => v.length > 60))
    throw new DomainError("Equipment names must be at most 60 characters.");
  if (list.length > 60) throw new DomainError("That's too many equipment entries.");
  return list;
}

/** Validates and saves only the fields present in `patch`. */
export function updateGymSettings(patch: GymSettingsUpdate): GymSettings {
  const values: GymSettingsPatch = {};

  if (patch.sex !== undefined) {
    if (patch.sex !== null && !SEXES.includes(patch.sex))
      throw new DomainError("Pick a valid sex.");
    values.sex = patch.sex;
  }
  if (patch.heightCm !== undefined) {
    if (patch.heightCm !== null) {
      assertRange(patch.heightCm, 100, 250, "Height must be between 100 and 250 cm.");
    }
    values.heightCm = patch.heightCm;
  }
  if (patch.goalWeightKg !== undefined) {
    if (patch.goalWeightKg !== null) {
      assertRange(patch.goalWeightKg, 20, 400, "Goal weight must be between 20 and 400 kg.");
    }
    values.goalWeightKg = patch.goalWeightKg;
  }
  if (patch.effortScale !== undefined) {
    if (!EFFORT_SCALES.includes(patch.effortScale))
      throw new DomainError("Pick a valid effort scale.");
    values.effortScale = patch.effortScale;
  }
  if (patch.e1rmFormula !== undefined) {
    if (!E1RM_FORMULAS.includes(patch.e1rmFormula))
      throw new DomainError("Pick a valid 1RM formula.");
    values.e1rmFormula = patch.e1rmFormula;
  }
  if (patch.defaultRestSec !== undefined) {
    assertRange(
      patch.defaultRestSec,
      0,
      900,
      "Rest must be a whole number of seconds from 0 to 900.",
      true,
    );
    values.defaultRestSec = patch.defaultRestSec;
  }
  if (patch.barWeightKg !== undefined) {
    assertRange(patch.barWeightKg, 0, 50, "Bar weight must be between 0 and 50 kg.");
    values.barWeightKg = patch.barWeightKg;
  }
  if (patch.platesKg !== undefined) values.platesKg = normalizePlates(patch.platesKg);
  if (patch.ownedEquipment !== undefined) {
    values.ownedEquipment = normalizeEquipmentList(patch.ownedEquipment);
  }
  if (patch.weeklySessionGoal !== undefined) {
    assertRange(patch.weeklySessionGoal, 1, 14, "Weekly goal must be 1 to 14 sessions.", true);
    values.weeklySessionGoal = patch.weeklySessionGoal;
  }
  if (patch.sleepTargetHours !== undefined) {
    assertRange(patch.sleepTargetHours, 3, 14, "Sleep target must be between 3 and 14 hours.");
    values.sleepTargetHours = patch.sleepTargetHours;
  }
  for (const key of [
    "askBodyweightOnStart",
    "keepAwake",
    "restSound",
    "restNotifications",
    "voiceCoach",
    "cameraAutoLog",
  ] as const) {
    if (patch[key] !== undefined) values[key] = Boolean(patch[key]);
  }
  if (patch.weightUnit !== undefined) {
    if (!WEIGHT_UNITS.includes(patch.weightUnit)) throw new DomainError("Pick kg or lb.");
    values.weightUnit = patch.weightUnit;
    // Switching units on an untouched setup swaps in that unit's standard bar
    // and plates (a 45 lb bar, 45/35/25/10/5/2.5 lb plates); a setup the user
    // customised is left alone.
    const current = getGymSettings();
    if (patch.weightUnit !== current.weightUnit) {
      const from = UNIT_EQUIPMENT[current.weightUnit];
      const to = UNIT_EQUIPMENT[patch.weightUnit];
      if (patch.barWeightKg === undefined && sameGrams(current.barWeightKg, from.barKg)) {
        values.barWeightKg = to.barKg;
      }
      if (patch.platesKg === undefined && samePlates(current.platesKg, from.platesKg)) {
        values.platesKg = normalizePlates(to.platesKg);
      }
    }
  }

  return fromRow(upsertGymSettings(values));
}
