"use client";

import { useState, useTransition } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  pendingLabel?: string;
  cancelLabel?: string;
  /** Runs inside a transition; resolve with an error message to keep the dialog open, or null. */
  onConfirm: () => Promise<string | null>;
}

/** "Are you sure?" for the destructive actions (discard, delete, remove). */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  pendingLabel = "Working…",
  cancelLabel = "Cancel",
  onConfirm,
}: ConfirmDialogProps) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function change(next: boolean) {
    if (pending) return;
    setError(null);
    onOpenChange(next);
  }

  function confirm() {
    setError(null);
    startTransition(async () => {
      let message: string | null;
      try {
        message = await onConfirm();
      } catch {
        message = "Couldn't reach the app. Check the connection and try again.";
      }
      if (message) setError(message);
      else onOpenChange(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={change}>
      <DialogContent showCloseButton={false}>
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
          <Button
            type="button"
            variant="ghost"
            className="h-10"
            disabled={pending}
            onClick={() => change(false)}
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant="destructive"
            className="h-10"
            disabled={pending}
            onClick={confirm}
          >
            {pending ? pendingLabel : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
