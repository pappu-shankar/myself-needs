import { eq } from "drizzle-orm";
import { getDb } from "@/modules/core/db/client";
import { lightFixtures } from "../schema/light-fixtures";
import { rooms } from "../schema/rooms";
import { floors } from "../schema/floors";

export type NewLightFixture = typeof lightFixtures.$inferInsert;

export function listLightFixturesForRoom(roomId: number) {
  return getDb().select().from(lightFixtures).where(eq(lightFixtures.roomId, roomId)).all();
}

/** Every light fixture across every room of a project — joined through `rooms`/`floors` since light fixtures have no direct `project_id`. Used to assemble the full 3D model. */
export function listLightFixturesForProject(projectId: number) {
  return getDb()
    .select({
      id: lightFixtures.id,
      roomId: lightFixtures.roomId,
      name: lightFixtures.name,
      type: lightFixtures.type,
      x: lightFixtures.x,
      z: lightFixtures.z,
      height: lightFixtures.height,
      color: lightFixtures.color,
      intensity: lightFixtures.intensity,
      notes: lightFixtures.notes,
    })
    .from(lightFixtures)
    .innerJoin(rooms, eq(lightFixtures.roomId, rooms.id))
    .innerJoin(floors, eq(rooms.floorId, floors.id))
    .where(eq(floors.projectId, projectId))
    .all();
}

export function getLightFixtureByIdRow(id: number) {
  return getDb().select().from(lightFixtures).where(eq(lightFixtures.id, id)).get();
}

export function insertLightFixture(entry: NewLightFixture) {
  return getDb().insert(lightFixtures).values(entry).returning().get();
}

export function updateLightFixtureRow(id: number, entry: Partial<NewLightFixture>) {
  return getDb().update(lightFixtures).set(entry).where(eq(lightFixtures.id, id)).returning().get();
}
