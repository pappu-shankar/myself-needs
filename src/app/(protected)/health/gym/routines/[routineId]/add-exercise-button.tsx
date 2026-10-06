"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { addRoutineEntryAction } from "@/modules/health/actions/gym/routines";
import { Button } from "@/components/ui/button";
import { ExercisePicker } from "../../_components/exercise-picker";
import { useRunAction } from "../use-run-action";

export function AddExerciseButton({ routineId }: { routineId: number }) {
  const [open, setOpen] = useState(false);
  const { pending, error, run } = useRunAction();

  return (
    <div className="flex flex-col gap-1">
      <div>
        <Button variant="default" disabled={pending} onClick={() => setOpen(true)}>
          <Plus aria-hidden="true" /> Add exercise
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
      <ExercisePicker
        open={open}
        onOpenChange={setOpen}
        onPick={(exercise) => {
          const formData = new FormData();
          formData.set("routineId", String(routineId));
          formData.set("exerciseId", String(exercise.id));
          run(() => addRoutineEntryAction({}, formData));
          setOpen(false);
        }}
      />
    </div>
  );
}
