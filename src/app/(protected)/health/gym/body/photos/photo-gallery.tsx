"use client";

import { useId, useState, useTransition } from "react";
import { ImageIcon, Pencil, Trash2 } from "lucide-react";
import type { ProgressPhoto } from "@/modules/health";
import {
  deleteProgressPhotoAction,
  updateProgressPhotoNoteAction,
} from "@/modules/health/actions/gym/progress-photos";
import { PHOTO_POSE_LABELS, type PhotoPose } from "@/modules/health/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { photoDate } from "./photo-helpers";

export type GalleryPhoto = Pick<
  ProgressPhoto,
  "id" | "date" | "pose" | "width" | "height" | "note" | "landmarks"
>;

export function photoSrc(id: number): string {
  return `/api/health/progress-photos/${id}`;
}

function NoteEditor({ photo, onDone }: { photo: GalleryPhoto; onDone: () => void }) {
  const id = useId();
  const [note, setNote] = useState(photo.note ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const result = await updateProgressPhotoNoteAction({
            id: photo.id,
            note: note.trim() || null,
          });
          if (!result.ok) {
            setError(result.error ?? "Couldn't save the note.");
            return;
          }
          onDone();
        });
      }}
    >
      <Label htmlFor={id}>Note</Label>
      <Input id={id} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Saving…" : "Save note"}
        </Button>
        <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function DeletePhoto({ photo }: { photo: GalleryPhoto }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const label = `${PHOTO_POSE_LABELS[photo.pose].toLowerCase()} photo from ${photoDate(photo.date)}`;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="ghost" size="sm" aria-label={`Delete ${label}`} />}>
        <Trash2 aria-hidden="true" />
        Delete
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete this photo?</DialogTitle>
          <DialogDescription>
            The {label} is removed from your vault for good. This can&apos;t be undone.
          </DialogDescription>
        </DialogHeader>
        {error && (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        )}
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
          <Button
            type="button"
            variant="destructive"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await deleteProgressPhotoAction({ id: photo.id });
                if (!result.ok) {
                  setError(result.error ?? "Couldn't delete the photo.");
                  return;
                }
                setOpen(false);
              })
            }
          >
            <Trash2 aria-hidden="true" />
            {pending ? "Deleting…" : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PhotoCard({ photo }: { photo: GalleryPhoto }) {
  const [editing, setEditing] = useState(false);
  const label = PHOTO_POSE_LABELS[photo.pose];
  return (
    <li className="border-border bg-card flex flex-col overflow-hidden rounded-lg border">
      {/* eslint-disable-next-line @next/next/no-img-element -- served from a
          runtime, session-gated Route Handler, not a static/optimizable asset */}
      <img
        src={photoSrc(photo.id)}
        alt={`${label} progress photo, ${photoDate(photo.date)}`}
        width={photo.width}
        height={photo.height}
        loading="lazy"
        decoding="async"
        className="bg-muted aspect-[3/4] w-full object-contain"
      />
      <div className="flex flex-1 flex-col gap-2 p-3">
        <p className="text-sm font-medium tabular-nums">
          <time dateTime={photo.date}>{photoDate(photo.date)}</time>
        </p>
        {editing ? (
          <NoteEditor photo={photo} onDone={() => setEditing(false)} />
        ) : (
          <>
            {photo.note && (
              <p className="text-muted-foreground text-sm break-words">{photo.note}</p>
            )}
            <div className="mt-auto flex flex-wrap gap-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label={`${photo.note ? "Edit" : "Add"} note for ${label.toLowerCase()} photo from ${photoDate(photo.date)}`}
                onClick={() => setEditing(true)}
              >
                <Pencil aria-hidden="true" />
                {photo.note ? "Edit note" : "Add note"}
              </Button>
              <DeletePhoto photo={photo} />
            </div>
          </>
        )}
      </div>
    </li>
  );
}

export interface PhotoGalleryProps {
  pose: PhotoPose;
  /** Newest first. */
  photos: GalleryPhoto[];
  total: number;
}

export function PhotoGallery({ pose, photos, total }: PhotoGalleryProps) {
  if (photos.length === 0) {
    return (
      <EmptyState
        icon={ImageIcon}
        title={`No ${PHOTO_POSE_LABELS[pose].toLowerCase()} photos yet`}
        description="Take or upload one to start tracking how your body changes."
      />
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <ul
        aria-label={`${PHOTO_POSE_LABELS[pose]} photos, newest first`}
        className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
      >
        {photos.map((photo) => (
          <PhotoCard key={photo.id} photo={photo} />
        ))}
      </ul>
      {total > photos.length && (
        <p className="text-muted-foreground text-sm">
          Showing the newest {photos.length} of {total}.
        </p>
      )}
    </div>
  );
}
