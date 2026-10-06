"use server";

import { z } from "zod";
import { defineAction, defineFormAction } from "@/modules/core/action/define-action";
import type { ActionState } from "@/modules/core/action/types";
import { zId, zIsoDate, zNumber, zOptionalText, zText } from "@/lib/validation";
import { EXERCISE_MODES, SET_KINDS, TRACKED_BY } from "../../gym-types";
import {
  addSet,
  addWorkoutEntry,
  completeSet,
  deleteSet,
  deleteWorkout,
  discardWorkout,
  finishWorkout,
  removeWorkoutEntry,
  reorderWorkoutEntries,
  uncompleteSet,
  updateSet,
  updateWorkoutEntry,
  updateWorkoutMeta,
} from "../../service/gym/workouts";

/*
 * Live-session actions are called from event handlers with plain objects
 * (`defineAction`); finishing and editing a workout's details are forms
 * (`defineFormAction`). Range rules live in the service, whose DomainError
 * messages come back as `error`.
 */

/** A value the user can also clear: number = set, null = clear, absent = leave alone. */
const zClearableNumber = z.number({ error: "Enter a number" }).nullable().optional();

const setValues = {
  kind: z.enum(SET_KINDS).optional(),
  weightKg: zClearableNumber,
  reps: zClearableNumber,
  durationSec: zClearableNumber,
  distanceKm: zClearableNumber,
  rir: zClearableNumber,
  rpe: zClearableNumber,
};

// ---------------------------------------------------------------------------
// Sets

export const addSetAction = defineAction(
  z.object({ entryId: zId, ...setValues }),
  ({ entryId, ...values }) => addSet(entryId, values),
  { name: "health:add-set" },
);

export const updateSetAction = defineAction(
  z.object({ setId: zId, ...setValues }),
  ({ setId, ...values }) => updateSet(setId, values),
  { name: "health:update-set" },
);

/** Marks a set done (with whatever values the user just entered). */
export const completeSetAction = defineAction(
  z.object({
    setId: zId,
    ...setValues,
    trackedBy: z.enum(TRACKED_BY).optional(),
    romScore: zClearableNumber,
  }),
  ({ setId, ...values }) => completeSet(setId, values),
  { name: "health:complete-set" },
);

export const uncompleteSetAction = defineAction(
  z.object({ setId: zId }),
  ({ setId }) => uncompleteSet(setId),
  { name: "health:uncomplete-set" },
);

export const deleteSetAction = defineAction(
  z.object({ setId: zId }),
  ({ setId }) => {
    deleteSet(setId);
  },
  { name: "health:delete-set" },
);

// ---------------------------------------------------------------------------
// Entries

export const addWorkoutEntryAction = defineAction(
  z.object({
    workoutId: zId,
    exerciseId: zId,
    mode: z.enum(EXERCISE_MODES).optional(),
    perSide: z.boolean().optional(),
    supersetGroup: zClearableNumber,
    restSec: zClearableNumber,
    notes: z.string().nullable().optional(),
  }),
  ({ workoutId, exerciseId, ...opts }) => addWorkoutEntry(workoutId, exerciseId, opts),
  { name: "health:add-workout-entry" },
);

export const removeWorkoutEntryAction = defineAction(
  z.object({ entryId: zId }),
  ({ entryId }) => {
    removeWorkoutEntry(entryId);
  },
  { name: "health:remove-workout-entry" },
);

/** `orderedIds` = every entry of the workout, in the new order. */
export const reorderWorkoutEntriesAction = defineAction(
  z.object({ workoutId: zId, orderedIds: z.array(zId).min(1) }),
  ({ workoutId, orderedIds }) => {
    reorderWorkoutEntries(workoutId, orderedIds);
  },
  { name: "health:reorder-workout-entries" },
);

export const updateWorkoutEntryAction = defineAction(
  z.object({
    entryId: zId,
    notes: z.string().nullable().optional(),
    restSec: zClearableNumber,
    supersetGroup: zClearableNumber,
  }),
  ({ entryId, ...patch }) => updateWorkoutEntry(entryId, patch),
  { name: "health:update-workout-entry" },
);

// ---------------------------------------------------------------------------
// The workout

const zSessionRpe = zNumber.refine((n) => n >= 1 && n <= 10, "Session RPE is 1–10").optional();

export type FinishWorkoutState = ActionState<{ id: number }>;

/** Form fields: `workoutId`, optional `sessionRpe` (1–10) and `notes`. */
export const finishWorkoutAction = defineFormAction(
  z.object({ workoutId: zId, sessionRpe: zSessionRpe, notes: zOptionalText(2000) }),
  ({ workoutId, sessionRpe, notes }) => {
    const finished = finishWorkout(workoutId, { sessionRpe, notes });
    return { id: finished.id };
  },
  { name: "health:finish-workout" },
);

export const discardWorkoutAction = defineAction(
  z.object({ workoutId: zId }),
  ({ workoutId }) => {
    discardWorkout(workoutId);
  },
  { name: "health:discard-workout" },
);

export const deleteWorkoutAction = defineAction(
  z.object({ workoutId: zId }),
  ({ workoutId }) => {
    deleteWorkout(workoutId);
  },
  { name: "health:delete-workout" },
);

export type UpdateWorkoutMetaState = ActionState;

/**
 * History edit form: `workoutId`, `name`, `date`, `notes`, `sessionRpe`. The
 * form carries every field, so a blank notes/RPE clears it.
 */
export const updateWorkoutMetaAction = defineFormAction(
  z.object({
    workoutId: zId,
    name: zText("Name"),
    date: zIsoDate,
    notes: zOptionalText(2000),
    sessionRpe: zSessionRpe,
  }),
  ({ workoutId, name, date, notes, sessionRpe }) => {
    updateWorkoutMeta(workoutId, {
      name,
      date,
      notes: notes ?? null,
      sessionRpe: sessionRpe ?? null,
    });
  },
  { name: "health:update-workout-meta" },
);
