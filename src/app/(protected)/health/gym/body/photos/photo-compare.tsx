"use client";

import { useId, useState } from "react";
import { PHOTO_POSE_LABELS, type PhotoPose } from "@/modules/health/types";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  alignTransform,
  daysApart,
  defaultComparePair,
  photoDate,
  transformCss,
  type AlignTransform,
} from "./photo-helpers";
import { photoSrc, type GalleryPhoto } from "./photo-gallery";

/**
 * Two photos of one pose, side by side or as a wipe overlay. When both have
 * landmarks the second ("after") photo is scaled/shifted so its shoulders
 * and hips sit where the first's do, so changes read as body changes rather
 * than camera distance. Without landmarks: plain side by side only.
 */

type View = "side" | "overlay";

const selectClass = "border-input bg-background h-8 w-full rounded-md border px-2 text-sm";

/** The "after" photo laid over a box with the "before" photo's aspect ratio. */
function AlignedAfter({ photo, transform }: { photo: GalleryPhoto; transform: AlignTransform }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- served from a session-gated Route Handler
    <img
      src={photoSrc(photo.id)}
      alt=""
      className="absolute top-0 left-0 w-full max-w-none"
      style={{ transform: transformCss(transform), transformOrigin: "0 0" }}
    />
  );
}

function Caption({ photo, role }: { photo: GalleryPhoto; role: string }) {
  return (
    <figcaption className="text-muted-foreground mt-1 text-center text-sm">
      {role} · <time dateTime={photo.date}>{photoDate(photo.date)}</time>
    </figcaption>
  );
}

export function PhotoCompare({ pose, photos }: { pose: PhotoPose; photos: GalleryPhoto[] }) {
  const beforeId = useId();
  const afterId = useId();
  const sliderId = useId();
  const defaults = defaultComparePair(photos);
  const [chosen, setChosen] = useState<{ before: number | null; after: number | null }>({
    before: null,
    after: null,
  });
  const [view, setView] = useState<View>("side");
  const [reveal, setReveal] = useState(50);

  if (!defaults) return null;
  const find = (id: number | null) => photos.find((p) => p.id === id);
  const before = find(chosen.before) ?? find(defaults[0])!;
  const after = find(chosen.after) ?? find(defaults[1])!;
  const transform = alignTransform(before, after);
  const shownView: View = transform ? view : "side";
  const label = PHOTO_POSE_LABELS[pose].toLowerCase();
  const beforeAspect = before.width / before.height;

  const options = photos.map((p) => (
    <option key={p.id} value={p.id}>
      {photoDate(p.date)}
      {p.note ? ` — ${p.note.slice(0, 40)}` : ""}
    </option>
  ));

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={beforeId}>Before</Label>
          <select
            id={beforeId}
            className={selectClass}
            value={before.id}
            onChange={(e) => setChosen((c) => ({ ...c, before: Number(e.target.value) }))}
          >
            {options}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={afterId}>After</Label>
          <select
            id={afterId}
            className={selectClass}
            value={after.id}
            onChange={(e) => setChosen((c) => ({ ...c, after: Number(e.target.value) }))}
          >
            {options}
          </select>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm">
          <span className="font-medium">{photoDate(before.date)}</span> →{" "}
          <span className="font-medium">{photoDate(after.date)}</span>
          <span className="text-muted-foreground"> · {daysApart(before.date, after.date)}</span>
        </p>
        <div role="group" aria-label="Comparison view" className="flex gap-1">
          <Button
            type="button"
            size="sm"
            variant={shownView === "side" ? "default" : "ghost"}
            aria-pressed={shownView === "side"}
            onClick={() => setView("side")}
          >
            Side by side
          </Button>
          <Button
            type="button"
            size="sm"
            variant={shownView === "overlay" ? "default" : "ghost"}
            aria-pressed={shownView === "overlay"}
            disabled={!transform}
            onClick={() => setView("overlay")}
          >
            Overlay
          </Button>
        </div>
      </div>

      {!transform && (
        <p className="text-muted-foreground text-sm">
          One of these photos has no body position recorded, so they can&apos;t be lined up —
          showing them as taken.
        </p>
      )}

      {shownView === "side" ? (
        <div className="grid grid-cols-2 gap-2 sm:gap-4">
          <figure className="m-0">
            <div
              className="bg-muted relative overflow-hidden rounded-lg"
              style={{ aspectRatio: beforeAspect }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- session-gated Route Handler */}
              <img
                src={photoSrc(before.id)}
                alt={`Before: ${label} photo, ${photoDate(before.date)}`}
                className="h-full w-full object-contain"
              />
            </div>
            <Caption photo={before} role="Before" />
          </figure>
          <figure className="m-0">
            {transform ? (
              <div
                role="img"
                aria-label={`After: ${label} photo, ${photoDate(after.date)}, lined up with the before photo`}
                className="bg-muted relative overflow-hidden rounded-lg"
                style={{ aspectRatio: beforeAspect }}
              >
                <AlignedAfter photo={after} transform={transform} />
              </div>
            ) : (
              <div
                className="bg-muted overflow-hidden rounded-lg"
                style={{ aspectRatio: after.width / after.height }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- session-gated Route Handler */}
                <img
                  src={photoSrc(after.id)}
                  alt={`After: ${label} photo, ${photoDate(after.date)}`}
                  className="h-full w-full object-contain"
                />
              </div>
            )}
            <Caption photo={after} role="After" />
          </figure>
        </div>
      ) : (
        transform && (
          <div className="flex flex-col gap-3">
            <div
              role="img"
              aria-label={`Before (${photoDate(before.date)}) and after (${photoDate(after.date)}) ${label} photos overlaid; after shown on the right ${100 - reveal}%`}
              className="bg-muted relative mx-auto w-full overflow-hidden rounded-lg"
              style={{
                aspectRatio: beforeAspect,
                maxWidth: `calc(70vh * ${beforeAspect})`,
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- session-gated Route Handler */}
              <img
                src={photoSrc(before.id)}
                alt=""
                className="absolute inset-0 h-full w-full object-fill"
              />
              <div
                className="absolute inset-0 overflow-hidden"
                style={{ clipPath: `inset(0 0 0 ${reveal}%)` }}
              >
                <AlignedAfter photo={after} transform={transform} />
              </div>
              <div
                aria-hidden="true"
                className="bg-primary pointer-events-none absolute inset-y-0 w-0.5"
                style={{ left: `${reveal}%` }}
              />
              <span className="bg-background/90 absolute top-2 left-2 rounded px-2 py-0.5 text-xs font-medium">
                Before
              </span>
              <span className="bg-background/90 absolute top-2 right-2 rounded px-2 py-0.5 text-xs font-medium">
                After
              </span>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={sliderId}>Divider position</Label>
              <input
                id={sliderId}
                type="range"
                min={0}
                max={100}
                step={1}
                value={reveal}
                aria-valuetext={`${reveal}% before, ${100 - reveal}% after`}
                onChange={(e) => setReveal(Number(e.target.value))}
                className="accent-primary w-full"
              />
            </div>
          </div>
        )
      )}
    </div>
  );
}
