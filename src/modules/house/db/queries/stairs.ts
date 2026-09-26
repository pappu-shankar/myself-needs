import { eq } from "drizzle-orm";
import { getDb } from "@/modules/core/db/client";
import { stairs } from "../schema/stairs";

export type NewStair = typeof stairs.$inferInsert;

export function listStairsForProject(projectId: number) {
  return getDb().select().from(stairs).where(eq(stairs.projectId, projectId)).all();
}

export function getStairByIdRow(id: number) {
  return getDb().select().from(stairs).where(eq(stairs.id, id)).get();
}

export function insertStair(entry: NewStair) {
  return getDb().insert(stairs).values(entry).returning().get();
}

export function updateStairRow(id: number, entry: Partial<NewStair>) {
  return getDb().update(stairs).set(entry).where(eq(stairs.id, id)).returning().get();
}
