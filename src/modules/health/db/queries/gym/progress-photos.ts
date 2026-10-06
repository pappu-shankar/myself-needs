import { and, count, desc, eq } from "drizzle-orm";
import { getDb } from "@/modules/core/db/client";
import type { PhotoPose } from "../../../gym-types";
import { gymProgressPhotos } from "../../schema/gym/progress-photos";

export type NewProgressPhoto = typeof gymProgressPhotos.$inferInsert;

/** Everything but the image bytes — lists never pull the blobs. */
const meta = {
  id: gymProgressPhotos.id,
  date: gymProgressPhotos.date,
  pose: gymProgressPhotos.pose,
  mimeType: gymProgressPhotos.mimeType,
  width: gymProgressPhotos.width,
  height: gymProgressPhotos.height,
  landmarks: gymProgressPhotos.landmarks,
  note: gymProgressPhotos.note,
  createdAt: gymProgressPhotos.createdAt,
};

export function insertProgressPhoto(photo: NewProgressPhoto) {
  return getDb().insert(gymProgressPhotos).values(photo).returning(meta).get();
}

export function listProgressPhotoRows(pose: PhotoPose | undefined, limit: number, offset: number) {
  return getDb()
    .select(meta)
    .from(gymProgressPhotos)
    .where(pose ? eq(gymProgressPhotos.pose, pose) : undefined)
    .orderBy(desc(gymProgressPhotos.date), desc(gymProgressPhotos.id))
    .limit(limit)
    .offset(offset)
    .all();
}

export function countProgressPhotos(pose?: PhotoPose): number {
  return (
    getDb()
      .select({ n: count() })
      .from(gymProgressPhotos)
      .where(pose ? eq(gymProgressPhotos.pose, pose) : undefined)
      .get()?.n ?? 0
  );
}

export function findProgressPhotoMeta(id: number) {
  return getDb().select(meta).from(gymProgressPhotos).where(eq(gymProgressPhotos.id, id)).get();
}

export function findProgressPhotoImage(id: number) {
  return getDb()
    .select({ image: gymProgressPhotos.image, mimeType: gymProgressPhotos.mimeType })
    .from(gymProgressPhotos)
    .where(and(eq(gymProgressPhotos.id, id)))
    .get();
}

export function updateProgressPhotoNoteRow(id: number, note: string | null) {
  return getDb()
    .update(gymProgressPhotos)
    .set({ note })
    .where(eq(gymProgressPhotos.id, id))
    .returning(meta)
    .get();
}

export function deleteProgressPhotoRow(id: number): void {
  getDb().delete(gymProgressPhotos).where(eq(gymProgressPhotos.id, id)).run();
}
