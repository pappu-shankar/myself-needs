import { eq } from "drizzle-orm";
import { getDb } from "@/modules/core/db/client";
import { garments } from "../schema/garments";

export type NewGarment = typeof garments.$inferInsert;

export function listGarments() {
  return getDb().select().from(garments).orderBy(garments.createdAt).all();
}

export function getGarmentByIdRow(id: number) {
  return getDb().select().from(garments).where(eq(garments.id, id)).get();
}

export function getGarmentByFilenameRow(filename: string) {
  return getDb().select().from(garments).where(eq(garments.filename, filename)).get();
}

export function insertGarment(entry: NewGarment) {
  return getDb().insert(garments).values(entry).returning().get();
}

export function deleteGarmentRow(id: number) {
  return getDb().delete(garments).where(eq(garments.id, id)).run();
}
