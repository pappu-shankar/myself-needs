import { useOptimistic, useState, useTransition } from "react";
import type { WorkoutDetailEntry } from "@/modules/health";
import type { SetKind, TrackedBy } from "@/modules/health/types";
import {
  addSetAction,
  completeSetAction,
  deleteSetAction,
  removeWorkoutEntryAction,
  reorderWorkoutEntriesAction,
  uncompleteSetAction,
  updateSetAction,
} from "@/modules/health/actions/gym/workouts";
import { applyOp, type Op } from "../_lib/ops";

/**
 * A workout's sets with optimistic edits. Every change shows instantly and
 * stays shown until the server confirms (the action's refresh then brings the
 * real rows); a failed save rolls the change back and leaves an error under
 * the key it belongs to (`set:<id>` / `entry:<id>`), so nothing is silently
 * lost — the row keeps what was typed and the user can try again.
 */

export interface SetValues {
  kind?: SetKind;
  weightKg?: number | null;
  reps?: number | null;
  durationSec?: number | null;
  distanceKm?: number | null;
  rir?: number | null;
  rpe?: number | null;
}

export interface CompleteExtras {
  trackedBy?: TrackedBy;
  romScore?: number | null;
}

/** What every gym action resolves to (the `ActionState` shape). */
export interface ActionResult<T = unknown> {
  ok?: boolean;
  error?: string;
  data?: T;
}

const UNREACHABLE =
  "Couldn't reach the app, so this wasn't saved. Check the connection and try again.";

export function useWorkoutSets(entries: WorkoutDetailEntry[]) {
  const [optimistic, addOptimistic] = useOptimistic(entries, applyOp);
  const [pending, startTransition] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});

  function setError(key: string, message: string | null) {
    setErrors((prev) => {
      if (!message && !(key in prev)) return prev;
      const next = { ...prev };
      if (message) next[key] = message;
      else delete next[key];
      return next;
    });
  }

  function run<T>(
    key: string,
    op: Op | null,
    call: () => Promise<ActionResult<T>>,
  ): Promise<ActionResult<T>> {
    setError(key, null);
    return new Promise((resolve) => {
      startTransition(async () => {
        if (op) addOptimistic(op);
        let result: ActionResult<T>;
        try {
          result = await call();
        } catch {
          result = { error: UNREACHABLE };
        }
        if (!result.ok) setError(key, result.error ?? "That change wasn't saved.");
        resolve(result);
      });
    });
  }

  return {
    entries: optimistic,
    pending,
    errors,
    clearError: (key: string) => setError(key, null),

    updateSet: (setId: number, values: SetValues) =>
      run(`set:${setId}`, { type: "patch", setId, patch: values }, () =>
        updateSetAction({ setId, ...values }),
      ),

    completeSet: (setId: number, values: SetValues, extras: CompleteExtras = {}) =>
      run(
        `set:${setId}`,
        { type: "patch", setId, patch: { ...values, ...extras, completed: true } },
        () => completeSetAction({ setId, ...values, ...extras }),
      ),

    uncompleteSet: (setId: number) =>
      run(`set:${setId}`, { type: "patch", setId, patch: { completed: false } }, () =>
        uncompleteSetAction({ setId }),
      ),

    deleteSet: (setId: number) =>
      run(`set:${setId}`, { type: "remove-set", setId }, () => deleteSetAction({ setId })),

    /** Not optimistic — the new row needs its id from the server. */
    addSet: (entryId: number, values: SetValues = {}) =>
      run(`entry:${entryId}`, null, () => addSetAction({ entryId, ...values })),

    removeEntry: (entryId: number) =>
      run(`entry:${entryId}`, { type: "remove-entry", entryId }, () =>
        removeWorkoutEntryAction({ entryId }),
      ),

    moveEntry: (workoutId: number, entryId: number, direction: -1 | 1) => {
      const ids = optimistic.map((entry) => entry.id);
      const from = ids.indexOf(entryId);
      const to = from + direction;
      if (from < 0 || to < 0 || to >= ids.length) {
        return Promise.resolve<ActionResult<undefined>>({ ok: true });
      }
      [ids[from], ids[to]] = [ids[to], ids[from]];
      return run(`entry:${entryId}`, { type: "order", entryIds: ids }, () =>
        reorderWorkoutEntriesAction({ workoutId, orderedIds: ids }),
      );
    },
  };
}

export type WorkoutSets = ReturnType<typeof useWorkoutSets>;
