import { DomainError } from "@/modules/core/errors";
import { parseIsoDate } from "@/lib/dates";
import { PHOTO_POSES, type PhotoPose } from "../../gym-types";
import {
  countProgressPhotos,
  deleteProgressPhotoRow,
  findProgressPhotoImage,
  findProgressPhotoMeta,
  insertProgressPhoto,
  listProgressPhotoRows,
  updateProgressPhotoNoteRow,
} from "../../db/queries/gym/progress-photos";

export type ProgressPhoto = NonNullable<ReturnType<typeof findProgressPhotoMeta>>;

export const PROGRESS_PHOTO_MIME_TYPES = ["image/jpeg", "image/webp"] as const;
export type ProgressPhotoMimeType = (typeof PROGRESS_PHOTO_MIME_TYPES)[number];

/** Clients downscale to ~1080 px before upload; this is headroom, not a target. */
export const MAX_PHOTO_BYTES = 3 * 1024 * 1024;
const MAX_DIMENSION = 2400;
/** BlazePose's 33 landmarks. */
const LANDMARK_COUNT = 33;

export interface NewProgressPhotoInput {
  date: string;
  pose: PhotoPose;
  image: Buffer;
  mimeType: ProgressPhotoMimeType;
  width: number;
  height: number;
  landmarks: Array<[number, number, number]> | null;
  note?: string | null;
}

/** Checks the bytes really are the claimed image type (magic numbers), not just the label. */
function looksLike(image: Buffer, mimeType: ProgressPhotoMimeType): boolean {
  if (mimeType === "image/jpeg") return image[0] === 0xff && image[1] === 0xd8 && image[2] === 0xff;
  return (
    image.subarray(0, 4).toString("ascii") === "RIFF" &&
    image.subarray(8, 12).toString("ascii") === "WEBP"
  );
}

export function addProgressPhoto(input: NewProgressPhotoInput): ProgressPhoto {
  try {
    parseIsoDate(input.date);
  } catch {
    throw new DomainError("Photo date must be a valid calendar date.");
  }
  if (!PHOTO_POSES.includes(input.pose)) throw new DomainError("Pick front, side or back.");
  if (!PROGRESS_PHOTO_MIME_TYPES.includes(input.mimeType)) {
    throw new DomainError("Photos must be JPEG or WebP.");
  }
  if (input.image.length === 0 || input.image.length > MAX_PHOTO_BYTES) {
    throw new DomainError("That photo is too large — try again (it's resized before saving).");
  }
  if (!looksLike(input.image, input.mimeType)) {
    throw new DomainError("That file isn't a valid image.");
  }
  for (const side of [input.width, input.height]) {
    if (!Number.isInteger(side) || side < 64 || side > MAX_DIMENSION) {
      throw new DomainError("Photo size is out of range.");
    }
  }
  const landmarks = input.landmarks;
  if (
    landmarks !== null &&
    (landmarks.length !== LANDMARK_COUNT ||
      landmarks.some((point) => point.length !== 3 || point.some((v) => !Number.isFinite(v))))
  ) {
    throw new DomainError("Pose data is malformed.");
  }
  const note = input.note?.trim() || null;
  if (note && note.length > 500) throw new DomainError("Notes must be at most 500 characters.");
  return insertProgressPhoto({
    date: input.date,
    pose: input.pose,
    image: input.image,
    mimeType: input.mimeType,
    width: input.width,
    height: input.height,
    landmarks,
    note,
  });
}

export function listProgressPhotos(
  options: { pose?: PhotoPose; limit?: number; offset?: number } = {},
): { rows: ProgressPhoto[]; total: number } {
  const limit = Math.min(200, Math.max(1, Math.trunc(options.limit ?? 60)));
  const offset = Math.max(0, Math.trunc(options.offset ?? 0));
  return {
    rows: listProgressPhotoRows(options.pose, limit, offset),
    total: countProgressPhotos(options.pose),
  };
}

export function getProgressPhoto(id: number): ProgressPhoto {
  const photo = findProgressPhotoMeta(id);
  if (!photo) throw new DomainError("That photo no longer exists.");
  return photo;
}

/** Image bytes for the route handler; null when the id doesn't exist. */
export function getProgressPhotoImage(id: number): { image: Buffer; mimeType: string } | null {
  return findProgressPhotoImage(id) ?? null;
}

export function updateProgressPhotoNote(id: number, note: string | null): ProgressPhoto {
  getProgressPhoto(id);
  const cleaned = note?.trim() || null;
  if (cleaned && cleaned.length > 500)
    throw new DomainError("Notes must be at most 500 characters.");
  return updateProgressPhotoNoteRow(id, cleaned)!;
}

export function deleteProgressPhoto(id: number): void {
  getProgressPhoto(id);
  deleteProgressPhotoRow(id);
}
