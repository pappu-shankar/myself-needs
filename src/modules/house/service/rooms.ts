import {
  getRoomByIdRow,
  insertRoom,
  listRoomsForFloor,
  updateRoomRow,
  type NewRoom,
} from "../db/queries/rooms";
import { requireUpdated } from "./guards";

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
  return requireUpdated(updateRoomRow(id, entry), "room");
}
