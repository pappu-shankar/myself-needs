import {
  deleteOutfitRow,
  getOutfitByIdRow,
  insertOutfit,
  listOutfitsForPhoto,
  type NewOutfit,
} from "../db/queries/outfits";

export function getOutfitsForPhoto(photoId: number) {
  return listOutfitsForPhoto(photoId);
}

export function getOutfit(id: number) {
  return getOutfitByIdRow(id) ?? null;
}

export function createOutfit(entry: NewOutfit) {
  return insertOutfit(entry);
}

export function deleteOutfit(id: number) {
  deleteOutfitRow(id);
}
