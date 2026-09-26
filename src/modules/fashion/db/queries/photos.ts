import { eq } from "drizzle-orm";
import { getDb } from "@/modules/core/db/client";
import { photos } from "../schema/photos";

export type NewPhoto = typeof photos.$inferInsert;

export function listPhotos() {
  return getDb().select().from(photos).orderBy(photos.createdAt).all();
}

export function getPhotoByIdRow(id: number) {
  return getDb().select().from(photos).where(eq(photos.id, id)).get();
}

export function getPhotoByFilenameRow(filename: string) {
  return getDb().select().from(photos).where(eq(photos.filename, filename)).get();
}

export function insertPhoto(entry: NewPhoto) {
  return getDb().insert(photos).values(entry).returning().get();
}

export function updatePhotoRow(id: number, entry: Partial<NewPhoto>) {
  return getDb().update(photos).set(entry).where(eq(photos.id, id)).returning().get();
}
