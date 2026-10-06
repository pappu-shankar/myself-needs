"use server";

import { z } from "zod";
import { defineAction, defineFormAction } from "@/modules/core/action/define-action";
import type { ActionState } from "@/modules/core/action/types";
import { zCheckbox, zId, zOptionalText, zText } from "@/lib/validation";
import { BODY_PARTS, EXERCISE_MODES } from "../../gym-types";
import {
  createCustomExercise,
  removeCustomExercise,
  restoreCustomExercise,
  setExerciseFavorite,
  updateCustomExercise,
  updateExerciseNotes,
  type CustomExerciseInput,
  type RemoveExerciseOutcome,
} from "../../service/gym/exercises";

export type CreateCustomExerciseState = ActionState<{ id: number }>;
export type UpdateCustomExerciseState = ActionState;
export type UpdateExerciseNotesState = ActionState;
export type RemoveCustomExerciseState = ActionState<{ outcome: RemoveExerciseOutcome }>;

/** Comma-separated text or repeated fields (multi-select / checkboxes). */
const zTermList = z
  .union([z.string(), z.array(z.string())])
  .optional()
  .transform((value) =>
    value === undefined
      ? []
      : (Array.isArray(value) ? value : value.split(",")).map((v) => v.trim()),
  );

/** A textarea, one step per line. */
const zSteps = z
  .string()
  .max(15_000, "Instructions are too long")
  .optional()
  .transform((value) => (value ? value.split(/\r?\n/) : []));

const customExerciseFields = {
  name: zText("Name", 100),
  bodyPart: z.enum(BODY_PARTS, { error: "Pick a body part" }),
  equipment: zOptionalText(60),
  target: zOptionalText(60),
  secondaryMuscles: zTermList,
  defaultMode: z.enum(EXERCISE_MODES, { error: "Pick how it's logged" }).optional(),
  isBodyweight: zCheckbox,
  isUnilateral: zCheckbox,
  instructions: zSteps,
  notes: zOptionalText(2000),
};

function toInput(fields: z.output<z.ZodObject<typeof customExerciseFields>>): CustomExerciseInput {
  return { ...fields, equipment: fields.equipment ?? null, target: fields.target ?? null };
}

export const createCustomExerciseAction = defineFormAction(
  z.object(customExerciseFields),
  (input) => ({ id: createCustomExercise(toInput(input)).id }),
  { name: "health:gym-create-exercise" },
);

export const updateCustomExerciseAction = defineFormAction(
  z.object({ id: zId, ...customExerciseFields }),
  ({ id, ...input }) => {
    updateCustomExercise(id, toInput(input));
  },
  { name: "health:gym-update-exercise" },
);

/** Works for built-in and custom exercises alike; a blank note clears it. */
export const updateExerciseNotesAction = defineFormAction(
  z.object({ id: zId, notes: zOptionalText(2000) }),
  ({ id, notes }) => {
    updateExerciseNotes(id, notes ?? null);
  },
  { name: "health:gym-exercise-notes" },
);

export const setExerciseFavoriteAction = defineAction(
  z.object({ id: zId, favorite: z.boolean() }),
  ({ id, favorite }) => {
    setExerciseFavorite(id, favorite);
  },
  { name: "health:gym-favorite-exercise" },
);

/** Deletes a custom exercise, or archives it if routines or history still use it. */
export const removeCustomExerciseAction = defineAction(
  z.object({ id: zId }),
  ({ id }) => removeCustomExercise(id),
  { name: "health:gym-remove-exercise" },
);

export const restoreCustomExerciseAction = defineAction(
  z.object({ id: zId }),
  ({ id }) => {
    restoreCustomExercise(id);
  },
  { name: "health:gym-restore-exercise" },
);
