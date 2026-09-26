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
import { RoomForm, type RoomFormValues } from "./room-form";

/**
 * `open`/`onOpenChange` are optional — pass them to drive the dialog
 * externally (e.g. a click-to-select in the 3D viewer, see house-workspace.tsx)
 * with no visible trigger button (`triggerLabel` then omitted). Every
 * existing table-row usage is unaffected, since omitting them falls back to
 * the dialog's own internal open state, same as before.
 */
export function RoomDialog({
  floorId,
  room,
  triggerLabel,
  open: openProp,
  onOpenChange,
}: {
  floorId: number;
  room?: RoomFormValues;
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
          render={<Button variant={room ? "outline" : "default"} size={room ? "sm" : "default"} />}
        >
          {triggerLabel}
        </DialogTrigger>
      )}
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{room ? "Edit room" : "Add room"}</DialogTitle>
          <DialogDescription>
            Position and dimensions are in meters, relative to the floor&apos;s origin corner.
          </DialogDescription>
        </DialogHeader>
        <RoomForm floorId={floorId} room={room} onSuccess={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}
