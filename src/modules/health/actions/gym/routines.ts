"use server";

import { z } from "zod";
import { defineAction, defineFormAction } from "@/modules/core/action/define-action";
import type { ActionState } from "@/modules/core/action/types";
import { zCheckbox, zId, zNumber, zOptionalText, zText } from "@/lib/validation";
import { EXERCISE_MODES, LOADING_SCHEMES, PROGRESSION_POLICIES } from "../../gym-types";
import {
  addRoutineEntry,
  archiveRoutine,
  createRoutine,
  deleteRoutine,
  duplicateRoutine,
  linkSuperset,
  removeRoutineEntry,
  reorderRoutineEntries,
  restoreRoutine,
  unlinkSuperset,
  updateRoutine,
  updateRoutineEntry,
} from "../../service/gym/routines";
import { applyTemplate } from "../../service/gym/templates";

export type CreateRoutineState = ActionState<{ id: number }>;
export type UpdateRoutineState = ActionState;
export type DuplicateRoutineState = ActionState<{ id: number }>;
export type AddRoutineEntryState = ActionState<{ id: number }>;
export type UpdateRoutineEntryState = ActionState;
export type ApplyTemplateState = ActionState<{ routineIds: number[] }>;

const routineFields = {
  name: zText("Name", 100),
  notes: zOptionalText(1000),
  progressionPolicy: z.enum(PROGRESSION_POLICIES, { error: "Pick a progression rule" }).optional(),
};

export const createRoutineAction = defineFormAction(
  z.object(routineFields),
  (input) => ({ id: createRoutine({ ...input, notes: input.notes ?? null }).id }),
  { name: "health:gym-create-routine" },
);

export const updateRoutineAction = defineFormAction(
  z.object({ id: zId, ...routineFields }),
  ({ id, ...input }) => {
    updateRoutine(id, { ...input, notes: input.notes ?? null });
  },
  { name: "health:gym-update-routine" },
);

export const duplicateRoutineAction = defineAction(
  z.object({ id: zId }),
  ({ id }) => ({ id: duplicateRoutine(id).id }),
  { name: "health:gym-duplicate-routine" },
);

export const archiveRoutineAction = defineAction(
  z.object({ id: zId }),
  ({ id }) => {
    archiveRoutine(id);
  },
  { name: "health:gym-archive-routine" },
);

export const restoreRoutineAction = defineAction(
  z.object({ id: zId }),
  ({ id }) => {
    restoreRoutine(id);
  },
  { name: "health:gym-restore-routine" },
);

/** Hard delete; logged workouts keep their own copy of the name. */
export const deleteRoutineAction = defineAction(
  z.object({ id: zId }),
  ({ id }) => {
    deleteRoutine(id);
  },
  { name: "health:gym-delete-routine" },
);

/** Appends an exercise with its default prescription (form with hidden ids, or FormData from a picker). */
export const addRoutineEntryAction = defineFormAction(
  z.object({ routineId: zId, exerciseId: zId }),
  ({ routineId, exerciseId }) => ({ id: addRoutineEntry(routineId, exerciseId).id }),
  { name: "health:gym-add-routine-entry" },
);

/**
 * The full entry editor. Every field is posted: a blank number clears it,
 * unchecked boxes are false, progression "inherit" (or blank) follows the routine.
 */
export const updateRoutineEntryAction = defineFormAction(
  z.object({
    id: zId,
    mode: z.enum(EXERCISE_MODES, { error: "Pick how it's logged" }),
    sets: zNumber,
    reps: zNumber.optional(),
    repsMin: zNumber.optional(),
    weightKg: zNumber.optional(),
    durationSec: zNumber.optional(),
    distanceKm: zNumber.optional(),
    restSec: zNumber.optional(),
    perSide: zCheckbox,
    isBodyweight: zCheckbox,
    progressionPolicy: z.union([z.enum(PROGRESSION_POLICIES), z.literal("inherit")]).optional(),
    incrementKg: zNumber.optional(),
    targetRpe: zNumber.optional(),
    scheme: z.enum(LOADING_SCHEMES).optional(),
    notes: zOptionalText(500),
  }),
  ({ id, progressionPolicy, scheme, ...fields }) => {
    updateRoutineEntry(id, {
      mode: fields.mode,
      sets: fields.sets,
      reps: fields.reps ?? null,
      repsMin: fields.repsMin ?? null,
      weightKg: fields.weightKg ?? null,
      durationSec: fields.durationSec ?? null,
      distanceKm: fields.distanceKm ?? null,
      restSec: fields.restSec ?? null,
      perSide: fields.perSide,
      isBodyweight: fields.isBodyweight,
      progressionPolicy:
        progressionPolicy === undefined || progressionPolicy === "inherit"
          ? null
          : progressionPolicy,
      incrementKg: fields.incrementKg ?? null,
      targetRpe: fields.targetRpe ?? null,
      scheme: scheme ?? "standard",
      notes: fields.notes ?? null,
    });
  },
  { name: "health:gym-update-routine-entry" },
);

const nullableNumber = z.number().nullable().optional();

/** Inline edits (a sets stepper, a mode toggle): only the fields given change; null clears. */
export const patchRoutineEntryAction = defineAction(
  z.object({
    id: zId,
    patch: z.object({
      mode: z.enum(EXERCISE_MODES).optional(),
      sets: z.number().optional(),
      reps: nullableNumber,
      repsMin: nullableNumber,
      weightKg: nullableNumber,
      durationSec: nullableNumber,
      distanceKm: nullableNumber,
      restSec: nullableNumber,
      perSide: z.boolean().optional(),
      isBodyweight: z.boolean().optional(),
      progressionPolicy: z.enum(PROGRESSION_POLICIES).nullable().optional(),
      incrementKg: nullableNumber,
      targetRpe: nullableNumber,
      scheme: z.enum(LOADING_SCHEMES).optional(),
      notes: z.string().max(500).nullable().optional(),
    }),
  }),
  ({ id, patch }) => {
    updateRoutineEntry(id, patch);
  },
  { name: "health:gym-patch-routine-entry" },
);

export const removeRoutineEntryAction = defineAction(
  z.object({ id: zId }),
  ({ id }) => {
    removeRoutineEntry(id);
  },
  { name: "health:gym-remove-routine-entry" },
);

/** `entryIds` must be exactly the routine's entries in their new order. */
export const reorderRoutineEntriesAction = defineAction(
  z.object({ routineId: zId, entryIds: z.array(zId).max(500) }),
  ({ routineId, entryIds }) => {
    reorderRoutineEntries(routineId, entryIds);
  },
  { name: "health:gym-reorder-routine" },
);

/** Pairs the entry with the one after it. */
export const linkSupersetAction = defineAction(
  z.object({ entryId: zId }),
  ({ entryId }) => {
    linkSuperset(entryId);
  },
  { name: "health:gym-link-superset" },
);

export const unlinkSupersetAction = defineAction(
  z.object({ entryId: zId }),
  ({ entryId }) => {
    unlinkSuperset(entryId);
  },
  { name: "health:gym-unlink-superset" },
);

/** Creates a starter program's routines; `assignWeek` also replaces the weekly plan. */
export const applyTemplateAction = defineAction(
  z.object({ key: z.string().min(1).max(40), assignWeek: z.boolean() }),
  ({ key, assignWeek }) => applyTemplate(key, { assignWeek }),
  { name: "health:gym-apply-template" },
);
