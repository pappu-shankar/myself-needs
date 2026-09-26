import { beforeEach, afterEach, describe, expect, it } from "vitest";
import { setupTestDb, teardownTestDb } from "@/test/db";
import { createGoal, searchPlans } from "./service";

beforeEach(setupTestDb);
afterEach(teardownTestDb);

describe("searchPlans", () => {
  it("returns matching goals with the shared search shape", () => {
    const created = createGoal({ name: "Buy a house", type: "other", priority: "must_have" });
    createGoal({ name: "Learn guitar", type: "other", priority: "aspirational" });

    const results = searchPlans("house");

    expect(results).toEqual([
      { type: "goal", id: created.id, label: "Buy a house", subtitle: "Must have", href: "/plans" },
    ]);
  });

  it("returns an empty array when nothing matches", () => {
    createGoal({ name: "Learn guitar", type: "other", priority: "aspirational" });

    expect(searchPlans("nonexistent")).toEqual([]);
  });

  it("returns an empty array for an empty or whitespace-only query", () => {
    createGoal({ name: "Learn guitar", type: "other", priority: "aspirational" });

    expect(searchPlans("")).toEqual([]);
    expect(searchPlans("   ")).toEqual([]);
  });

  it("caps results at 5", () => {
    for (let i = 0; i < 7; i++) {
      createGoal({ name: `Matching goal ${i}`, type: "other", priority: "important" });
    }

    expect(searchPlans("Matching")).toHaveLength(5);
  });
});
