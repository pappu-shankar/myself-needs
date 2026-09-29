import {
  getWallStyleByIdRow,
  insertWallStyle,
  listWallStylesForRoom,
  updateWallStyleRow,
  type NewWallStyle,
} from "../db/queries/wall-styles";
import { requireUpdated } from "./guards";

export function getWallStylesForRoom(roomId: number) {
  return listWallStylesForRoom(roomId);
}

export function getWallStyle(id: number) {
  return getWallStyleByIdRow(id) ?? null;
}

export function createWallStyle(entry: NewWallStyle) {
  return insertWallStyle(entry);
}

export function updateWallStyle(id: number, entry: Partial<NewWallStyle>) {
  return requireUpdated(updateWallStyleRow(id, entry), "wall style");
}
