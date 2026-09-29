import { beforeEach, afterEach, describe, expect, it } from "vitest";
import { setupTestDb, teardownTestDb } from "@/test/db";
import { createGoal, getActiveGoalsCount, getGoalById, getGoals, setGoalProgress } from "./service";

beforeEach(setupTestDb);
afterEach(teardownTestDb);

describe("plans service", () => {
  it("sorts goals by priority rank, then newest first within a tier", () => {
    createGoal({ name: "Aspirational goal", type: "other", priority: "aspirational" });
    createGoal({ name: "Must-have goal", type: "other", priority: "must_have" });
    createGoal({ name: "Important goal", type: "other", priority: "important" });

    const goals = getGoals();

    expect(goals.map((g) => g.name)).toEqual([
      "Must-have goal",
      "Important goal",
      "Aspirational goal",
    ]);
  });

  it("counts active goals", () => {
    expect(getActiveGoalsCount()).toBe(0);
    createGoal({ name: "Goal", type: "other", priority: "important" });
    expect(getActiveGoalsCount()).toBe(1);
  });

  it("fetches a goal by id, or null when missing", () => {
    const created = createGoal({
      name: "Goal",
      type: "financial",
      priority: "must_have",
      targetAmount: 1000,
    });

    expect(getGoalById(created.id)).toMatchObject({ name: "Goal", targetAmount: 1000 });
    expect(getGoalById(created.id + 999)).toBeNull();
  });

  it("updates progress for a non-financial goal", () => {
    const created = createGoal({
      name: "Habit",
      type: "other",
      priority: "important",
      progressPercent: 0,
    });

    const updated = setGoalProgress(created.id, 42);

    expect(updated?.progressPercent).toBe(42);
    expect(getGoalById(created.id)?.progressPercent).toBe(42);
  });

  it("rejects progress outside the valid range", () => {
    const goal = createGoal({ name: "Habit", type: "other", priority: "important" });

    expect(() => setGoalProgress(goal.id, 101)).toThrow("between 0 and 100");
    expect(() => setGoalProgress(goal.id, -1)).toThrow("between 0 and 100");
  });
});
