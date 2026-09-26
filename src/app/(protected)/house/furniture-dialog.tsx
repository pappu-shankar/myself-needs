"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FurnitureForm, type FurnitureFormValues } from "./furniture-form";

/** `open`/`onOpenChange` are optional — see room-dialog.tsx's doc comment for why. */
export function FurnitureDialog({
  roomId,
  furniture,
  triggerLabel,
  open: openProp,
  onOpenChange,
}: {
  roomId: number;
  furniture?: FurnitureFormValues;
  triggerLabel?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = openProp ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {triggerLabel && (
        <DialogTrigger
          render={
            <Button
              variant={furniture ? "outline" : "default"}
              size={furniture ? "sm" : "default"}
            />
          }
        >
          {triggerLabel}
        </DialogTrigger>
      )}
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{furniture ? "Edit furniture" : "Add furniture"}</DialogTitle>
          <DialogDescription>
            A simple placeable item in the room, rendered as a colored box — not a 3D model.
          </DialogDescription>
        </DialogHeader>
        <FurnitureForm roomId={roomId} furniture={furniture} onSuccess={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}
