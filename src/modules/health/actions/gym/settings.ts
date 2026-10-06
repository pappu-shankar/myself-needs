"use server";

import { z } from "zod";
import { defineAction, defineFormAction } from "@/modules/core/action/define-action";
import type { ActionState } from "@/modules/core/action/types";
import { zCheckbox, zNumber } from "@/lib/validation";
import { E1RM_FORMULAS, EFFORT_SCALES, SEXES, WEIGHT_UNITS } from "../../gym-types";
import { fromDisplayWeight } from "../../engine/units";
import { updateGymSettings } from "../../service/gym/settings";

export type UpdateGymSettingsState = ActionState;

/** "25, 20, 15" or repeated fields → numbers; anything unparseable fails validation. */
const zPlateList = z
  .union([z.string(), z.array(z.string())])
  .optional()
  .transform((value) =>
    value === undefined
      ? []
      : (Array.isArray(value) ? value : value.split(/[,\s]+/))
          .map((v) => v.trim())
          .filter(Boolean)
          .map(Number),
  )
  .refine((plates) => plates.every(Number.isFinite), "Plate sizes must be numbers");

/** Checkbox group (repeated `ownedEquipment` fields) or one comma-separated value. */
const zEquipmentList = z
  .union([z.string(), z.array(z.string())])
  .optional()
  .transform((value) =>
    value === undefined ? [] : Array.isArray(value) ? value : value.split(","),
  );

/**
 * The gym settings form. It posts every field: blanks clear the optional body
 * facts, unchecked boxes are false, no equipment ticked means "everything".
 */
export const updateGymSettingsAction = defineFormAction(
  z.object({
    sex: z.enum(SEXES).optional(),
    heightCm: zNumber.optional(),
    goalWeightKg: zNumber.optional(),
    effortScale: z.enum(EFFORT_SCALES, { error: "Pick an effort scale" }),
    defaultRestSec: zNumber,
    e1rmFormula: z.enum(E1RM_FORMULAS, { error: "Pick a 1RM formula" }),
    barWeightKg: zNumber,
    platesKg: zPlateList,
    ownedEquipment: zEquipmentList,
    weeklySessionGoal: zNumber,
    sleepTargetHours: zNumber,
    askBodyweightOnStart: zCheckbox,
    keepAwake: zCheckbox,
    restSound: zCheckbox,
    restNotifications: zCheckbox,
    voiceCoach: zCheckbox,
    cameraAutoLog: zCheckbox,
    /** The unit the weight fields were typed in (the user's display unit); converted to kg here. */
    inputUnit: z.enum(WEIGHT_UNITS).default("kg"),
  }),
  ({ inputUnit, ...input }) => {
    const toKg = (value: number) => Math.round(fromDisplayWeight(value, inputUnit) * 1000) / 1000;
    updateGymSettings({
      ...input,
      sex: input.sex ?? null,
      heightCm: input.heightCm ?? null,
      goalWeightKg: input.goalWeightKg === undefined ? null : toKg(input.goalWeightKg),
      barWeightKg: toKg(input.barWeightKg),
      platesKg: input.platesKg.map(toKg),
    });
  },
  { name: "health:gym-update-settings" },
);

/** Single-setting saves from elsewhere (a toggle, the equipment picker): only given fields change. */
export const patchGymSettingsAction = defineAction(
  z
    .object({
      sex: z.enum(SEXES).nullable(),
      heightCm: z.number().nullable(),
      goalWeightKg: z.number().nullable(),
      effortScale: z.enum(EFFORT_SCALES),
      defaultRestSec: z.number(),
      e1rmFormula: z.enum(E1RM_FORMULAS),
      barWeightKg: z.number(),
      platesKg: z.array(z.number()).max(30),
      ownedEquipment: z.array(z.string()).max(100),
      weeklySessionGoal: z.number(),
      sleepTargetHours: z.number(),
      askBodyweightOnStart: z.boolean(),
      keepAwake: z.boolean(),
      restSound: z.boolean(),
      restNotifications: z.boolean(),
      weightUnit: z.enum(WEIGHT_UNITS),
      voiceCoach: z.boolean(),
      cameraAutoLog: z.boolean(),
    })
    .partial(),
  (patch) => {
    updateGymSettings(patch);
  },
  { name: "health:gym-patch-settings" },
);
