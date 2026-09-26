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
import { OpeningForm, type OpeningFormValues } from "./opening-form";

/** `open`/`onOpenChange` are optional — see room-dialog.tsx's doc comment for why. */
export function OpeningDialog({
  roomId,
  opening,
  triggerLabel,
  open: openProp,
  onOpenChange,
}: {
  roomId: number;
  opening?: OpeningFormValues;
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
            <Button variant={opening ? "outline" : "default"} size={opening ? "sm" : "default"} />
          }
        >
          {triggerLabel}
        </DialogTrigger>
      )}
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{opening ? "Edit opening" : "Add opening"}</DialogTitle>
          <DialogDescription>
            A door or window on one of the room&apos;s 4 walls, offset from that wall&apos;s start
            corner.
          </DialogDescription>
        </DialogHeader>
        <OpeningForm roomId={roomId} opening={opening} onSuccess={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}
