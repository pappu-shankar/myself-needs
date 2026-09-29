import {
  getOpeningByIdRow,
  insertOpening,
  listOpeningsForRoom,
  updateOpeningRow,
  type NewOpening,
} from "../db/queries/openings";
import { requireUpdated } from "./guards";

export function getOpeningsForRoom(roomId: number) {
  return listOpeningsForRoom(roomId);
}

export function getOpening(id: number) {
  return getOpeningByIdRow(id) ?? null;
}

export function createOpening(entry: NewOpening) {
  return insertOpening(entry);
}

export function updateOpening(id: number, entry: Partial<NewOpening>) {
  return requireUpdated(updateOpeningRow(id, entry), "opening");
}
