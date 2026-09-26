import { beforeEach, afterEach, describe, expect, it } from "vitest";
import { setupTestDb, teardownTestDb } from "@/test/db";
import { createCategory, getCategories, getCategoriesByType } from "./categories";

beforeEach(setupTestDb);
afterEach(teardownTestDb);

describe("categories service", () => {
  it("creates a category and returns the persisted row", () => {
    const category = createCategory({ name: "Groceries", type: "expense" });

    expect(category).toMatchObject({ name: "Groceries", type: "expense" });
    expect(category.id).toEqual(expect.any(Number));
  });

  it("supports a parent category reference for sub-categories", () => {
    const parent = createCategory({ name: "Food", type: "expense" });
    const child = createCategory({
      name: "Dining Out",
      type: "expense",
      parentCategoryId: parent.id,
    });

    expect(child.parentCategoryId).toBe(parent.id);
  });

  it("lists all categories sorted by name", () => {
    createCategory({ name: "Zebra", type: "expense" });
    createCategory({ name: "Apple", type: "income" });

    expect(getCategories().map((c) => c.name)).toEqual(["Apple", "Zebra"]);
  });

  it("filters categories by type", () => {
    createCategory({ name: "Salary", type: "income" });
    createCategory({ name: "Rent", type: "expense" });
    createCategory({ name: "Freelance", type: "income" });

    expect(getCategoriesByType("income").map((c) => c.name)).toEqual(["Freelance", "Salary"]);
    expect(getCategoriesByType("expense").map((c) => c.name)).toEqual(["Rent"]);
  });
});
