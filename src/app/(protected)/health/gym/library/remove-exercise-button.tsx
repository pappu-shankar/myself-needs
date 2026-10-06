"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive, RotateCcw, Trash2 } from "lucide-react";
import {
  removeCustomExerciseAction,
  restoreCustomExerciseAction,
} from "@/modules/health/actions/gym/exercises";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function RemoveExerciseButton({
  id,
  name,
  archived,
}: {
  id: number;
  name: string;
  archived: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (archived) {
    return (
      <div className="flex flex-col gap-1">
        <Button
          type="button"
          variant="outline"
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              const result = await restoreCustomExerciseAction({ id });
              setError(result.ok ? null : (result.error ?? "Couldn't restore this exercise."));
            })
          }
        >
          <RotateCcw aria-hidden="true" />
          Restore
        </Button>
        {error && (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="destructive" />}>
        <Trash2 aria-hidden="true" />
        Remove
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Remove {name}?</DialogTitle>
          <DialogDescription>
            If it has no history and isn&apos;t in a routine it is deleted. Otherwise it is
            archived: hidden from the library and pickers, but your past workouts keep its name. You
            can restore it from the library&apos;s archived view.
          </DialogDescription>
        </DialogHeader>
        {error && (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        )}
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
          <Button
            type="button"
            variant="destructive"
            disabled={isPending}
            onClick={() =>
              startTransition(async () => {
                const result = await removeCustomExerciseAction({ id });
                if (!result.ok) {
                  setError(result.error ?? "Couldn't remove this exercise.");
                  return;
                }
                setOpen(false);
                if (result.data?.outcome === "deleted") router.push("/health/gym/library");
              })
            }
          >
            <Archive aria-hidden="true" />
            {isPending ? "Removing…" : "Remove"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
