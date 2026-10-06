"use client";

import type { ComponentType } from "react";
import dynamic from "next/dynamic";
import type { CameraMovement } from "@/modules/health/types";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type {
  RepCounterPanelProps,
  RepCounterResult,
} from "../../_components/camera/rep-counter-panel";

/**
 * The panel's props plus the voice-coach and hands-free options, typed here
 * too so this dialog compiles whether or not the panel declares them yet.
 */
type PanelProps = RepCounterPanelProps & {
  /** Initial state of the panel's voice-coach toggle. */
  voiceCoach?: boolean;
  /** Call `onFinish` by itself a few seconds after the set ends (cancelable). */
  autoFinish?: boolean;
};

// Loaded on first open only — the logger shouldn't pay for the camera UI up front
// (the panel itself defers MediaPipe until the camera starts).
const RepCounterPanel: ComponentType<PanelProps> = dynamic(
  () => import("../../_components/camera/rep-counter-panel").then((m) => m.RepCounterPanel),
  {
    ssr: false,
    loading: () => <p className="text-muted-foreground text-sm">Loading the rep counter…</p>,
  },
);

interface CameraDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  exerciseName: string;
  targetReps?: number;
  defaultMovement?: CameraMovement;
  /** Which set "Use N reps" will log, e.g. "set 3". */
  setName: string;
  /** Speak rep counts and form cues (gym setting; toggleable in the panel). */
  voiceCoach: boolean;
  /** Hands-free: log the counted set by itself once movement stops. */
  autoLog: boolean;
  /** Logs the set exactly like ✓ (rest timer included); the dialog closes itself. */
  onCounted: (result: RepCounterResult) => void;
}

export function CameraDialog({
  open,
  onOpenChange,
  exerciseName,
  targetReps,
  defaultMovement,
  setName,
  voiceCoach,
  autoLog,
  onCounted,
}: CameraDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Count reps — {exerciseName}</DialogTitle>
          <DialogDescription>
            Counted on this device; video never leaves it. &ldquo;Use reps&rdquo; logs {setName} as
            counted by the camera
            {autoLog ? " — or just stop moving and it's logged after a short countdown" : ""}.
          </DialogDescription>
        </DialogHeader>
        {open && (
          <RepCounterPanel
            compact
            targetReps={targetReps}
            defaultMovement={defaultMovement}
            voiceCoach={voiceCoach}
            autoFinish={autoLog}
            onFinish={(result) => {
              onCounted(result);
              onOpenChange(false);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
