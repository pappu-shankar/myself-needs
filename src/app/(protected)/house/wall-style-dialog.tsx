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
import { WallStyleForm, type WallStyleFormValues } from "./wall-style-form";

export function WallStyleDialog({
  roomId,
  wallStyle,
  triggerLabel,
}: {
  roomId: number;
  wallStyle?: WallStyleFormValues;
  triggerLabel: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant={wallStyle ? "outline" : "default"} size={wallStyle ? "sm" : "default"} />
        }
      >
        {triggerLabel}
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{wallStyle ? "Edit wall style" : "Add wall style"}</DialogTitle>
          <DialogDescription>
            Override one of the room&apos;s 4 walls to be open or a railing instead of solid — for
            balcony edges and open-concept landings.
          </DialogDescription>
        </DialogHeader>
        <WallStyleForm roomId={roomId} wallStyle={wallStyle} onSuccess={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}
