import { eq } from "drizzle-orm";
import { getDb } from "@/modules/core/db/client";
import { floors } from "../schema/floors";

export type NewFloor = typeof floors.$inferInsert;

export function listFloorsForProject(projectId: number) {
  return getDb()
    .select()
    .from(floors)
    .where(eq(floors.projectId, projectId))
    .orderBy(floors.level)
    .all();
}

export function getFloorByIdRow(id: number) {
  return getDb().select().from(floors).where(eq(floors.id, id)).get();
}

export function insertFloor(entry: NewFloor) {
  return getDb().insert(floors).values(entry).returning().get();
}

export function updateFloorRow(id: number, entry: Partial<NewFloor>) {
  return getDb().update(floors).set(entry).where(eq(floors.id, id)).returning().get();
}
