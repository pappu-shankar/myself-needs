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

      const checking = createAccount({ name: "Checking", type: "checking", openingBalanceMinor: 0 });
      const salary = createCategory({ name: "Salary", type: "income" });
      const groceries = createCategory({ name: "Groceries", type: "expense" });
      const rent = createCategory({ name: "Rent", type: "expense" });

      createTransaction({
        type: "income",
        accountId: checking.id,
        categoryId: salary.id,
        amountMinor: 300000,
        date: "2026-02-05",
      });
      createTransaction({
        type: "expense",
        accountId: checking.id,
        categoryId: groceries.id,
        amountMinor: 50000,
        date: "2026-02-10",
      });
      createTransaction({
        type: "expense",
        accountId: checking.id,
        categoryId: rent.id,
        amountMinor: 100000,
        date: "2026-02-01",
      });
      createTransaction({
        type: "income",
        accountId: checking.id,
        categoryId: salary.id,
        amountMinor: 300000,
        date: "2026-03-05",
      });
      createTransaction({
        type: "expense",
        accountId: checking.id,
        categoryId: groceries.id,
        amountMinor: 70000,
        date: "2026-03-10",
      });

      const report = getIncomeExpenseReport({ months: 2 });

      expect(report.complete).toBe(true);
      expect(report.trend.map((t) => [t.month, t.income.baseMinor, t.expense.baseMinor])).toEqual([
        ["2026-02", 300000, 150000],
        ["2026-03", 300000, 70000],
      ]);
      expect(
        report.categoryBreakdown.map((c) => [c.categoryId, c.categoryName, c.total.baseMinor]),
      ).toEqual([
        [groceries.id, "Groceries", 120000],
        [rent.id, "Rent", 100000],
      ]);
      // (6000 total income - 2200 total expense) / 6000.
      expect(report.savingsRate).toBeCloseTo(3800 / 6000, 10);

      vi.useRealTimers();
    });

    it("returns a null savings rate when there was no income in the window", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-03-15T00:00:00Z"));

      const checking = createAccount({ name: "Checking", type: "checking", openingBalanceMinor: 0 });
      const groceries = createCategory({ name: "Groceries", type: "expense" });
      createTransaction({
        type: "expense",
        accountId: checking.id,
        categoryId: groceries.id,
        amountMinor: 10000,
        date: "2026-03-01",
      });

      expect(getIncomeExpenseReport({ months: 1 }).savingsRate).toBeNull();

      vi.useRealTimers();
    });
  });

  describe("getEmergencyFundMonths", () => {
    it("hand-verified: liquid assets divided by the average expense over the last 3 *complete* months", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-03-15T00:00:00Z"));

      const checking = createAccount({ name: "Checking", type: "checking", openingBalanceMinor: 600000 });
      createAccount({ name: "Home Loan", type: "loan", openingBalanceMinor: 200000 }); // not liquid, excluded
      const misc = createCategory({ name: "Misc", type: "expense" });

      createTransaction({
        type: "expense",
        accountId: checking.id,
        categoryId: misc.id,
        amountMinor: 40000,
        date: "2025-12-20",
      });
      createTransaction({
        type: "expense",
        accountId: checking.id,
        categoryId: misc.id,
        amountMinor: 100000,
        date: "2026-01-15",
      });
      createTransaction({
        type: "expense",
        accountId: checking.id,
        categoryId: misc.id,
        amountMinor: 50000,
        date: "2026-02-15",
      });
      // In the current, still-partial month (today is 2026-03-15) — must be
      // excluded from the average, not counted as a quarter of "3 months".
      createTransaction({
        type: "expense",
        accountId: checking.id,
        categoryId: misc.id,
        amountMinor: 30000,
        date: "2026-03-01",
      });

      // Liquid assets: 6000 opening - (400+1000+500+300) in expenses already reflected in the account balance = 3800.
      // Average monthly expense over the last 3 *complete* months (Dec, Jan, Feb — March excluded): (400+1000+500)/3 = 633.33.
      const coverage = getEmergencyFundMonths();
      expect(coverage.complete).toBe(true);
      expect(coverage.liquidAssets.baseMinor).toBe(380000);
      expect(coverage.windowExpense.baseMinor).toBe(190000);
      expect(coverage.months).toBeCloseTo(3800 / (1900 / 3), 10);
      // Sanity check this isn't accidentally averaging over 4 months' worth of expense.
      expect(coverage.months).not.toBeCloseTo(3800 / (2200 / 3), 5);

      vi.useRealTimers();
    });

    it("excludes the current (partial) month even when the trailing months have no expenses", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-03-15T00:00:00Z"));

      const checking = createAccount({ name: "Checking", type: "checking", openingBalanceMinor: 600000 });
      const misc = createCategory({ name: "Misc", type: "expense" });

      // Only the current (partial) month has any expense — the trailing 3
      // complete months (Dec, Jan, Feb) are all empty, so there's no history
      // to divide by yet, regardless of today's spending.
      createTransaction({
        type: "expense",
        accountId: checking.id,
        categoryId: misc.id,
        amountMinor: 30000,
        date: "2026-03-10",
      });

      expect(getEmergencyFundMonths().months).toBeNull();

      vi.useRealTimers();
    });

    it("returns null when there's no expense history to divide by", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-03-15T00:00:00Z"));

      createAccount({ name: "Checking", type: "checking", openingBalanceMinor: 600000 });

      expect(getEmergencyFundMonths().months).toBeNull();

      vi.useRealTimers();
    });
  });
});
