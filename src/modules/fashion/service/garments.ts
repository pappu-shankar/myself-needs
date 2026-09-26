import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { getDataDir } from "@/modules/core/env/paths";
import {
  deleteGarmentRow,
  getGarmentByFilenameRow,
  getGarmentByIdRow,
  insertGarment,
  listGarments,
} from "../db/queries/garments";
import type { GarmentCategory } from "../types";

const GARMENTS_SUBDIR = "fashion-garments";

function garmentsDir(): string {
  const dir = path.join(getDataDir(), GARMENTS_SUBDIR);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/** Resolves a stored filename to its absolute on-disk path. Not exported —
 * every caller of file bytes goes through getGarmentFileBytes() below,
 * which validates the filename first. */
function resolveGarmentFilePath(filename: string): string {
  return path.join(garmentsDir(), filename);
}

export function getGarments() {
  return listGarments();
}

export function getGarment(id: number) {
  return getGarmentByIdRow(id) ?? null;
}

export interface UploadedGarmentInput {
  /** Already background-removed PNG bytes (see client/background-removal.ts)
   * — garments are always stored as PNG, since representing the removed
   * background requires an alpha channel a JPEG can't carry. */
  bytes: Buffer;
  originalName: string | null;
  category: GarmentCategory;
  representativeColor: { l: number; a: number; b: number; hex: string };
}

/** Writes the garment file to disk under a generated UUID filename, then
 * inserts the DB row referencing it — same pattern as service/photos.ts's
 * createPhoto(). */
export function createGarment(input: UploadedGarmentInput) {
  const filename = `${randomUUID()}.png`;
  writeFileSync(resolveGarmentFilePath(filename), input.bytes);

  return insertGarment({
    category: input.category,
    filename,
    originalName: input.originalName,
    mimeType: "image/png",
    representativeColorLabL: input.representativeColor.l,
    representativeColorLabA: input.representativeColor.a,
    representativeColorLabB: input.representativeColor.b,
    representativeColorHex: input.representativeColor.hex,
  });
}

export function deleteGarment(id: number) {
  deleteGarmentRow(id);
}

/** Reads a garment's file bytes for the garments Route Handler — same
 * validation/404 pattern as service/photos.ts's getPhotoFileBytes(). */
export function getGarmentFileBytes(filename: string): { buffer: Buffer; mimeType: string } | null {
  if (filename.includes("/") || filename.includes("..")) return null;

  const row = getGarmentByFilenameRow(filename);
  if (!row) return null;

  const filePath = resolveGarmentFilePath(filename);
  if (!existsSync(filePath)) return null;

  return { buffer: readFileSync(filePath), mimeType: row.mimeType };
}
