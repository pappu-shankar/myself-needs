import { like } from "drizzle-orm";
import { getDb } from "@/modules/core/db/client";
import { projects } from "../schema/projects";
import { rooms } from "../schema/rooms";

export function searchProjectsByName(query: string) {
  return getDb()
    .select()
    .from(projects)
    .where(like(projects.name, `%${query}%`))
    .limit(5)
    .all();
}

export function searchRoomsByName(query: string) {
  return getDb()
    .select()
    .from(rooms)
    .where(like(rooms.name, `%${query}%`))
    .limit(5)
    .all();
}
