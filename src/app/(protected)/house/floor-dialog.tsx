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
import { FloorForm, type FloorFormValues } from "./floor-form";

export function FloorDialog({
  projectId,
  floor,
  triggerLabel,
}: {
  projectId: number;
  floor?: FloorFormValues;
  triggerLabel: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={<Button variant={floor ? "outline" : "default"} size={floor ? "sm" : "default"} />}
      >
        {triggerLabel}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{floor ? "Edit floor" : "Add floor"}</DialogTitle>
          <DialogDescription>
            Floors stack vertically by level — rooms live inside a floor.
          </DialogDescription>
        </DialogHeader>
        <FloorForm projectId={projectId} floor={floor} onSuccess={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}
