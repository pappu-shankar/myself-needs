import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/modules/core/db/client";
import { setupTestDb, teardownTestDb } from "@/test/db";
import { gymExercises } from "../../db/schema/gym/exercises";
import { gymWorkoutExercises, gymWorkouts } from "../../db/schema/gym/workouts";
import { muscleOf } from "../../engine/muscles";
import { ensureExerciseCatalog } from "./catalog";
import {
  createCustomExercise,
  getExercise,
  getExercisesByIds,
  listBodyParts,
  listEquipmentOptions,
  listExercises,
  removeCustomExercise,
  restoreCustomExercise,
  setExerciseFavorite,
  updateCustomExercise,
  updateExerciseNotes,
} from "./exercises";
import { addRoutineEntry, createRoutine } from "./routines";
import { updateGymSettings } from "./settings";

beforeEach(setupTestDb);
afterEach(teardownTestDb);

function catalogId(name: string): number {
  ensureExerciseCatalog();
  const row = getDb().select().from(gymExercises).where(eq(gymExercises.name, name)).get();
  if (!row) throw new Error(`missing ${name}`);
  return row.id;
}

describe("listExercises (catalog-backed)", () => {
  it("seeds the catalog on first read and paginates", () => {
    const first = listExercises({ limit: 10 });
    expect(first.rows).toHaveLength(10);
    expect(first.total).toBeGreaterThan(1000);
    const second = listExercises({ limit: 10, offset: 10 });
    expect(second.rows[0].id).not.toBe(first.rows[0].id);
  });

  it("matches every search word, case-insensitively", () => {
    const { rows, total } = listExercises({ query: "BENCH barbell", limit: 200 });
    expect(total).toBeGreaterThan(0);
    expect(rows.map((r) => r.name)).toContain("Barbell Bench Press");
    for (const row of rows) {
      expect(row.name.toLowerCase()).toContain("bench");
      expect(row.name.toLowerCase()).toContain("barbell");
    }
  });

  it("treats LIKE wildcards in a search as literal text", () => {
    expect(listExercises({ query: "%" }).total).toBe(0);
  });

  it("filters by body part and equipment", () => {
    const { rows } = listExercises({ bodyPart: "chest", equipment: "dumbbell", limit: 200 });
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) expect(row).toMatchObject({ bodyPart: "chest", equipment: "dumbbell" });
  });

  it("filters by body-map muscle through the dataset's target vocabulary", () => {
    const { rows, total } = listExercises({ muscle: "upper-back", limit: 200 });
    expect(total).toBeGreaterThan(0);
    const targets = new Set(rows.map((r) => r.target));
    expect(targets.has("lats") || targets.has("upper back")).toBe(true);
    for (const row of rows) expect(muscleOf(row.target)).toBe("upper-back");
  });

  it("returns nothing for a muscle no exercise primarily targets", () => {
    expect(listExercises({ muscle: "tibialis" })).toEqual({ rows: [], total: 0 });
  });

  it("limits to owned equipment plus body weight, and ignores an empty list", () => {
    const everything = listExercises({ ownedEquipmentOnly: true }).total;
    expect(everything).toBe(listExercises().total);

    updateGymSettings({ ownedEquipment: ["Dumbbell"] });
    const { rows, total } = listExercises({ ownedEquipmentOnly: true, limit: 200 });
    expect(total).toBeLessThan(everything);
    const equipment = new Set(rows.map((r) => r.equipment));
    expect([...equipment].every((e) => e === "dumbbell" || e === "body weight")).toBe(true);
  });

  it("puts favorites first and can show only favorites", () => {
    const squat = catalogId("Barbell Full Squat");
    setExerciseFavorite(squat, true);
    expect(listExercises({ limit: 1 }).rows[0].id).toBe(squat);
    expect(listExercises({ favoritesOnly: true })).toMatchObject({ total: 1 });
    setExerciseFavorite(squat, false);
    expect(listExercises({ favoritesOnly: true }).total).toBe(0);
  });

  it("lists equipment by frequency and body parts in canonical order", () => {
    const equipment = listEquipmentOptions();
    expect(equipment[0].equipment).toBe("body weight");
    expect(equipment[0].count).toBeGreaterThanOrEqual(equipment[1].count);
    const chestOnly = listEquipmentOptions({ bodyPart: "chest" });
    expect(chestOnly.reduce((n, e) => n + e.count, 0)).toBe(
      listExercises({ bodyPart: "chest" }).total,
    );
    expect(
      listBodyParts()
        .map((b) => b.bodyPart)
        .slice(0, 3),
    ).toEqual(["chest", "back", "shoulders"]);
  });
});

