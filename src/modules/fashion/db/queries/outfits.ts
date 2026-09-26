import { eq } from "drizzle-orm";
import { getDb } from "@/modules/core/db/client";
import { outfits } from "../schema/outfits";

export type NewOutfit = typeof outfits.$inferInsert;

export function listOutfitsForPhoto(photoId: number) {
  return getDb()
    .select()
    .from(outfits)
    .where(eq(outfits.photoId, photoId))
    .orderBy(outfits.createdAt)
    .all();
}

export function getOutfitByIdRow(id: number) {
  return getDb().select().from(outfits).where(eq(outfits.id, id)).get();
}

export function insertOutfit(entry: NewOutfit) {
  return getDb().insert(outfits).values(entry).returning().get();
}

export function deleteOutfitRow(id: number) {
  return getDb().delete(outfits).where(eq(outfits.id, id)).run();
}
