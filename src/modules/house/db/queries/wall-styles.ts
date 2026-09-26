import { eq } from "drizzle-orm";
import { getDb } from "@/modules/core/db/client";
import { wallStyles } from "../schema/wall-styles";
import { rooms } from "../schema/rooms";
import { floors } from "../schema/floors";

export type NewWallStyle = typeof wallStyles.$inferInsert;

export function listWallStylesForRoom(roomId: number) {
  return getDb().select().from(wallStyles).where(eq(wallStyles.roomId, roomId)).all();
}

/** Every wall style across every room of a project — joined through `rooms`/`floors` since wall styles have no direct `project_id`. Used to assemble the full 3D model. */
export function listWallStylesForProject(projectId: number) {
  return getDb()
    .select({
      id: wallStyles.id,
      roomId: wallStyles.roomId,
      wall: wallStyles.wall,
      style: wallStyles.style,
      railingHeight: wallStyles.railingHeight,
      color: wallStyles.color,
      notes: wallStyles.notes,
    })
    .from(wallStyles)
    .innerJoin(rooms, eq(wallStyles.roomId, rooms.id))
    .innerJoin(floors, eq(rooms.floorId, floors.id))
    .where(eq(floors.projectId, projectId))
    .all();
}

export function getWallStyleByIdRow(id: number) {
  return getDb().select().from(wallStyles).where(eq(wallStyles.id, id)).get();
}

export function insertWallStyle(entry: NewWallStyle) {
  return getDb().insert(wallStyles).values(entry).returning().get();
}

export function updateWallStyleRow(id: number, entry: Partial<NewWallStyle>) {
  return getDb().update(wallStyles).set(entry).where(eq(wallStyles.id, id)).returning().get();
}
