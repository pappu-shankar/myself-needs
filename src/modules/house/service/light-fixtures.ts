import {
  getLightFixtureByIdRow,
  insertLightFixture,
  listLightFixturesForRoom,
  updateLightFixtureRow,
  type NewLightFixture,
} from "../db/queries/light-fixtures";

export function getLightFixturesForRoom(roomId: number) {
  return listLightFixturesForRoom(roomId);
}

export function getLightFixture(id: number) {
  return getLightFixtureByIdRow(id) ?? null;
}

export function createLightFixture(entry: NewLightFixture) {
  return insertLightFixture(entry);
}

export function updateLightFixture(id: number, entry: Partial<NewLightFixture>) {
  return updateLightFixtureRow(id, entry);
}
