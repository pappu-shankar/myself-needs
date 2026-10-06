"use client";

import { useActionState } from "react";
import {
  updateExerciseNotesAction,
  type UpdateExerciseNotesState,
} from "@/modules/health/actions/gym/exercises";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";

const initialState: UpdateExerciseNotesState = {};

export function NotesForm({ id, notes }: { id: number; notes: string | null }) {
  const [state, formAction, isPending] = useActionState(updateExerciseNotesAction, initialState);

  return (
    <form action={formAction} className="grid gap-3">
      <input type="hidden" name="id" value={id} />
      <FormField
        label="Notes"
        htmlFor={`notes-${id}`}
        hint="Seat height, grip, cues — shown only to you. Leave blank to clear."
        error={state.fieldErrors?.notes?.[0]}
      >
        <textarea
          name="notes"
          rows={3}
          maxLength={2000}
          defaultValue={state.values?.notes ?? notes ?? ""}
          className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 w-full rounded-lg border px-2.5 py-1.5 text-base outline-none focus-visible:ring-3 md:text-sm"
        />
      </FormField>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={isPending} className="w-fit">
          {isPending ? "Saving…" : "Save notes"}
        </Button>
        {state.ok && (
          <p role="status" className="text-muted-foreground text-sm">
            Saved.
          </p>
        )}
        {state.error && (
          <p role="alert" className="text-destructive text-sm">
            {state.error}
          </p>
        )}
      </div>
    </form>
  );
}
