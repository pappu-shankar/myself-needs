import { beforeEach, afterEach, describe, expect, it } from "vitest";
import { setupTestDb, teardownTestDb } from "@/test/db";
import { createBudget, getBudgetSpend, getBudgetsForMonth } from "./budgets";
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
      monthlyLimitMinor: 50_000,
      effectiveFrom: "2026-01-01",
    });

    expect(budget).toMatchObject({
      categoryId: category.id,
      monthlyLimitMinor: 50_000,
      currency: "INR",
      effectiveFrom: "2026-01-01",
    });
  });

  it("rejects a limit that is not whole minor units, or is negative", () => {
    const category = createCategory({ name: "Groceries", type: "expense" });

    expect(() =>
      createBudget({
        categoryId: category.id,
        monthlyLimitMinor: 500.5,
        effectiveFrom: "2026-01-01",
      }),
    ).toThrow(/whole number of minor units/);
    expect(() =>
      createBudget({
        categoryId: category.id,
        monthlyLimitMinor: -1,
        effectiveFrom: "2026-01-01",
      }),
    ).toThrow(/not be negative|not negative/);
  });

  it("applies a budget set mid-month to that entire month, not just from its effective date (month-granularity comparison)", () => {
    const category = createCategory({ name: "Dining", type: "expense" });
    createBudget({
      categoryId: category.id,
      monthlyLimitMinor: 30_000,
      effectiveFrom: "2026-03-15",
    });

    const results = getBudgetsForMonth("2026-03");

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      categoryName: "Dining",
      monthlyLimitMinor: 30_000,
      effectiveFrom: "2026-03-15",
    });
  });

  it("does not apply a budget to months before its effective month", () => {
    const category = createCategory({ name: "Dining", type: "expense" });
    createBudget({
      categoryId: category.id,
      monthlyLimitMinor: 30_000,
      effectiveFrom: "2026-03-15",
    });

    expect(getBudgetsForMonth("2026-02")).toHaveLength(0);
  });

  it("uses the most recent effective budget on or before the queried month, per category", () => {
    const category = createCategory({ name: "Dining", type: "expense" });
    createBudget({
      categoryId: category.id,
      monthlyLimitMinor: 30_000,
      effectiveFrom: "2026-01-01",
    });
    createBudget({
      categoryId: category.id,
      monthlyLimitMinor: 40_000,
      effectiveFrom: "2026-03-01",
    });

    expect(
      getBudgetsForMonth("2026-02").find((r) => r.categoryName === "Dining")?.monthlyLimitMinor,
    ).toBe(30_000);
    expect(
      getBudgetsForMonth("2026-03").find((r) => r.categoryName === "Dining")?.monthlyLimitMinor,
    ).toBe(40_000);
    expect(
      getBudgetsForMonth("2026-06").find((r) => r.categoryName === "Dining")?.monthlyLimitMinor,
    ).toBe(40_000);
  });

  it("computes actual spend from expense transactions within the queried month, ignoring other months and other types", () => {
    const account = createAccount({ name: "Checking", type: "checking" });
    const category = createCategory({ name: "Dining", type: "expense" });
    const income = createCategory({ name: "Salary", type: "income" });
    createBudget({
      categoryId: category.id,
      monthlyLimitMinor: 30_000,
      effectiveFrom: "2026-01-01",
    });

    createTransaction({
      type: "expense",
      accountId: account.id,
      categoryId: category.id,
      amountMinor: 5_000,
      date: "2026-03-05",
    });
    createTransaction({
      type: "expense",
      accountId: account.id,
      categoryId: category.id,
      amountMinor: 3_000,
      date: "2026-03-20",
    });
    createTransaction({
      type: "expense",
      accountId: account.id,
      categoryId: category.id,
      amountMinor: 99_900,
      date: "2026-04-01",
    });
    createTransaction({
      type: "income",
      accountId: account.id,
      categoryId: income.id,
      amountMinor: 100_000,
      date: "2026-03-10",
    });

    const result = getBudgetsForMonth("2026-03").find((r) => r.categoryName === "Dining");

    expect(result?.actualSpendMinor).toBe(8_000);
  });

  it("reports zero actual spend for a budgeted category with no transactions", () => {
    const category = createCategory({ name: "Travel", type: "expense" });
    createBudget({
      categoryId: category.id,
      monthlyLimitMinor: 100_000,
      effectiveFrom: "2026-01-01",
    });

    const result = getBudgetsForMonth("2026-05").find((r) => r.categoryName === "Travel");

    expect(result?.actualSpendMinor).toBe(0);
  });

  it("setting a budget again for the same category and effective date upserts instead of erroring, and the category is listed only once", () => {
    const category = createCategory({ name: "Groceries", type: "expense" });

    createBudget({
      categoryId: category.id,
      monthlyLimitMinor: 50_000,
      effectiveFrom: "2026-03-01",
    });
    // Same (category, effectiveFrom) as above — would previously fail with a
    // raw unique-constraint error (finance_budgets_category_effective_idx).
    const updated = createBudget({
      categoryId: category.id,
      monthlyLimitMinor: 70_000,
      effectiveFrom: "2026-03-01",
    });

    expect(updated).toMatchObject({ categoryId: category.id, monthlyLimitMinor: 70_000 });

    const results = getBudgetsForMonth("2026-03").filter((r) => r.categoryName === "Groceries");
    expect(results).toHaveLength(1);
    expect(results[0].monthlyLimitMinor).toBe(70_000);
  });

  it("defaults to the current month when no month is given", () => {
    const category = createCategory({ name: "Groceries", type: "expense" });
    const now = new Date();
    const currentMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
    createBudget({
      categoryId: category.id,
      monthlyLimitMinor: 25_000,
      effectiveFrom: `${currentMonth}-01`,
    });

    const results = getBudgetsForMonth();

    expect(results.find((r) => r.categoryName === "Groceries")?.monthlyLimitMinor).toBe(25_000);
  });

  describe("getBudgetSpend", () => {
    it("converts spend into the budget's own currency, not the vault's base currency", () => {
      // A GBP travel budget with spend in both GBP and INR. Comparing in the
      // base (INR) would make an on-target budget read as an overrun whenever
      // the rupee moved — see docs/prd/finance/budgets.md § Currency.
      const spend = getBudgetSpend(
        new Map([
          ["GBP", 12_000],
          ["INR", 105_000],
        ]),
        "GBP",
        {
          asOf: "2026-03-10",
          rates: [
            {
              base: "GBP",
              quote: "INR",
              date: "2026-03-09",
              rateScaled: 105_00000000,
              source: "test",
            },
          ],
        },
      );

      expect(spend.baseCurrency).toBe("GBP");
      expect(spend.complete).toBe(true);
      // ₹1,050.00 at 105 INR/GBP is exactly £10.00.
      expect(spend.baseMinor).toBe(12_000 + 1_000);
    });

    it("reports spend it could not convert instead of dropping it from the comparison", () => {
      const spend = getBudgetSpend(
        new Map([
          ["GBP", 12_000],
          ["USD", 5_000],
        ]),
        "GBP",
        { asOf: "2026-03-10", rates: [] },
      );

      expect(spend.baseMinor).toBe(12_000);
      expect(spend.complete).toBe(false);
      expect(spend.byCurrency.find((c) => c.currency === "USD")?.baseMinor).toBeNull();
    });
  });
});
