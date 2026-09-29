import {
  getFixtureByIdRow,
  insertFixture,
  listFixturesForFloor,
  updateFixtureRow,
  type NewFixture,
} from "../db/queries/fixtures";
import { requireUpdated } from "./guards";

export function getFixturesForFloor(floorId: number) {
  return listFixturesForFloor(floorId);
}

export function getFixture(id: number) {
  return getFixtureByIdRow(id) ?? null;
}

export function createFixture(entry: NewFixture) {
  return insertFixture(entry);
}

export function updateFixture(id: number, entry: Partial<NewFixture>) {
  return requireUpdated(updateFixtureRow(id, entry), "fixture");
}
