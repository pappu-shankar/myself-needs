import {
  deleteOutfitRow,
  getOutfitByIdRow,
  insertOutfit,
  listOutfitsForPhoto,
  type NewOutfit,
} from "../db/queries/outfits";
import { DomainError } from "@/modules/core/errors";

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
  if (!getOutfitByIdRow(id)) throw new DomainError("The outfit no longer exists.");
  deleteOutfitRow(id);
}
