"use server";

import { z } from "zod";
import { defineAction, defineFormAction } from "@/modules/core/action/define-action";
import type { ActionState } from "@/modules/core/action/types";
import { zId, zIsoDate, zOptionalText } from "@/lib/validation";
import {
  clearScheduleOverride,
  setScheduleOverride,
  setWeekdayRoutine,
} from "../../service/gym/schedule";

export type SetWeekdayRoutineState = ActionState;
export type SetScheduleOverrideState = ActionState;

const zWeekday = z.coerce
  .number({ error: "Pick a day of the week" })
  .int({ error: "Pick a day of the week" })
  .min(0, { error: "Pick a day of the week" })
  .max(6, { error: "Pick a day of the week" });

/** A blank (or "rest") routine select means no routine. */
const zRoutineChoice = z
  .union([z.literal("rest"), zId])
  .optional()
  .transform((value) => (value === undefined || value === "rest" ? null : value));

export const setWeekdayRoutineAction = defineFormAction(
  z.object({ weekday: zWeekday, routineId: zRoutineChoice }),
  ({ weekday, routineId }) => {
    setWeekdayRoutine(weekday, routineId);
  },
  { name: "health:gym-set-weekday" },
);

/** Plans a routine on one date, or a rest day when no routine is chosen. */
export const setScheduleOverrideAction = defineFormAction(
  z.object({ date: zIsoDate, routineId: zRoutineChoice, note: zOptionalText(200) }),
  ({ date, routineId, note }) => {
    setScheduleOverride(date, routineId, note ?? null);
  },
  { name: "health:gym-set-override" },
);

export const clearScheduleOverrideAction = defineAction(
  z.object({ date: zIsoDate }),
  ({ date }) => {
    clearScheduleOverride(date);
  },
  { name: "health:gym-clear-override" },
);
