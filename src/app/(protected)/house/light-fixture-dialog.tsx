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
import { LightFixtureForm, type LightFixtureFormValues } from "./light-fixture-form";

/** `open`/`onOpenChange` are optional — see room-dialog.tsx's doc comment for why. */
export function LightFixtureDialog({
  roomId,
  lightFixture,
  triggerLabel,
  open: openProp,
  onOpenChange,
}: {
  roomId: number;
  lightFixture?: LightFixtureFormValues;
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
              variant={lightFixture ? "outline" : "default"}
              size={lightFixture ? "sm" : "default"}
            />
          }
        >
          {triggerLabel}
        </DialogTrigger>
      )}
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{lightFixture ? "Edit light fixture" : "Add light fixture"}</DialogTitle>
          <DialogDescription>
            An actual light source in the room — rendered as a fixture marker and a real light that
            illuminates the scene.
          </DialogDescription>
        </DialogHeader>
        <LightFixtureForm
          roomId={roomId}
          lightFixture={lightFixture}
          onSuccess={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
