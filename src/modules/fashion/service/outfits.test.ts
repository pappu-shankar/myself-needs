import { beforeEach, afterEach, describe, expect, it } from "vitest";
import { setupTestDb, teardownTestDb } from "@/test/db";
import { insertPhoto } from "../db/queries/photos";
import { createOutfit, deleteOutfit, getOutfit, getOutfitsForPhoto } from "./outfits";

beforeEach(setupTestDb);
afterEach(teardownTestDb);

// Sets up a fake photo row directly via the query layer (not
// service/photos.ts's createPhoto, which writes a real file to disk) —
// outfit tests only need a valid photoId to reference, never touch the
// filesystem, and keep the in-memory-DB-only guarantee the rest of this
// app's test suite relies on.
function seedPhoto() {
  return insertPhoto({
    filename: "test.jpg",
    originalName: "test.jpg",
    mimeType: "image/jpeg",
    widthPx: 800,
    heightPx: 1200,
  });
}

describe("fashion outfits service", () => {
  it("creates and fetches an outfit by id", () => {
    const photo = seedPhoto();
    const created = createOutfit({
      photoId: photo.id,
      name: "Weekend casual",
      shirtColorHex: "#3366aa",
      pantsColorHex: "#222222",
      shirtContrastScore: "pops",
      pantsContrastScore: "neutral",
      note: null,
    });

    expect(getOutfit(created.id)).toMatchObject({
      name: "Weekend casual",
      shirtColorHex: "#3366aa",
    });
  });

  it("returns null for a missing outfit", () => {
    expect(getOutfit(999)).toBeNull();
  });

  it("lists outfits for a photo, oldest first", () => {
    const photo = seedPhoto();
    const first = createOutfit({
      photoId: photo.id,
      name: "First",
      shirtColorHex: "#111111",
      pantsColorHex: "#222222",
      shirtContrastScore: null,
      pantsContrastScore: null,
      note: null,
    });
    const second = createOutfit({
      photoId: photo.id,
      name: "Second",
      shirtColorHex: "#333333",
      pantsColorHex: "#444444",
      shirtContrastScore: null,
      pantsContrastScore: null,
      note: null,
    });

    expect(getOutfitsForPhoto(photo.id).map((o) => o.id)).toEqual([first.id, second.id]);
  });

  it("does not return another photo's outfits", () => {
    const photoA = seedPhoto();
    const photoB = seedPhoto();
    createOutfit({
      photoId: photoA.id,
      name: "A's outfit",
      shirtColorHex: "#111111",
      pantsColorHex: "#222222",
      shirtContrastScore: null,
      pantsContrastScore: null,
      note: null,
    });

    expect(getOutfitsForPhoto(photoB.id)).toEqual([]);
  });

  it("deletes an outfit", () => {
    const photo = seedPhoto();
    const created = createOutfit({
      photoId: photo.id,
      name: "Doomed",
      shirtColorHex: "#111111",
      pantsColorHex: "#222222",
      shirtContrastScore: null,
      pantsContrastScore: null,
      note: null,
    });

    deleteOutfit(created.id);

    expect(getOutfit(created.id)).toBeNull();
  });

  it("rejects deleting a missing outfit", () => {
    expect(() => deleteOutfit(999)).toThrow("no longer exists");
  });
});
