"use server";

import { z } from "zod";
import { defineAction, defineFormAction } from "@/modules/core/action/define-action";
import type { ActionState } from "@/modules/core/action/types";
import { zId, zIsoDate, zPositiveNumber } from "@/lib/validation";
import { addWarmupSets, startWorkout } from "../../service/gym/session-plan";

export type StartWorkoutState = ActionState<{ id: number }>;

/** Opens today's (or an empty) session; the client navigates to /health/gym/workout on success. */
export const startWorkoutAction = defineFormAction(
  z.object({
    routineId: zId.optional(),
    date: zIsoDate.optional(),
    bodyweightKg: zPositiveNumber.optional(),
  }),
  (input) => ({ id: startWorkout(input).id }),
  { name: "health:start-workout" },
);

export const addWarmupSetsAction = defineAction(
  z.object({ entryId: z.number().int().positive() }),
  ({ entryId }) => ({ added: addWarmupSets(entryId) }),
  { name: "health:add-warmup-sets" },
);
