import {
  getFloorByIdRow,
  insertFloor,
  listFloorsForProject,
  updateFloorRow,
  type NewFloor,
} from "../db/queries/floors";
import { requireUpdated } from "./guards";

export function getFloorsForProject(projectId: number) {
  return listFloorsForProject(projectId);
}

export function getFloor(id: number) {
  return getFloorByIdRow(id) ?? null;
}

export function createFloor(entry: NewFloor) {
  return insertFloor(entry);
}

export function updateFloor(id: number, entry: Partial<NewFloor>) {
  return requireUpdated(updateFloorRow(id, entry), "floor");
}
