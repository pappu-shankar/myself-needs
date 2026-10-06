"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import type { ActionState } from "@/modules/core/action/types";
import { deleteProgramAction } from "@/modules/health/actions/gym/programs";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useRunAction } from "../routines/use-run-action";

interface ConfirmDeleteButtonProps {
  /** Accessible name of the trigger, e.g. "Delete Summer block". */
  label: string;
  title: string;
  description: string;
  onConfirm: () => Promise<ActionState<unknown>>;
  /** Show the label as visible text instead of an icon-only button. */
  text?: string;
}

export function ConfirmDeleteButton({
  label,
  title,
  description,
  onConfirm,
  text,
}: ConfirmDeleteButtonProps) {
  const [open, setOpen] = useState(false);
  const { pending, error, run } = useRunAction();

  return (
    <>
      <Button
        size={text ? "sm" : "icon-sm"}
        variant="destructive"
        aria-label={label}
        onClick={() => setOpen(true)}
      >
        <Trash2 aria-hidden="true" />
        {text}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          {error && (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={() => run(onConfirm, () => setOpen(false))}
            >
              {pending ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Server pages can't pass functions to client components, so programs get their own wrapper. */
export function DeleteProgramButton({ id, name }: { id: number; name: string }) {
  return (
    <ConfirmDeleteButton
      label={`Delete ${name}`}
      title={`Delete “${name}”?`}
      description="This removes the program record. Logged workouts are not affected."
      onConfirm={() => deleteProgramAction({ id })}
    />
  );
}
