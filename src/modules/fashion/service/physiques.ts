import { getPhysiqueByPhotoIdRow, insertPhysique } from "../db/queries/physiques";
import { getPhotoByIdRow } from "../db/queries/photos";
import { DomainError } from "@/modules/core/errors";

export function getPhysiqueForPhoto(photoId: number) {
  return getPhysiqueByPhotoIdRow(photoId) ?? null;
}

export interface SavePhysiqueInput {
  photoId: number;
  ratiosJson: string;
  categoriesJson: string;
  description: string;
}

export function createPhysique(input: SavePhysiqueInput) {
  if (!getPhotoByIdRow(input.photoId)) throw new DomainError("The photo no longer exists.");
  if (!input.ratiosJson.trim() || !input.categoriesJson.trim()) {
    throw new DomainError("Physique analysis data is required.");
  }
  return insertPhysique(input);
}