describe("custom exercises", () => {
  it("creates with sensible defaults from the body part", () => {
    const curl = createCustomExercise({ name: "  Spider   Curl ", bodyPart: "upper arms" });
    expect(curl).toMatchObject({
      name: "Spider Curl",
      isCustom: true,
      equipment: "other",
      target: "upper arms",
      defaultMode: "reps",
    });
    const run = createCustomExercise({ name: "Trail run", bodyPart: "cardio", isBodyweight: true });
    expect(run).toMatchObject({ defaultMode: "cardio", equipment: "body weight" });
    const fly = createCustomExercise({
      name: "Band fly",
      bodyPart: "chest",
      equipment: "Band",
      secondaryMuscles: ["Shoulders", "shoulders", " "],
      instructions: ["Step one", "", "Step two"],
    });
    expect(fly).toMatchObject({
      target: "pectorals",
      equipment: "band",
      secondaryMuscles: ["shoulders"],
      instructions: ["Step one", "Step two"],
    });
    expect(getExercisesByIds([fly.id, 999_999, curl.id]).map((e) => e.id)).toEqual([
      fly.id,
      curl.id,
    ]);
  });

  it("rejects duplicate names, unknown body parts and edits to built-ins", () => {
    createCustomExercise({ name: "Spider Curl", bodyPart: "upper arms" });
    expect(() => createCustomExercise({ name: "spider curl", bodyPart: "upper arms" })).toThrow(
      "already have",
    );
    expect(() => createCustomExercise({ name: "barbell bench press", bodyPart: "chest" })).toThrow(
      "already in the exercise library",
    );
    expect(() => createCustomExercise({ name: "Thing", bodyPart: "elbows" })).toThrow("body part");
    expect(() => createCustomExercise({ name: "  ", bodyPart: "chest" })).toThrow("required");
    const bench = catalogId("Barbell Bench Press");
    expect(() => updateCustomExercise(bench, { name: "Bench", bodyPart: "chest" })).toThrow(
      "can't be edited",
    );
    expect(() => removeCustomExercise(bench)).toThrow("can't be removed");
    expect(() => getExercise(999_999)).toThrow("doesn't exist");
  });

  it("updates a custom exercise and keeps notes on built-ins", () => {
    const own = createCustomExercise({ name: "Landmine press", bodyPart: "shoulders" });
    const updated = updateCustomExercise(own.id, {
      name: "Landmine press (1 arm)",
      bodyPart: "shoulders",
      isUnilateral: true,
    });
    expect(updated).toMatchObject({ name: "Landmine press (1 arm)", isUnilateral: true });
    // Renaming to its own name is not a duplicate.
    expect(() =>
      updateCustomExercise(own.id, { name: "Landmine press (1 arm)", bodyPart: "shoulders" }),
    ).not.toThrow();

    const bench = catalogId("Barbell Bench Press");
    expect(updateExerciseNotes(bench, "  Seat 4, thumbs on rings  ").notes).toBe(
      "Seat 4, thumbs on rings",
    );
    expect(updateExerciseNotes(bench, "   ").notes).toBeNull();
  });

  it("deletes an unused custom exercise but archives one a routine uses", () => {
    const unused = createCustomExercise({ name: "Unused", bodyPart: "waist" });
    expect(removeCustomExercise(unused.id)).toEqual({ outcome: "deleted" });
    expect(() => getExercise(unused.id)).toThrow();

    const used = createCustomExercise({ name: "Used", bodyPart: "waist" });
    const routine = createRoutine({ name: "Core" });
    addRoutineEntry(routine.id, used.id);
    expect(removeCustomExercise(used.id)).toEqual({ outcome: "archived" });
    expect(getExercise(used.id).archivedAt).not.toBeNull();
    expect(listExercises({ query: "Used" }).total).toBe(0);
    expect(listExercises({ query: "Used", includeArchived: true }).total).toBe(1);

    // The name is free again while archived; restoring then conflicts.
    const again = createCustomExercise({ name: "Used", bodyPart: "waist" });
    expect(() => restoreCustomExercise(used.id)).toThrow("already called");
    removeCustomExercise(again.id);
    expect(restoreCustomExercise(used.id).archivedAt).toBeNull();
  });

  it("archives a custom exercise that a logged workout references", () => {
    const own = createCustomExercise({ name: "Sled push", bodyPart: "upper legs" });
    const db = getDb();
    const workout = db
      .insert(gymWorkouts)
      .values({ date: "2026-10-01", startedAt: "2026-10-01T07:00:00", name: "Quick workout" })
      .returning()
      .get();
    db.insert(gymWorkoutExercises)
      .values({ workoutId: workout.id, exerciseId: own.id, position: 0 })
      .run();
    expect(removeCustomExercise(own.id)).toEqual({ outcome: "archived" });
  });
});
