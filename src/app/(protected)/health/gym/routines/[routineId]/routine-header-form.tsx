"use client";

import { useActionState, useState } from "react";
import {
  updateRoutineAction,
  type UpdateRoutineState,
} from "@/modules/health/actions/gym/routines";
import {
  POLICY_DESCRIPTIONS,
  POLICY_LABELS,
  PROGRESSION_POLICIES,
  type ProgressionPolicy,
} from "@/modules/health/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";

const initialState: UpdateRoutineState = {};

interface RoutineHeaderFormProps {
  id: number;
  name: string;
  notes: string | null;
  progressionPolicy: ProgressionPolicy;
}

/** Name, notes and the routine-wide default progression rule. */
export function RoutineHeaderForm({ id, name, notes, progressionPolicy }: RoutineHeaderFormProps) {
  const [state, formAction, pending] = useActionState(updateRoutineAction, initialState);
  const [policy, setPolicy] = useState(progressionPolicy);

  return (
    <form action={formAction} className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2">
      <input type="hidden" name="id" value={id} />
      <FormField label="Name" htmlFor="routine-name" error={state.fieldErrors?.name?.[0]}>
        <Input name="name" required maxLength={100} defaultValue={state.values?.name ?? name} />
      </FormField>
      <FormField
        label="Default progression rule"
        htmlFor="routine-policy"
        hint="Exercises follow this unless they set their own rule."
      >
        <select
          name="progressionPolicy"
          value={policy}
          onChange={(e) => setPolicy(e.target.value as ProgressionPolicy)}
          className="border-input bg-background h-8 rounded-md border px-3 text-sm"
        >
          {PROGRESSION_POLICIES.filter((p) => p !== "time").map((p) => (
            <option key={p} value={p}>
              {POLICY_LABELS[p]}
            </option>
          ))}
        </select>
      </FormField>
      <p className="text-muted-foreground text-sm sm:col-span-2" aria-live="polite">
        {POLICY_DESCRIPTIONS[policy]}
      </p>
      <FormField
        label="Notes"
        htmlFor="routine-notes"
        className="sm:col-span-2"
        error={state.fieldErrors?.notes?.[0]}
      >
        <textarea
          name="notes"
          rows={2}
          maxLength={1000}
          defaultValue={state.values?.notes ?? notes ?? ""}
          className="border-input bg-background min-h-16 rounded-md border px-3 py-2 text-sm"
        />
      </FormField>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <Button type="submit" variant="default" disabled={pending}>
          {pending ? "Saving…" : "Save routine"}
        </Button>
        {state.ok && (
          <span role="status" className="text-sm">
            Saved.
          </span>
        )}
        {state.error && !state.fieldErrors && (
          <span role="alert" className="text-destructive text-sm">
            {state.error}
          </span>
        )}
      </div>
    </form>
  );
}
