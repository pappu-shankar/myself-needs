import {
  getRoomByIdRow,
  insertRoom,
  listRoomsForFloor,
  updateRoomRow,
  type NewRoom,
} from "../db/queries/rooms";

export function getRoomsForFloor(floorId: number) {
  return listRoomsForFloor(floorId);
}

export function getRoom(id: number) {
  return getRoomByIdRow(id) ?? null;
}

export function createRoom(entry: NewRoom) {
  return insertRoom(entry);
}

export function updateRoom(id: number, entry: Partial<NewRoom>) {
  return updateRoomRow(id, entry);
}
