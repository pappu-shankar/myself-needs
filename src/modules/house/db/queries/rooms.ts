import { eq } from "drizzle-orm";
import { getDb } from "@/modules/core/db/client";
import { rooms } from "../schema/rooms";
import { floors } from "../schema/floors";

export type NewRoom = typeof rooms.$inferInsert;

export function listRoomsForFloor(floorId: number) {
  return getDb().select().from(rooms).where(eq(rooms.floorId, floorId)).orderBy(rooms.name).all();
}

/** Every room across every floor of a project — joined through `floors` since rooms have no direct `project_id`. Used to assemble the full 3D model. */
export function listRoomsForProject(projectId: number) {
  return getDb()
    .select({
      id: rooms.id,
      floorId: rooms.floorId,
      name: rooms.name,
      type: rooms.type,
      x: rooms.x,
      z: rooms.z,
      width: rooms.width,
      depth: rooms.depth,
      wallHeight: rooms.wallHeight,
      color: rooms.color,
      material: rooms.material,
      notes: rooms.notes,
    })
    .from(rooms)
    .innerJoin(floors, eq(rooms.floorId, floors.id))
    .where(eq(floors.projectId, projectId))
    .all();
}

export function getRoomByIdRow(id: number) {
  return getDb().select().from(rooms).where(eq(rooms.id, id)).get();
}

export function insertRoom(entry: NewRoom) {
  return getDb().insert(rooms).values(entry).returning().get();
}

export function updateRoomRow(id: number, entry: Partial<NewRoom>) {
  return getDb().update(rooms).set(entry).where(eq(rooms.id, id)).returning().get();
}
