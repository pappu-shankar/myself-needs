import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { count } from "drizzle-orm";
import { getDb } from "@/modules/core/db/client";
import { setupTestDb, teardownTestDb } from "@/test/db";
import { gymExercises } from "../../db/schema/gym/exercises";
import { CATALOG_SIZE, ensureExerciseCatalog } from "./catalog";

beforeEach(setupTestDb);
afterEach(teardownTestDb);

const rowCount = () => getDb().select({ n: count() }).from(gymExercises).get()?.n;

describe("exercise catalog seed", () => {
  it("inserts the whole bundled catalog once", () => {
    ensureExerciseCatalog();
    expect(rowCount()).toBe(CATALOG_SIZE);
    ensureExerciseCatalog();
    expect(rowCount()).toBe(CATALOG_SIZE);
  });

  it("stores muscles and steps as arrays", () => {
    ensureExerciseCatalog();
    const bench = getDb()
      .select()
      .from(gymExercises)
      .all()
      .find((e) => e.name === "Barbell Bench Press");
    expect(bench).toMatchObject({
      catalogKey: expect.any(String),
      bodyPart: "chest",
      isCustom: false,
    });
    expect(Array.isArray(bench?.secondaryMuscles)).toBe(true);
    expect(bench?.instructions.length).toBeGreaterThan(0);
  });
});
