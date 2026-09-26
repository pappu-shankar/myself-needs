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
import { FixtureForm, type FixtureFormValues } from "./fixture-form";

export function FixtureDialog({
  floorId,
  fixture,
  triggerLabel,
}: {
  floorId: number;
  fixture?: FixtureFormValues;
  triggerLabel: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant={fixture ? "outline" : "default"} size={fixture ? "sm" : "default"} />
        }
      >
        {triggerLabel}
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{fixture ? "Edit fixture" : "Add fixture"}</DialogTitle>
          <DialogDescription>
            A point-like utility element on the floor&apos;s plan — not tied to any one room.
          </DialogDescription>
        </DialogHeader>
        <FixtureForm floorId={floorId} fixture={fixture} onSuccess={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}
