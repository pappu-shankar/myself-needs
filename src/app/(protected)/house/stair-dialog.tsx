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
import { StairForm, type StairFormValues } from "./stair-form";
import type { FloorFormValues } from "./floor-form";

export function StairDialog({
  projectId,
  floors,
  stair,
  triggerLabel,
}: {
  projectId: number;
  floors: FloorFormValues[];
  stair?: StairFormValues;
  triggerLabel: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={<Button variant={stair ? "outline" : "default"} size={stair ? "sm" : "default"} />}
      >
        {triggerLabel}
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{stair ? "Edit stair flight" : "Add stair flight"}</DialogTitle>
          <DialogDescription>
            One straight flight connecting two floors. A switchback stair is entered as two or more
            adjacent flights.
          </DialogDescription>
        </DialogHeader>
        <StairForm
          projectId={projectId}
          floors={floors}
          stair={stair}
          onSuccess={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
