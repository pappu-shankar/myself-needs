"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { finishWorkoutAction } from "@/modules/health/actions/gym/workouts";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { setRest } from "../_hooks/rest-timer-store";

const EFFORT_LEVELS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

interface FinishDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workoutId: number;
  setsDone: number;
  setsOpen: number;
}

/** Session effort + notes, then on to the workout's summary in history. */
export function FinishDialog({
  open,
  onOpenChange,
  workoutId,
  setsDone,
  setsOpen,
}: FinishDialogProps) {
  const router = useRouter();
  const [effort, setEffort] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const notesId = useId();
  const hintId = useId();

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setError(null);
    // One transition for the save and the navigation: the summary replaces
    // the logger in a single commit, with no flash of the start screen.
    startTransition(async () => {
      let result: Awaited<ReturnType<typeof finishWorkoutAction>>;
      try {
        result = await finishWorkoutAction({}, formData);
      } catch {
        result = { error: "Couldn't reach the app — the workout is still open. Try again." };
      }
      if (result.ok && result.data) {
        setRest(null);
        router.push(`/health/gym/history/${result.data.id}`);
      } else {
        setError(result.error ?? "The workout couldn't be finished.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent className="max-h-[92svh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Finish workout</DialogTitle>
          <DialogDescription className="tabular-nums">
            {setsDone} {setsDone === 1 ? "set" : "sets"} done
            {setsOpen > 0
              ? ` · ${setsOpen} not done ${setsOpen === 1 ? "stays" : "stay"} in the log as skipped`
              : ""}
            .
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <input type="hidden" name="workoutId" value={workoutId} />
          <fieldset className="flex flex-col gap-2" aria-describedby={hintId}>
            <legend className="text-sm font-medium">Session effort (optional)</legend>
            <p id={hintId} className="text-muted-foreground text-sm">
              How hard was the whole session, all things considered? 1 is barely any effort, 10 is
              as hard as you can go. It feeds your training-load chart.
            </p>
            <div className="grid grid-cols-5 gap-2">
              {EFFORT_LEVELS.map((level) => (
                <label key={level} className="relative">
                  <input
                    type="radio"
                    name="sessionRpe"
                    value={level}
                    checked={effort === level}
                    onChange={() => setEffort(level)}
                    className="peer sr-only"
                  />
                  <span
                    className={cn(
                      "border-input flex h-10 cursor-pointer items-center justify-center rounded-lg border text-base font-medium tabular-nums transition-colors",
                      "peer-checked:border-primary peer-checked:bg-primary peer-checked:text-primary-foreground",
                      "peer-focus-visible:ring-ring/50 peer-focus-visible:ring-3",
                    )}
                  >
                    {level}
                  </span>
                </label>
              ))}
            </div>
            {effort !== null && (
              <Button
                type="button"
                variant="link"
                className="h-8 self-start px-0"
                onClick={() => setEffort(null)}
              >
                Clear effort
              </Button>
            )}
          </fieldset>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={notesId}>Notes (optional)</Label>
            <textarea
              id={notesId}
              name="notes"
              rows={3}
              maxLength={2000}
              className="border-input focus-visible:border-ring focus-visible:ring-ring/50 dark:bg-input/30 w-full rounded-lg border bg-transparent px-2.5 py-2 text-base outline-none focus-visible:ring-3 md:text-sm"
            />
          </div>
          {error && (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              className="h-10"
              disabled={pending}
              onClick={() => onOpenChange(false)}
            >
              Keep training
            </Button>
            <Button type="submit" variant="default" className="h-10" disabled={pending}>
              {pending ? "Saving…" : "Finish and save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
