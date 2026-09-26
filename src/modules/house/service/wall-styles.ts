import {
  getWallStyleByIdRow,
  insertWallStyle,
  listWallStylesForRoom,
  updateWallStyleRow,
  type NewWallStyle,
} from "../db/queries/wall-styles";

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
  return updateWallStyleRow(id, entry);
}
