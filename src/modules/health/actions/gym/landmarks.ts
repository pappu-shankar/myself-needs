"use server";

import { z } from "zod";
import { defineAction, defineFormAction } from "@/modules/core/action/define-action";
import type { ActionState } from "@/modules/core/action/types";
import { MUSCLES } from "../../gym-types";
import { clearLandmarkOverride, setLandmarkOverride } from "../../service/gym/landmarks";

const zSets = z.coerce
  .number({ error: "Enter a number of sets" })
  .int({ error: "Whole sets only" })
  .min(0, { error: "0–60 sets" })
  .max(60, { error: "0–60 sets" });

export type SetLandmarkOverrideState = ActionState;

/** Form fields: `muscle`, `mev`, `mavLow`, `mavHigh`, `mrv` — weekly hard sets, each ≥ the one before. */
export const setLandmarkOverrideAction = defineFormAction(
  z
    .object({ muscle: z.enum(MUSCLES), mev: zSets, mavLow: zSets, mavHigh: zSets, mrv: zSets })
    .refine((l) => l.mev <= l.mavLow && l.mavLow <= l.mavHigh && l.mavHigh <= l.mrv, {
      message: "Landmarks must climb: MEV ≤ MAV low ≤ MAV high ≤ MRV",
    }),
  ({ muscle, ...landmark }) => {
    setLandmarkOverride(muscle, landmark);
  },
  { name: "health:set-landmark-override" },
);

export const clearLandmarkOverrideAction = defineAction(
  z.object({ muscle: z.enum(MUSCLES) }),
  ({ muscle }) => {
    clearLandmarkOverride(muscle);
  },
  { name: "health:clear-landmark-override" },
);
