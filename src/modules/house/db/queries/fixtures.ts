import { eq } from "drizzle-orm";
import { getDb } from "@/modules/core/db/client";
import { fixtures } from "../schema/fixtures";
import { floors } from "../schema/floors";

export type NewFixture = typeof fixtures.$inferInsert;

export function listFixturesForFloor(floorId: number) {
  return getDb().select().from(fixtures).where(eq(fixtures.floorId, floorId)).all();
}

/** Every fixture across every floor of a project — joined through `floors` since fixtures have no direct `project_id`. Used to assemble the full 3D model. */
export function listFixturesForProject(projectId: number) {
  return getDb()
    .select({
      id: fixtures.id,
      floorId: fixtures.floorId,
      name: fixtures.name,
      category: fixtures.category,
      x: fixtures.x,
      z: fixtures.z,
      notes: fixtures.notes,
    })
    .from(fixtures)
    .innerJoin(floors, eq(fixtures.floorId, floors.id))
    .where(eq(floors.projectId, projectId))
    .all();
}

export function getFixtureByIdRow(id: number) {
  return getDb().select().from(fixtures).where(eq(fixtures.id, id)).get();
}

export function insertFixture(entry: NewFixture) {
  return getDb().insert(fixtures).values(entry).returning().get();
}

export function updateFixtureRow(id: number, entry: Partial<NewFixture>) {
  return getDb().update(fixtures).set(entry).where(eq(fixtures.id, id)).returning().get();
}
