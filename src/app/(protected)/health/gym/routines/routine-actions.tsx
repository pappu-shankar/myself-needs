"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, Copy, Trash2 } from "lucide-react";
import {
  archiveRoutineAction,
  deleteRoutineAction,
  duplicateRoutineAction,
  restoreRoutineAction,
} from "@/modules/health/actions/gym/routines";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useRunAction } from "./use-run-action";

interface RoutineActionsProps {
  id: number;
  name: string;
  archived: boolean;
  /** Where to go after deleting (the editor sends you back to the list). */
  afterDelete?: string;
}

/** Duplicate / archive-restore / delete for one routine. */
export function RoutineActions({ id, name, archived, afterDelete }: RoutineActionsProps) {
  const router = useRouter();
  const { pending, error, run } = useRunAction();
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          disabled={pending}
          aria-label={`Duplicate ${name}`}
          onClick={() => run(() => duplicateRoutineAction({ id }))}
        >
          <Copy aria-hidden="true" /> Duplicate
        </Button>
        {archived ? (
          <Button
            size="sm"
            disabled={pending}
            aria-label={`Restore ${name}`}
            onClick={() => run(() => restoreRoutineAction({ id }))}
          >
            <ArchiveRestore aria-hidden="true" /> Restore
          </Button>
        ) : (
          <Button
            size="sm"
            disabled={pending}
            aria-label={`Archive ${name}`}
            onClick={() => run(() => archiveRoutineAction({ id }))}
          >
            <Archive aria-hidden="true" /> Archive
          </Button>
        )}
        <Button
          size="sm"
          variant="destructive"
          disabled={pending}
          aria-label={`Delete ${name}`}
          onClick={() => setConfirming(true)}
        >
          <Trash2 aria-hidden="true" /> Delete
        </Button>
      </div>
      {error && !confirming && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete “{name}”?</DialogTitle>
            <DialogDescription>
              This removes the routine and its exercises. Workouts you already logged keep their own
              copy. Archive it instead to hide it without losing anything.
            </DialogDescription>
          </DialogHeader>
          {error && (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button onClick={() => setConfirming(false)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={() =>
                run(
                  () => deleteRoutineAction({ id }),
                  () => {
                    setConfirming(false);
                    if (afterDelete) router.push(afterDelete);
                  },
                )
              }
            >
              {pending ? "Deleting…" : "Delete routine"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
