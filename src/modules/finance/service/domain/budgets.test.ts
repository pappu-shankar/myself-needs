import { beforeEach, afterEach, describe, expect, it } from "vitest";
import { setupTestDb, teardownTestDb } from "@/test/db";
import { createBudget, getBudgetsForMonth } from "./budgets";
import { createCategory } from "./categories";
import { createAccount } from "./accounts";
import { createTransaction } from "./transactions";

beforeEach(setupTestDb);
afterEach(teardownTestDb);

describe("budgets service", () => {
  it("creates a budget and returns the persisted row", () => {
    const category = createCategory({ name: "Groceries", type: "expense" });

    const budget = createBudget({
      categoryId: category.id,
      monthlyLimit: 500,
      effectiveFrom: "2026-01-01",
    });

    expect(budget).toMatchObject({
      categoryId: category.id,
      monthlyLimit: 500,
      effectiveFrom: "2026-01-01",
    });
  });

  it("applies a budget set mid-month to that entire month, not just from its effective date (month-granularity comparison)", () => {
    const category = createCategory({ name: "Dining", type: "expense" });
    createBudget({ categoryId: category.id, monthlyLimit: 300, effectiveFrom: "2026-03-15" });

    const results = getBudgetsForMonth("2026-03");

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      categoryName: "Dining",
      monthlyLimit: 300,
      effectiveFrom: "2026-03-15",
    });
  });

  it("does not apply a budget to months before its effective month", () => {
    const category = createCategory({ name: "Dining", type: "expense" });
    createBudget({ categoryId: category.id, monthlyLimit: 300, effectiveFrom: "2026-03-15" });

    expect(getBudgetsForMonth("2026-02")).toHaveLength(0);
  });

  it("uses the most recent effective budget on or before the queried month, per category", () => {
    const category = createCategory({ name: "Dining", type: "expense" });
    createBudget({ categoryId: category.id, monthlyLimit: 300, effectiveFrom: "2026-01-01" });
    createBudget({ categoryId: category.id, monthlyLimit: 400, effectiveFrom: "2026-03-01" });

    expect(
      getBudgetsForMonth("2026-02").find((r) => r.categoryName === "Dining")?.monthlyLimit,
    ).toBe(300);
    expect(
      getBudgetsForMonth("2026-03").find((r) => r.categoryName === "Dining")?.monthlyLimit,
    ).toBe(400);
    expect(
      getBudgetsForMonth("2026-06").find((r) => r.categoryName === "Dining")?.monthlyLimit,
    ).toBe(400);
  });

  it("computes actual spend from expense transactions within the queried month, ignoring other months and other types", () => {
    const account = createAccount({ name: "Checking", type: "checking" });
    const category = createCategory({ name: "Dining", type: "expense" });
    const income = createCategory({ name: "Salary", type: "income" });
    createBudget({ categoryId: category.id, monthlyLimit: 300, effectiveFrom: "2026-01-01" });

    createTransaction({
      type: "expense",
      accountId: account.id,
      categoryId: category.id,
      amount: 50,
      date: "2026-03-05",
    });
    createTransaction({
      type: "expense",
      accountId: account.id,
      categoryId: category.id,
      amount: 30,
      date: "2026-03-20",
    });
    createTransaction({
      type: "expense",
      accountId: account.id,
      categoryId: category.id,
      amount: 999,
      date: "2026-04-01",
    });
    createTransaction({
      type: "income",
      accountId: account.id,
      categoryId: income.id,
      amount: 1000,
      date: "2026-03-10",
    });

    const result = getBudgetsForMonth("2026-03").find((r) => r.categoryName === "Dining");

    expect(result?.actualSpend).toBe(80);
  });

  it("reports zero actual spend for a budgeted category with no transactions", () => {
    const category = createCategory({ name: "Travel", type: "expense" });
    createBudget({ categoryId: category.id, monthlyLimit: 1000, effectiveFrom: "2026-01-01" });

    const result = getBudgetsForMonth("2026-05").find((r) => r.categoryName === "Travel");

    expect(result?.actualSpend).toBe(0);
  });

  it("defaults to the current month when no month is given", () => {
    const category = createCategory({ name: "Groceries", type: "expense" });
    const now = new Date();
    const currentMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
    createBudget({
      categoryId: category.id,
      monthlyLimit: 250,
      effectiveFrom: `${currentMonth}-01`,
    });

    const results = getBudgetsForMonth();

    expect(results.find((r) => r.categoryName === "Groceries")?.monthlyLimit).toBe(250);
  });
});
