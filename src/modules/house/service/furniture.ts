import {
  getFurnitureByIdRow,
  insertFurniture,
  listFurnitureForRoom,
  updateFurnitureRow,
  type NewFurniture,
} from "../db/queries/furniture";
import { requireUpdated } from "./guards";

export function getFurnitureForRoom(roomId: number) {
  return listFurnitureForRoom(roomId);
}

export function getFurnitureItem(id: number) {
  return getFurnitureByIdRow(id) ?? null;
}

export function createFurniture(entry: NewFurniture) {
  return insertFurniture(entry);
}

export function updateFurniture(id: number, entry: Partial<NewFurniture>) {
  return requireUpdated(updateFurnitureRow(id, entry), "furniture item");
}
