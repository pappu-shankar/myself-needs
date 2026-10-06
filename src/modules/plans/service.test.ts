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
      targetAmountMinor: 100_000,
      currency: "INR",
    });

    expect(getGoalById(created.id)).toMatchObject({
      name: "Goal",
      targetAmountMinor: 100_000,
      currency: "INR",
    });
    expect(getGoalById(created.id + 999)).toBeNull();
  });

  it("defaults a goal's currency to INR when none is given", () => {
    const created = createGoal({ name: "Goal", type: "other", priority: "important" });

    expect(getGoalById(created.id)?.currency).toBe("INR");
  });

  it("rejects a target amount that isn't a positive integer minor amount", () => {
    const entry = { name: "Goal", type: "financial", priority: "must_have" } as const;

    expect(() => createGoal({ ...entry, targetAmountMinor: 0 })).toThrow("greater than zero");
    expect(() => createGoal({ ...entry, targetAmountMinor: -100 })).toThrow("greater than zero");
    // Major units passed straight through instead of via `toMinor`.
    expect(() => createGoal({ ...entry, targetAmountMinor: 1000.5 })).toThrow("greater than zero");
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
