import {
  getStairByIdRow,
  insertStair,
  listStairsForProject,
  updateStairRow,
  type NewStair,
} from "../db/queries/stairs";
import { requireUpdated } from "./guards";

export function getStairsForProject(projectId: number) {
  return listStairsForProject(projectId);
}

export function getStair(id: number) {
  return getStairByIdRow(id) ?? null;
}

export function createStair(entry: NewStair) {
  return insertStair(entry);
}

export function updateStair(id: number, entry: Partial<NewStair>) {
  return requireUpdated(updateStairRow(id, entry), "stair");
}
