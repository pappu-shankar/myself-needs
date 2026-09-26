import { eq } from "drizzle-orm";
import { getDb } from "@/modules/core/db/client";
import { openings } from "../schema/openings";
import { rooms } from "../schema/rooms";
import { floors } from "../schema/floors";

export type NewOpening = typeof openings.$inferInsert;

export function listOpeningsForRoom(roomId: number) {
  return getDb().select().from(openings).where(eq(openings.roomId, roomId)).all();
}

/** Every opening across every room of a project — joined through `rooms`/`floors` since openings have no direct `project_id`. Used to assemble the full 3D model. */
export function listOpeningsForProject(projectId: number) {
  return getDb()
    .select({
      id: openings.id,
      roomId: openings.roomId,
      wall: openings.wall,
      type: openings.type,
      style: openings.style,
      offset: openings.offset,
      width: openings.width,
      height: openings.height,
      sillHeight: openings.sillHeight,
      notes: openings.notes,
    })
    .from(openings)
    .innerJoin(rooms, eq(openings.roomId, rooms.id))
    .innerJoin(floors, eq(rooms.floorId, floors.id))
    .where(eq(floors.projectId, projectId))
    .all();
}

export function getOpeningByIdRow(id: number) {
  return getDb().select().from(openings).where(eq(openings.id, id)).get();
}

export function insertOpening(entry: NewOpening) {
  return getDb().insert(openings).values(entry).returning().get();
}

export function updateOpeningRow(id: number, entry: Partial<NewOpening>) {
  return getDb().update(openings).set(entry).where(eq(openings.id, id)).returning().get();
}
