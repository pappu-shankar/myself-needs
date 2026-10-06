"use server";

import { z } from "zod";
import { defineAction, defineFormAction } from "@/modules/core/action/define-action";
import type { ActionState } from "@/modules/core/action/types";
import {
  zCheckbox,
  zId,
  zIsoDate,
  zNumber,
  zOptionalText,
  zPositiveNumber,
  zText,
} from "@/lib/validation";
import { todayIso } from "@/lib/dates";
import { PROGRAM_KINDS } from "../../gym-types";
import {
  createProgram,
  deleteProgram,
  endProgram,
  updateProgram,
} from "../../service/gym/programs";
import { deleteTrainingMax, setTrainingMax } from "../../service/gym/training-maxes";

export type CreateProgramState = ActionState<{ id: number }>;
export type UpdateProgramState = ActionState;
export type SetTrainingMaxState = ActionState<{ id: number }>;

const programFields = {
  name: zText("Name", 100),
  startDate: zIsoDate,
  weeks: zNumber,
  setRampPerWeek: zNumber.optional(),
  deloadFinalWeek: zCheckbox,
  notes: zOptionalText(1000),
};

/** Starting a program completes whichever one was active. */
export const createProgramAction = defineFormAction(
  z.object({ ...programFields, kind: z.enum(PROGRAM_KINDS, { error: "Pick a program type" }) }),
  (input) => ({
    id: createProgram({
      ...input,
      setRampPerWeek: input.setRampPerWeek ?? 0,
      notes: input.notes ?? null,
    }).id,
  }),
  { name: "health:gym-create-program" },
);

export const updateProgramAction = defineFormAction(
  z.object({ id: zId, ...programFields }),
  ({ id, ...input }) => {
    updateProgram(id, {
      ...input,
      setRampPerWeek: input.setRampPerWeek ?? 0,
      notes: input.notes ?? null,
    });
  },
  { name: "health:gym-update-program" },
);

export const endProgramAction = defineAction(
  z.object({ id: zId, status: z.enum(["completed", "archived"]) }),
  ({ id, status }) => {
    endProgram(id, status);
  },
  { name: "health:gym-end-program" },
);

export const deleteProgramAction = defineAction(
  z.object({ id: zId }),
  ({ id }) => {
    deleteProgram(id);
  },
  { name: "health:gym-delete-program" },
);

/** Effective date defaults to today; the same lift and date again replaces the value. */
export const setTrainingMaxAction = defineFormAction(
  z.object({
    exerciseId: zId,
    trainingMaxKg: zPositiveNumber,
    effectiveFrom: zIsoDate.optional(),
    note: zOptionalText(200),
  }),
  (input) => ({
    id: setTrainingMax({
      exerciseId: input.exerciseId,
      trainingMaxKg: input.trainingMaxKg,
      effectiveFrom: input.effectiveFrom ?? todayIso(),
      note: input.note ?? null,
    }).id,
  }),
  { name: "health:gym-set-training-max" },
);

export const deleteTrainingMaxAction = defineAction(
  z.object({ id: zId }),
  ({ id }) => {
    deleteTrainingMax(id);
  },
  { name: "health:gym-delete-training-max" },
);
