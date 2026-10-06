"use server";

import { z } from "zod";
import { defineAction, defineFormAction } from "@/modules/core/action/define-action";
import type { ActionState } from "@/modules/core/action/types";
import { zId, zIsoDate, zNumber, zOptionalText } from "@/lib/validation";
import { MEASUREMENT_SITES, type MeasurementSite } from "../../gym-types";
import { logBodyweight } from "../../service/gym/vitals";
import { addMeasurements, deleteMeasurement } from "../../service/gym/measurements";

export type LogBodyweightState = ActionState;

/** Form fields: `date`, `weightKg` (20–400), optional `note`. */
export const logBodyweightAction = defineFormAction(
  z.object({
    date: zIsoDate,
    weightKg: zNumber.refine((n) => n >= 20 && n <= 400, "Enter a weight between 20 and 400 kg"),
    note: zOptionalText(500),
  }),
  ({ date, weightKg, note }) => {
    logBodyweight(date, weightKg, note);
  },
  { name: "health:log-bodyweight" },
);

export type AddMeasurementsState = ActionState;

const siteFields = Object.fromEntries(
  MEASUREMENT_SITES.map((site) => [site, zNumber.optional()]),
) as Record<MeasurementSite, z.ZodOptional<typeof zNumber>>;

/**
 * Form fields: `date`, optional `note`, and one optional number input per
 * site, named by its `MeasurementSite` key (`waist`, `body_fat_pct` …). Blank
 * sites are skipped; the service checks each value's range.
 */
export const addMeasurementsAction = defineFormAction(
  z.object({ date: zIsoDate, note: zOptionalText(500), ...siteFields }),
  (input) => {
    const entries = MEASUREMENT_SITES.flatMap((site) => {
      const value = input[site];
      return value === undefined ? [] : [{ site, value }];
    });
    addMeasurements({ date: input.date, entries, note: input.note });
  },
  { name: "health:add-measurements" },
);

export const deleteMeasurementAction = defineAction(
  z.object({ id: zId }),
  ({ id }) => {
    deleteMeasurement(id);
  },
  { name: "health:delete-measurement" },
);
