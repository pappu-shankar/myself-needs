import { beforeEach, afterEach, describe, expect, it } from "vitest";
import { setupTestDb, teardownTestDb } from "@/test/db";
import { sql } from "drizzle-orm";
import { getDb } from "@/modules/core/db/client";
import { todayIso } from "@/lib/dates";
import {
  createCategory,
  deleteCategoryById,
  editCategory,
  getCategories,
  getCategoriesByType,
  getCategory,
  archiveCategoryById,
  unarchiveCategoryById,
} from "./categories";
import { createAccount } from "./accounts";
import { createTransaction, getTransaction } from "./transactions";
import { createRecurringRule } from "./recurring";

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

describe("editCategory", () => {
  it("renames in place rather than creating a second category", () => {
    const category = createCategory({ name: "Grocries", type: "expense" });

    const edited = editCategory(category.id, { name: "Groceries" });

    expect(edited.id).toBe(category.id);
    expect(getCategories()).toHaveLength(1);
    expect(getCategory(category.id)!.name).toBe("Groceries");
  });

  it("throws when the category is missing", () => {
    expect(() => editCategory(999, { name: "Nope" })).toThrow(/no longer exists/);
  });

  it("re-applies the create-time name rule", () => {
    const category = createCategory({ name: "Groceries", type: "expense" });

    expect(() => editCategory(category.id, { name: "   " })).toThrow(/needs a name/);
    expect(() => createCategory({ name: " ", type: "expense" })).toThrow(/needs a name/);
  });

  it("refuses to make a category its own parent", () => {
    const category = createCategory({ name: "Food", type: "expense" });

    expect(() => editCategory(category.id, { parentCategoryId: category.id })).toThrow(
      /its own parent/,
    );
  });

  it("re-parents and un-parents a category", () => {
    const parent = createCategory({ name: "Food", type: "expense" });
    const child = createCategory({ name: "Dining", type: "expense" });

    expect(editCategory(child.id, { parentCategoryId: parent.id }).parentCategoryId).toBe(
      parent.id,
    );
    expect(editCategory(child.id, { parentCategoryId: null }).parentCategoryId).toBeNull();
  });

  it("allows an income/expense switch while nothing is filed under the category", () => {
    const category = createCategory({ name: "Freelance", type: "expense" });

    expect(editCategory(category.id, { type: "income" }).type).toBe("income");
  });

  it("refuses an income/expense switch once a transaction is filed under it", () => {
    const account = createAccount({ name: "Checking", type: "checking" });
    const category = createCategory({ name: "Freelance", type: "expense" });
    createTransaction({
      type: "expense",
      accountId: account.id,
      categoryId: category.id,
      amountMinor: 25_000,
      date: "2026-03-01",
    });

    // The sign of every historical row in every report built on this category
    // depends on its type, so the switch would be a silent restatement.
    expect(() => editCategory(category.id, { type: "income" })).toThrow(
      /switched between income and expense/,
    );
    expect(getCategory(category.id)!.type).toBe("expense");
    // Renaming it is still fine.
    expect(editCategory(category.id, { name: "Consulting" }).name).toBe("Consulting");
  });
});

describe("deleteCategoryById", () => {
  it("deletes a category nothing references", () => {
    const category = createCategory({ name: "Unused", type: "expense" });

    deleteCategoryById(category.id);

    expect(getCategory(category.id)).toBeNull();
  });

  it("throws when the category is missing", () => {
    expect(() => deleteCategoryById(999)).toThrow(/no longer exists/);
  });

  it("refuses to delete a category a transaction references", () => {
    const account = createAccount({ name: "Checking", type: "checking" });
    const category = createCategory({ name: "Rent", type: "expense" });
    createTransaction({
      type: "expense",
      accountId: account.id,
      categoryId: category.id,
      amountMinor: 25_000,
      date: "2026-03-01",
    });

    expect(() => deleteCategoryById(category.id)).toThrow(/can't be deleted/);
    expect(getCategory(category.id)).not.toBeNull();
  });

  it("refuses to delete a category a voided transaction still references", () => {
    const account = createAccount({ name: "Checking", type: "checking" });
    const category = createCategory({ name: "Rent", type: "expense" });
    const transaction = createTransaction({
      type: "expense",
      accountId: account.id,
      categoryId: category.id,
      amountMinor: 25_000,
      date: "2026-03-01",
    });
    getDb().run(
      sql`UPDATE finance_transactions SET voided_at = '2026-03-02', void_reason = 'typo' WHERE id = ${transaction.id}`,
    );

    expect(() => deleteCategoryById(category.id)).toThrow(/can't be deleted/);
  });

  it("refuses to delete a category a budget references", () => {
    const category = createCategory({ name: "Rent", type: "expense" });
    getDb().run(
      sql`INSERT INTO finance_budgets (category_id, monthly_limit_minor, currency, effective_from)
          VALUES (${category.id}, 3000000, 'INR', '2026-03-01')`,
    );

    expect(() => deleteCategoryById(category.id)).toThrow(/can't be deleted/);
  });

  it("refuses to delete a category a recurring rule references", () => {
    const account = createAccount({ name: "Checking", type: "checking" });
    const category = createCategory({ name: "Rent", type: "expense" });
    createRecurringRule({
      type: "expense",
      accountId: account.id,
      categoryId: category.id,
      amountMinor: 100_000,
      currency: "INR",
      frequency: "monthly",
      startDate: "2026-01-01",
    });

    expect(() => deleteCategoryById(category.id)).toThrow(/can't be deleted/);
  });

  it("refuses to delete a parent that would orphan its sub-categories", () => {
    const parent = createCategory({ name: "Food", type: "expense" });
    createCategory({ name: "Dining", type: "expense", parentCategoryId: parent.id });

    expect(() => deleteCategoryById(parent.id)).toThrow(/sub-categories/);
  });
});

describe("archiving a category", () => {
  it("retires a category that cannot be deleted, without touching what is filed under it", () => {
    // The point of archive: a delete is refused precisely because history
    // references the category, so there has to be *some* way to retire it.
    const account = createAccount({ name: "Checking", type: "checking" });
    const category = createCategory({ name: "Old club membership", type: "expense" });
    const logged = createTransaction({
      type: "expense",
      accountId: account.id,
      categoryId: category.id,
      amountMinor: 150_000,
      date: "2026-02-01",
    });
    expect(() => deleteCategoryById(category.id)).toThrow(/can't be deleted/);

    archiveCategoryById(category.id);

    // Out of the pickers...
    expect(getCategories().map((c) => c.id)).not.toContain(category.id);
    expect(getCategoriesByType("expense").map((c) => c.id)).not.toContain(category.id);
    // ...but the transaction still says what it was for.
    expect(getTransaction(logged.id)?.categoryId).toBe(category.id);
  });

  it("round-trips through unarchive", () => {
    const category = createCategory({ name: "Groceries", type: "expense" });

    expect(archiveCategoryById(category.id).archivedAt).toBe(todayIso());
    expect(getCategories()).toHaveLength(0);

    expect(unarchiveCategoryById(category.id).archivedAt).toBeNull();
    expect(getCategories()).toHaveLength(1);
  });

  it("throws when the category is missing", () => {
    expect(() => archiveCategoryById(999)).toThrow(/no longer exists/);
    expect(() => unarchiveCategoryById(999)).toThrow(/no longer exists/);
  });
});
