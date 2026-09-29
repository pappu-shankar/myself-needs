import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { getDataDir } from "@/modules/core/env/paths";
import {
  getPhotoByFilenameRow,
  getPhotoByIdRow,
  insertPhoto,
  listPhotos,
  updatePhotoRow,
} from "../db/queries/photos";
import type { PhotoMimeType } from "../types";
import { DomainError } from "@/modules/core/errors";

const PHOTOS_SUBDIR = "fashion-photos";

function photosDir(): string {
  const dir = path.join(getDataDir(), PHOTOS_SUBDIR);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/** Resolves a stored filename to its absolute on-disk path. Not exported
 * from the module — every caller of file bytes goes through
 * getPhotoFileBytes() below, which validates the filename first. */
function resolvePhotoFilePath(filename: string): string {
  return path.join(photosDir(), filename);
}

function mimeTypeToExtension(mimeType: PhotoMimeType): string {
  switch (mimeType) {
    case "image/png":
      return ".png";
    case "image/webp":
      return ".webp";
    case "image/jpeg":
      return ".jpg";
  }
}

export function getPhotos() {
  return listPhotos();
}

export function getPhoto(id: number) {
  return getPhotoByIdRow(id) ?? null;
}

export interface UploadedPhotoInput {
  bytes: Buffer;
  originalName: string | null;
  mimeType: PhotoMimeType;
  widthPx: number;
  heightPx: number;
}

/** Writes the photo file to disk under a generated UUID filename, then
 * inserts the DB row referencing it. The UUID is generated before the
 * insert so the filename never depends on the not-yet-known row id. */
export function createPhoto(input: UploadedPhotoInput) {
  if (input.bytes.length === 0) throw new DomainError("Photo data is empty.");
  if (
    !Number.isInteger(input.widthPx) ||
    input.widthPx <= 0 ||
    !Number.isInteger(input.heightPx) ||
    input.heightPx <= 0
  ) {
    throw new DomainError("Photo dimensions must be positive integers.");
  }
  const filename = `${randomUUID()}${mimeTypeToExtension(input.mimeType)}`;
  const filePath = resolvePhotoFilePath(filename);
  writeFileSync(filePath, input.bytes);
  try {
    return insertPhoto({
      filename,
      originalName: input.originalName,
      mimeType: input.mimeType,
      widthPx: input.widthPx,
      heightPx: input.heightPx,
    });
  } catch (error) {
    unlinkSync(filePath);
    throw error;
  }
}

export function updateSkinTone(id: number, lab: { l: number; a: number; b: number }) {
  if (!getPhotoByIdRow(id)) throw new DomainError("The photo no longer exists.");
  if (![lab.l, lab.a, lab.b].every(Number.isFinite))
    throw new DomainError("Skin tone values must be numbers.");
  return updatePhotoRow(id, { skinToneLabL: lab.l, skinToneLabA: lab.a, skinToneLabB: lab.b });
}

/** Reads a photo's file bytes for the photos Route Handler. Rejects any
 * filename containing a path separator or ".." as defense in depth (the
 * Route Handler itself should already be passing a raw path segment, never
 * a full path), and 404s (returns null) for anything not actually
 * referenced by a fashion_photos row. */
export function getPhotoFileBytes(filename: string): { buffer: Buffer; mimeType: string } | null {
  if (filename.includes("/") || filename.includes("..")) return null;

  const row = getPhotoByFilenameRow(filename);
  if (!row) return null;

  const filePath = resolvePhotoFilePath(filename);
  if (!existsSync(filePath)) return null;

  return { buffer: readFileSync(filePath), mimeType: row.mimeType };
}
