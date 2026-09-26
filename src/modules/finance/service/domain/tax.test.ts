import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { setupTestDb, teardownTestDb } from "@/test/db";
import {
  get80cUtilization,
  get80dUtilization,
  getCapitalGainsEstimate,
  getCurrentFinancialYear,
  getRegimeComparison,
} from "./tax";
import { createAccount } from "./accounts";
import { createCategory } from "./categories";
import { createTransaction } from "./transactions";
import { createCashFlow, createHolding } from "./investments";
import { createRecurringRule } from "./recurring";
import { createInsurancePolicy } from "./insurance";

beforeEach(setupTestDb);
afterEach(teardownTestDb);

describe("tax service", () => {
  describe("getCurrentFinancialYear", () => {
    it("India's FY runs April-March: a date in June belongs to the FY that started this April", () => {
      expect(getCurrentFinancialYear(new Date("2026-06-15"))).toEqual({
        start: "2026-04-01",
        end: "2027-04-01",
        label: "FY 2026-27",
      });
    });

    it("a date in February belongs to the FY that started last April", () => {
      expect(getCurrentFinancialYear(new Date("2026-02-15"))).toEqual({
        start: "2025-04-01",
        end: "2026-04-01",
        label: "FY 2025-26",
      });
    });
  });

  describe("80C / 80D utilization", () => {
    it("hand-verified: sums 80C-eligible holding contributions plus 80C/80D-flagged insurance premiums for the current FY", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-06-01T00:00:00Z"));

      const account = createAccount({ name: "Checking", type: "checking", openingBalance: 0 });
      const premiumCategory = createCategory({ name: "Insurance Premium", type: "expense" });

      const lifeRule = createRecurringRule({
        type: "expense",
        accountId: account.id,
        categoryId: premiumCategory.id,
        amount: 20000,
        frequency: "yearly",
        startDate: "2020-01-01",
      });
      createInsurancePolicy({
        type: "life",
        provider: "Acme",
        name: "Term Life",
        premiumAmount: 20000,
        premiumFrequency: "yearly",
        startDate: "2020-01-01",
        is80cEligible: true,
        is80dEligible: false,
        recurringRuleId: lifeRule.id,
      });
      createTransaction({
        type: "expense",
        accountId: account.id,
        categoryId: premiumCategory.id,
        amount: 20000,
        date: "2026-05-01",
        recurringRuleId: lifeRule.id,
      });

      const healthRule = createRecurringRule({
        type: "expense",
        accountId: account.id,
        categoryId: premiumCategory.id,
        amount: 15000,
        frequency: "yearly",
        startDate: "2020-01-01",
      });
      createInsurancePolicy({
        type: "health",
        provider: "Acme",
        name: "Health Cover",
        premiumAmount: 15000,
        premiumFrequency: "yearly",
        startDate: "2020-01-01",
        is80cEligible: false,
        is80dEligible: true,
        recurringRuleId: healthRule.id,
      });
      createTransaction({
        type: "expense",
        accountId: account.id,
        categoryId: premiumCategory.id,
        amount: 15000,
        date: "2026-05-01",
        recurringRuleId: healthRule.id,
      });

      const elss = createHolding({
        type: "equity",
        name: "ELSS Fund",
        units: 1,
        is80cEligible: true,
      });
      createCashFlow({
        holdingId: elss.id,
        date: "2026-05-15",
        amount: -50000,
        flowType: "contribution",
      });

      // 80C: 50000 (ELSS contribution) + 20000 (life premium) = 70000, against the default 150000 limit.
      expect(get80cUtilization()).toEqual({ used: 70000, limit: 150000 });
      // 80D: 15000 (health premium only), against the default 25000 limit.
      expect(get80dUtilization()).toEqual({ used: 15000, limit: 25000 });

      vi.useRealTimers();
    });
  });

  describe("getCapitalGainsEstimate (FIFO gain matching)", () => {
    it("a redemption within the matched lot's cost basis is return of capital, not a gain", () => {
      const holding = createHolding({ type: "equity", name: "Stock RC" });
      createCashFlow({
        holdingId: holding.id,
        date: "2020-01-01",
        amount: -10000,
        flowType: "contribution",
      });
      createCashFlow({
        holdingId: holding.id,
        date: "2021-01-01",
        amount: 6000,
        flowType: "redemption",
      });

      const estimate = getCapitalGainsEstimate();

      expect(estimate.events).toHaveLength(0);
      expect(estimate.totalTax).toBe(0);
    });

    it("hand-verified: gain equals proceeds beyond the FIFO-matched cost basis, split across LTCG/STCG per lot age", () => {
      const equityHolding = createHolding({ type: "equity", name: "Stock A" });
      createCashFlow({
        holdingId: equityHolding.id,
        date: "2020-01-01",
        amount: -200000,
        flowType: "contribution",
      });
      // 17 months later (>= the 12-month equity LTCG threshold): 350000 proceeds - 200000 cost = 150000 gain, long-term.
      createCashFlow({
        holdingId: equityHolding.id,
        date: "2021-06-01",
        amount: 350000,
        flowType: "redemption",
      });

      const mfHolding = createHolding({ type: "mutual_fund_domestic", name: "Fund B" });
      createCashFlow({
        holdingId: mfHolding.id,
        date: "2021-01-01",
        amount: -50000,
        flowType: "contribution",
      });
      // 5 months later (< 12-month threshold): 70000 proceeds - 50000 cost = 20000 gain, short-term.
      createCashFlow({
        holdingId: mfHolding.id,
        date: "2021-06-01",
        amount: 70000,
        flowType: "redemption",
      });

      const estimate = getCapitalGainsEstimate();

      expect(estimate.events).toHaveLength(2);
      expect(estimate.ltcgEquity).toBe(150000);
      expect(estimate.stcgEquity).toBe(20000);
      expect(estimate.ltcgOther).toBe(0);
      expect(estimate.stcgOther).toBe(0);
      // (150000 - 125000 exemption) * 12.5%.
      expect(estimate.taxEquityLtcg).toBeCloseTo(3125, 6);
      // 20000 * 20%.
      expect(estimate.taxEquityStcg).toBeCloseTo(4000, 6);
      expect(estimate.totalTax).toBeCloseTo(7125, 6);
    });
  });

  describe("getRegimeComparison", () => {
    it("hand-verified: old vs. new regime slab tax for a clean 900000 income with no deductions", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-06-01T00:00:00Z"));

      const account = createAccount({ name: "Checking", type: "checking", openingBalance: 0 });
      const salary = createCategory({ name: "Salary", type: "income" });
      createTransaction({
        type: "income",
        accountId: account.id,
        categoryId: salary.id,
        amount: 900000,
        date: "2026-05-01",
      });

      const comparison = getRegimeComparison();

      // Old: taxable = 900000 - 50000 standard deduction = 850000.
      // 0% up to 250000, 5% of next 250000 (=12500), 20% of next 350000 (=70000) = 82500, *1.04 cess = 85800.
      // New: taxable = 900000 - 75000 standard deduction = 825000.
      // 0% up to 300000, 5% of next 400000 (=20000), 10% of next 125000 (=12500) = 32500, *1.04 cess = 33800.
      expect(comparison).toEqual({
        totalIncome: 900000,
        eightyCUsed: 0,
        eightyDUsed: 0,
        oldRegimeTax: 85800,
        newRegimeTax: 33800,
        betterRegime: "new",
        savings: 52000,
        reason: expect.stringContaining("beat the old regime"),
      });

      vi.useRealTimers();
    });
  });
});
