import { eq } from "drizzle-orm";
import { getDb } from "@/modules/core/db/client";
import { furniture } from "../schema/furniture";
import { rooms } from "../schema/rooms";
import { floors } from "../schema/floors";

export type NewFurniture = typeof furniture.$inferInsert;

export function listFurnitureForRoom(roomId: number) {
  return getDb().select().from(furniture).where(eq(furniture.roomId, roomId)).all();
}

/** Every furniture item across every room of a project — joined through `rooms`/`floors` since furniture has no direct `project_id`. Used to assemble the full 3D model. */
export function listFurnitureForProject(projectId: number) {
  return getDb()
    .select({
      id: furniture.id,
      roomId: furniture.roomId,
      name: furniture.name,
      category: furniture.category,
      x: furniture.x,
      z: furniture.z,
      width: furniture.width,
      depth: furniture.depth,
      height: furniture.height,
      rotationDegrees: furniture.rotationDegrees,
      color: furniture.color,
      material: furniture.material,
      notes: furniture.notes,
    })
    .from(furniture)
    .innerJoin(rooms, eq(furniture.roomId, rooms.id))
    .innerJoin(floors, eq(rooms.floorId, floors.id))
    .where(eq(floors.projectId, projectId))
    .all();
}

export function getFurnitureByIdRow(id: number) {
  return getDb().select().from(furniture).where(eq(furniture.id, id)).get();
}

export function insertFurniture(entry: NewFurniture) {
  return getDb().insert(furniture).values(entry).returning().get();
}

export function updateFurnitureRow(id: number, entry: Partial<NewFurniture>) {
  return getDb().update(furniture).set(entry).where(eq(furniture.id, id)).returning().get();
}
