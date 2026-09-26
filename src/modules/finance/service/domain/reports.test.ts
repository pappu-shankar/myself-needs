import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { setupTestDb, teardownTestDb } from "@/test/db";
import { getEmergencyFundMonths, getIncomeExpenseReport } from "./reports";
import { createAccount } from "./accounts";
import { createCategory } from "./categories";
import { createTransaction } from "./transactions";

beforeEach(setupTestDb);
afterEach(teardownTestDb);

describe("reports service", () => {
  describe("getIncomeExpenseReport", () => {
    it("hand-verified: trend, category breakdown, and savings rate over a pinned window", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-03-15T00:00:00Z"));

      const checking = createAccount({ name: "Checking", type: "checking", openingBalance: 0 });
      const salary = createCategory({ name: "Salary", type: "income" });
      const groceries = createCategory({ name: "Groceries", type: "expense" });
      const rent = createCategory({ name: "Rent", type: "expense" });

      createTransaction({
        type: "income",
        accountId: checking.id,
        categoryId: salary.id,
        amount: 3000,
        date: "2026-02-05",
      });
      createTransaction({
        type: "expense",
        accountId: checking.id,
        categoryId: groceries.id,
        amount: 500,
        date: "2026-02-10",
      });
      createTransaction({
        type: "expense",
        accountId: checking.id,
        categoryId: rent.id,
        amount: 1000,
        date: "2026-02-01",
      });
      createTransaction({
        type: "income",
        accountId: checking.id,
        categoryId: salary.id,
        amount: 3000,
        date: "2026-03-05",
      });
      createTransaction({
        type: "expense",
        accountId: checking.id,
        categoryId: groceries.id,
        amount: 700,
        date: "2026-03-10",
      });

      const report = getIncomeExpenseReport(2);

      expect(report.trend).toEqual([
        { month: "2026-02", income: 3000, expense: 1500 },
        { month: "2026-03", income: 3000, expense: 700 },
      ]);
      expect(report.categoryBreakdown).toEqual([
        { categoryId: groceries.id, categoryName: "Groceries", total: 1200 },
        { categoryId: rent.id, categoryName: "Rent", total: 1000 },
      ]);
      // (6000 total income - 2200 total expense) / 6000.
      expect(report.savingsRate).toBeCloseTo(3800 / 6000, 10);

      vi.useRealTimers();
    });

    it("returns a null savings rate when there was no income in the window", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-03-15T00:00:00Z"));

      const checking = createAccount({ name: "Checking", type: "checking", openingBalance: 0 });
      const groceries = createCategory({ name: "Groceries", type: "expense" });
      createTransaction({
        type: "expense",
        accountId: checking.id,
        categoryId: groceries.id,
        amount: 100,
        date: "2026-03-01",
      });

      expect(getIncomeExpenseReport(1).savingsRate).toBeNull();

      vi.useRealTimers();
    });
  });

  describe("getEmergencyFundMonths", () => {
    it("hand-verified: liquid assets divided by trailing-3-month average expense", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-03-15T00:00:00Z"));

      const checking = createAccount({ name: "Checking", type: "checking", openingBalance: 6000 });
      createAccount({ name: "Home Loan", type: "loan", openingBalance: 2000 }); // not liquid, excluded
      const misc = createCategory({ name: "Misc", type: "expense" });

      createTransaction({
        type: "expense",
        accountId: checking.id,
        categoryId: misc.id,
        amount: 1000,
        date: "2026-01-15",
      });
      createTransaction({
        type: "expense",
        accountId: checking.id,
        categoryId: misc.id,
        amount: 500,
        date: "2026-02-15",
      });
      createTransaction({
        type: "expense",
        accountId: checking.id,
        categoryId: misc.id,
        amount: 300,
        date: "2026-03-01",
      });

      // Liquid assets: 6000 opening - 1800 in expenses already reflected in the account balance = 4200.
      // Average monthly expense over the trailing 3 months: (1000+500+300)/3 = 600.
      expect(getEmergencyFundMonths()).toBeCloseTo(4200 / 600, 10);

      vi.useRealTimers();
    });

    it("returns null when there's no expense history to divide by", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-03-15T00:00:00Z"));

      createAccount({ name: "Checking", type: "checking", openingBalance: 6000 });

      expect(getEmergencyFundMonths()).toBeNull();

      vi.useRealTimers();
    });
  });
});
