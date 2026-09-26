import { getPhysiqueByPhotoIdRow, insertPhysique } from "../db/queries/physiques";

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
  return insertPhysique(input);
}
