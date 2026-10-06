"use client";

import { useRef, useState } from "react";
import { Camera, LoaderCircle, Upload } from "lucide-react";
import { PHOTO_POSE_LABELS, type PhotoPose } from "@/modules/health/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PhotoCamera } from "./photo-camera";
import { PhotoCompare } from "./photo-compare";
import { PhotoGallery, type GalleryPhoto } from "./photo-gallery";
import { ghostSource } from "./photo-helpers";
import { PhotoError, processUpload, type CapturedPhoto } from "./photo-image";
import { PhotoReview } from "./photo-review";

type Mode =
  | { kind: "idle" }
  | { kind: "camera" }
  | { kind: "processing" }
  | { kind: "review"; photo: CapturedPhoto };

export interface PhotosViewProps {
  pose: PhotoPose;
  /** This pose's photos, newest first. */
  photos: GalleryPhoto[];
  total: number;
  today: string;
}

export function PhotosView({ pose, photos, total, today }: PhotosViewProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<Mode>({ kind: "idle" });
  const [message, setMessage] = useState<{ text: string; tone: "status" | "alert" } | null>(null);
  const ghost = ghostSource(photos)?.landmarks ?? null;
  const label = PHOTO_POSE_LABELS[pose].toLowerCase();

  function chooseFile() {
    setMessage(null);
    fileRef.current?.click();
  }

  async function onFile(file: File | undefined) {
    if (fileRef.current) fileRef.current.value = "";
    if (!file) return;
    setMode({ kind: "processing" });
    try {
      setMode({ kind: "review", photo: await processUpload(file) });
    } catch (error) {
      setMode({ kind: "idle" });
      setMessage({
        tone: "alert",
        text: error instanceof PhotoError ? error.message : "Couldn't process that image.",
      });
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            disabled={mode.kind !== "idle"}
            onClick={() => {
              setMessage(null);
              setMode({ kind: "camera" });
            }}
          >
            <Camera aria-hidden="true" />
            Take photo
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={mode.kind !== "idle"}
            onClick={chooseFile}
          >
            <Upload aria-hidden="true" />
            Upload photo
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            aria-label={`Upload a ${label} photo`}
            onChange={(e) => void onFile(e.target.files?.[0])}
          />
        </div>

        {message && (
          <p
            role={message.tone}
            className={
              message.tone === "alert"
                ? "text-destructive text-sm"
                : "text-muted-foreground text-sm"
            }
          >
            {message.text}
          </p>
        )}

        {mode.kind === "processing" && (
          <p role="status" className="text-muted-foreground flex items-center gap-2 text-sm">
            <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
            Preparing the photo…
          </p>
        )}

        {(mode.kind === "camera" || mode.kind === "review") && (
          <Card>
            <CardContent>
              {mode.kind === "camera" ? (
                <PhotoCamera
                  pose={pose}
                  ghost={ghost}
                  onCaptured={(photo) => setMode({ kind: "review", photo })}
                  onCancel={() => setMode({ kind: "idle" })}
                />
              ) : (
                <PhotoReview
                  photo={mode.photo}
                  pose={pose}
                  today={today}
                  onRetake={() => {
                    if (mode.photo.source === "camera") setMode({ kind: "camera" });
                    else {
                      setMode({ kind: "idle" });
                      chooseFile();
                    }
                  }}
                  onCancel={() => setMode({ kind: "idle" })}
                  onSaved={() => {
                    setMode({ kind: "idle" });
                    setMessage({ tone: "status", text: "Photo saved." });
                  }}
                />
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {photos.length >= 2 && (
        <section aria-labelledby="compare-heading">
          <Card>
            <CardHeader>
              <CardTitle id="compare-heading" className="text-base font-medium">
                Compare
              </CardTitle>
            </CardHeader>
            <CardContent>
              <PhotoCompare pose={pose} photos={photos} />
            </CardContent>
          </Card>
        </section>
      )}

      <section aria-labelledby="gallery-heading">
        <h2 id="gallery-heading" className="mb-4 text-lg font-semibold tracking-tight">
          {PHOTO_POSE_LABELS[pose]} photos
        </h2>
        <PhotoGallery pose={pose} photos={photos} total={total} />
      </section>
    </div>
  );
}
