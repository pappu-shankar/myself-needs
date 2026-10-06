import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setupTestDb, teardownTestDb } from "@/test/db";
import {
  addProgressPhoto,
  deleteProgressPhoto,
  getProgressPhotoImage,
  listProgressPhotos,
  updateProgressPhotoNote,
} from "./progress-photos";

beforeEach(setupTestDb);
afterEach(teardownTestDb);

/** Smallest bytes that pass the JPEG magic-number check. */
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const landmarks = Array.from(
  { length: 33 },
  (_, i) => [i / 33, 0.5, 0.9] as [number, number, number],
);

const input = (over: Partial<Parameters<typeof addProgressPhoto>[0]> = {}) => ({
  date: "2026-10-04",
  pose: "front" as const,
  image: jpeg,
  mimeType: "image/jpeg" as const,
  width: 1080,
  height: 1440,
  landmarks,
  ...over,
});

describe("progress photos", () => {
  it("stores the image in the vault and lists metadata without the bytes", () => {
    const photo = addProgressPhoto(input({ note: " week 1 " }));
    expect(photo).toMatchObject({ pose: "front", note: "week 1", width: 1080 });
    expect("image" in photo).toBe(false);
    expect(getProgressPhotoImage(photo.id)?.image.equals(jpeg)).toBe(true);
    addProgressPhoto(input({ pose: "side", date: "2026-10-05" }));
    expect(listProgressPhotos().rows.map((p) => p.pose)).toEqual(["side", "front"]);
    expect(listProgressPhotos({ pose: "front" }).total).toBe(1);
  });

  it("rejects bytes that aren't the claimed image type, bad sizes and malformed pose data", () => {
    expect(() => addProgressPhoto(input({ image: Buffer.from("not an image") }))).toThrow(
      /valid image/,
    );
    expect(() => addProgressPhoto(input({ width: 10 }))).toThrow(/size/);
    expect(() => addProgressPhoto(input({ landmarks: landmarks.slice(1) }))).toThrow(/Pose/);
    expect(() => addProgressPhoto(input({ date: "2026-02-30" }))).toThrow(/date/);
  });

  it("edits notes and deletes", () => {
    const photo = addProgressPhoto(input({ landmarks: null }));
    expect(updateProgressPhotoNote(photo.id, "  ").note).toBeNull();
    deleteProgressPhoto(photo.id);
    expect(getProgressPhotoImage(photo.id)).toBeNull();
    expect(() => deleteProgressPhoto(photo.id)).toThrow(/no longer exists/);
  });
});
