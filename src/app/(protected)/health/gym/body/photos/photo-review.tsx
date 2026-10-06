"use client";

import { useId, useState, useTransition } from "react";
import { Check, Info, RotateCcw, X } from "lucide-react";
import { addProgressPhotoAction } from "@/modules/health/actions/gym/progress-photos";
import { PHOTO_POSE_LABELS, type PhotoPose } from "@/modules/health/types";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import type { CapturedPhoto } from "./photo-image";

export interface PhotoReviewProps {
  photo: CapturedPhoto;
  pose: PhotoPose;
  today: string;
  onRetake: () => void;
  onCancel: () => void;
  onSaved: () => void;
}

/** Preview of a just-taken or uploaded photo, with date/note, then Save or Retake. */
export function PhotoReview({ photo, pose, today, onRetake, onCancel, onSaved }: PhotoReviewProps) {
  const dateId = useId();
  const noteId = useId();
  const [date, setDate] = useState(today);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await addProgressPhotoAction({
        date,
        pose,
        imageBase64: photo.base64,
        mimeType: photo.mimeType,
        width: photo.width,
        height: photo.height,
        landmarks: photo.landmarks,
        note: note.trim() || undefined,
      });
      if (!result.ok) {
        setError(result.error ?? "Couldn't save the photo.");
        return;
      }
      onSaved();
    });
  }

  let poseNote: string;
  if (photo.landmarks)
    poseNote = "Body position found — used to line this photo up in comparisons.";
  else if (photo.poseUnavailable)
    poseNote = "The pose model couldn't run, so this photo can't be auto-aligned in comparisons.";
  else poseNote = "No body found in this photo, so it can't be auto-aligned in comparisons.";

  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-base font-medium">
        Review {PHOTO_POSE_LABELS[pose].toLowerCase()} photo
      </h3>
      <div
        className="bg-muted mx-auto overflow-hidden rounded-lg"
        style={{
          aspectRatio: photo.width / photo.height,
          width: `min(100%, calc(60vh * ${photo.width / photo.height}))`,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- a local data: URL preview, not an optimizable asset */}
        <img
          src={photo.previewUrl}
          alt={`Preview of the new ${PHOTO_POSE_LABELS[pose].toLowerCase()} photo`}
          className="h-full w-full object-contain"
        />
      </div>
      <p className="text-muted-foreground flex items-start gap-2 text-sm">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        {poseNote}
      </p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField label="Date" htmlFor={dateId}>
          <Input
            id={dateId}
            type="date"
            required
            max={today}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </FormField>
        <FormField label="Note" htmlFor={noteId} hint="Optional">
          <Input
            id={noteId}
            type="text"
            maxLength={500}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </FormField>
      </div>
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="button" disabled={pending || !date} onClick={save}>
          <Check aria-hidden="true" />
          {pending ? "Saving…" : "Save photo"}
        </Button>
        <Button type="button" variant="outline" disabled={pending} onClick={onRetake}>
          <RotateCcw aria-hidden="true" />
          {photo.source === "camera" ? "Retake" : "Choose another"}
        </Button>
        <Button type="button" variant="ghost" disabled={pending} onClick={onCancel}>
          <X aria-hidden="true" />
          Discard
        </Button>
      </div>
    </div>
  );
}
