import { eq } from "drizzle-orm";
import { getDb } from "@/modules/core/db/client";
import { physiques } from "../schema/physiques";

export type NewPhysique = typeof physiques.$inferInsert;

export function getPhysiqueByPhotoIdRow(photoId: number) {
  return getDb().select().from(physiques).where(eq(physiques.photoId, photoId)).get();
}

export function insertPhysique(entry: NewPhysique) {
  return getDb().insert(physiques).values(entry).returning().get();
}
