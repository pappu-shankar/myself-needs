"use client";

import { useActionState, useId, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2 } from "lucide-react";
import {
  deleteWorkoutAction,
  updateWorkoutMetaAction,
  type UpdateWorkoutMetaState,
} from "@/modules/health/actions/gym/workouts";
import { useActionSuccess } from "@/lib/use-action-success";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormField } from "@/components/ui/form-field";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "../../workout/_components/confirm-dialog";

interface WorkoutActionsProps {
  workout: {
    id: number;
    name: string;
    date: string;
    notes: string | null;
    sessionRpe: number | null;
  };
}

const initialState: UpdateWorkoutMetaState = {};
const EFFORT_LEVELS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

/** "Edit details" (name, date, notes, session effort) and "Delete" for a past workout. */
export function WorkoutActions({ workout }: WorkoutActionsProps) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  async function remove(): Promise<string | null> {
    const result = await deleteWorkoutAction({ workoutId: workout.id });
    if (!result.ok) return result.error ?? "The workout couldn't be deleted.";
    // Same transition as the delete, so the list replaces this page in one step.
    router.push("/health/gym/history");
    return null;
  }

  return (
    <div className="flex shrink-0 gap-2">
      <Button type="button" variant="outline" className="h-10" onClick={() => setEditOpen(true)}>
        <Pencil aria-hidden="true" />
        Edit details
      </Button>
      <Button
        type="button"
        variant="destructive"
        size="icon"
        className="size-10"
        aria-label="Delete workout"
        onClick={() => setDeleteOpen(true)}
      >
        <Trash2 aria-hidden="true" />
      </Button>
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-h-[92svh] overflow-y-auto">
          {editOpen && <MetaForm workout={workout} onSaved={() => setEditOpen(false)} />}
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete this workout?"
        description="It and every set in it are removed from your history, records and stats. This can't be undone."
        confirmLabel="Delete workout"
        pendingLabel="Deleting…"
        onConfirm={remove}
      />
    </div>
  );
}

function MetaForm({
  workout,
  onSaved,
}: {
  workout: WorkoutActionsProps["workout"];
  onSaved: () => void;
}) {
  const [state, formAction, pending] = useActionState(updateWorkoutMetaAction, initialState);
  useActionSuccess(state, onSaved);
  const nameId = useId();
  const dateId = useId();
  const effortId = useId();
  const notesId = useId();
  const values = state.values ?? {};
  const error = (field: string) => state.fieldErrors?.[field]?.[0];

  return (
    <>
      <DialogHeader>
        <DialogTitle>Edit workout details</DialogTitle>
        <DialogDescription>
          Moving it to another date keeps its start time and duration.
        </DialogDescription>
      </DialogHeader>
      <form action={formAction} className="flex flex-col gap-4">
        <input type="hidden" name="workoutId" value={workout.id} />
        <FormField label="Name" htmlFor={nameId} error={error("name")}>
          <Input
            name="name"
            required
            maxLength={200}
            defaultValue={values.name ?? workout.name}
            className="h-10 text-base"
          />
        </FormField>
        <FormField label="Date" htmlFor={dateId} error={error("date")}>
          <Input
            type="date"
            name="date"
            required
            defaultValue={values.date ?? workout.date}
            className="h-10 text-base tabular-nums"
          />
        </FormField>
        <FormField
          label="Session effort"
          htmlFor={effortId}
          hint="How hard the whole session felt, 1–10."
          error={error("sessionRpe")}
        >
          <select
            name="sessionRpe"
            defaultValue={values.sessionRpe ?? (workout.sessionRpe ?? "").toString()}
            className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-10 w-full rounded-lg border px-3 text-base tabular-nums outline-none focus-visible:ring-3"
          >
            <option value="">Not rated</option>
            {EFFORT_LEVELS.map((level) => (
              <option key={level} value={level}>
                {level}
              </option>
            ))}
          </select>
        </FormField>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={notesId}>Notes</Label>
          <textarea
            id={notesId}
            name="notes"
            rows={3}
            maxLength={2000}
            defaultValue={values.notes ?? workout.notes ?? ""}
            className="border-input focus-visible:border-ring focus-visible:ring-ring/50 dark:bg-input/30 w-full rounded-lg border bg-transparent px-2.5 py-2 text-base outline-none focus-visible:ring-3 md:text-sm"
          />
        </div>
        {state.error && !error("name") && !error("date") && !error("sessionRpe") && (
          <p role="alert" className="text-destructive text-sm">
            {state.error}
          </p>
        )}
        <DialogFooter>
          <Button type="submit" variant="default" className="h-10" disabled={pending}>
            {pending ? "Saving…" : "Save details"}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}
