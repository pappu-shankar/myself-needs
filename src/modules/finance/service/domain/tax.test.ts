import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { setupTestDb, teardownTestDb } from "@/test/db";
import {
  get80cUtilization,
  get80dUtilization,
  getCapitalGainsEstimate,
  getRegimeComparison,
  isLongTermHolding,
  listTaxFiscalYears,
} from "./tax";
import { setTaxSettings, startFiscalYear } from "../config/tax";
import { fiscalYearOf } from "../utility/fiscal-year";
import { createAccount } from "./accounts";
import { createCategory } from "./categories";
import { createTransaction } from "./transactions";
import { createCashFlow, createHolding } from "./investments";
import { createRecurringRule } from "./recurring";
import { createInsurancePolicy } from "./insurance";

beforeEach(setupTestDb);
afterEach(teardownTestDb);

describe("tax service", () => {
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
      expect(get80cUtilization()).toEqual({
        used: 70000,
        limit: 150000,
        policyFiscalYear: "2024-25",
      });
      // 80D: 15000 (health premium only), against the default 25000 limit.
      expect(get80dUtilization()).toEqual({
        used: 15000,
        limit: 25000,
        policyFiscalYear: "2024-25",
      });
      // FY-scoped: nothing was contributed or paid in the previous FY.
      expect(get80cUtilization(fiscalYearOf("2025-06-01")).used).toBe(0);

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

      const estimate = getCapitalGainsEstimate(fiscalYearOf("2021-01-01"));

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

      const estimate = getCapitalGainsEstimate(fiscalYearOf("2021-06-01"));

      expect(estimate.fiscalYear.label).toBe("2021-22");
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

    it("only counts redemptions inside the FY, applying the exemption once per FY", () => {
      // Two holdings, each: 100000 cost, 200000 proceeds = 100000 LTCG — one on the last day of
      // FY 2024-25, the other on the first day of FY 2025-26.
      for (const [name, redeemedOn] of [
        ["Stock F", "2025-03-31"],
        ["Stock G", "2025-04-01"],
      ]) {
        const holding = createHolding({ type: "equity", name });
        createCashFlow({
          holdingId: holding.id,
          date: "2020-01-01",
          amount: -100000,
          flowType: "contribution",
        });
        createCashFlow({
          holdingId: holding.id,
          date: redeemedOn,
          amount: 200000,
          flowType: "redemption",
        });
      }

      const fy2425 = getCapitalGainsEstimate(fiscalYearOf("2025-03-31"));
      const fy2526 = getCapitalGainsEstimate(fiscalYearOf("2025-04-01"));

      expect(fy2425.events.map((e) => e.redemptionDate)).toEqual(["2025-03-31"]);
      expect(fy2425.ltcgEquity).toBe(100000);
      expect(fy2526.events.map((e) => e.redemptionDate)).toEqual(["2025-04-01"]);
      expect(fy2526.ltcgEquity).toBe(100000);
      // 100000 each is under the 125000 exemption in each FY — lifetime 200000 would not be.
      expect(fy2425.totalTax).toBe(0);
      expect(fy2526.totalTax).toBe(0);
      expect(getCapitalGainsEstimate(fiscalYearOf("2023-06-01")).events).toHaveLength(0);
      expect(listTaxFiscalYears()).toEqual(expect.arrayContaining(["2025-26", "2024-25"]));
    });

    it("uses the requested FY's own settings (thresholds, exemption) when it has them", () => {
      startFiscalYear("2025-26");
      setTaxSettings("2025-26", { equityLtcgExemption: 50000 });
      const holding = createHolding({ type: "equity", name: "Stock S" });
      createCashFlow({
        holdingId: holding.id,
        date: "2020-01-01",
        amount: -100000,
        flowType: "contribution",
      });
      createCashFlow({
        holdingId: holding.id,
        date: "2025-06-01",
        amount: 200000,
        flowType: "redemption",
      });

      const estimate = getCapitalGainsEstimate(fiscalYearOf("2025-06-01"));

      expect(estimate.policyFiscalYear).toBe("2025-26");
      // (100000 - 50000) * 12.5%.
      expect(estimate.taxEquityLtcg).toBeCloseTo(6250, 6);
      // An FY without its own row inherits from the closest earlier one.
      expect(getCapitalGainsEstimate(fiscalYearOf("2023-06-01")).policyFiscalYear).toBe("2024-25");
    });
  });

  describe("isLongTermHolding (held for MORE than the threshold, day-exact)", () => {
    it("exactly 12 months is still short-term; 12 months + 1 day is long-term", () => {
      expect(isLongTermHolding("2024-03-15", "2025-03-15", 12)).toBe(false);
      expect(isLongTermHolding("2024-03-15", "2025-03-16", 12)).toBe(true);
    });

    it("counts days, not calendar months: ~11.5 months is short-term", () => {
      expect(isLongTermHolding("2024-03-15", "2025-03-01", 12)).toBe(false);
    });

    it("month-end purchases clamp: 2024-02-29 + 12 months = 2025-02-28", () => {
      expect(isLongTermHolding("2024-02-29", "2025-02-28", 12)).toBe(false);
      expect(isLongTermHolding("2024-02-29", "2025-03-01", 12)).toBe(true);
      expect(isLongTermHolding("2023-08-31", "2025-08-31", 24)).toBe(false);
      expect(isLongTermHolding("2023-08-31", "2025-09-01", 24)).toBe(true);
    });

    it("drives the LTCG/STCG split in the estimate", () => {
      const holding = createHolding({ type: "equity", name: "Stock B" });
      createCashFlow({
        holdingId: holding.id,
        date: "2024-03-15",
        amount: -10000,
        flowType: "contribution",
      });
      createCashFlow({
        holdingId: holding.id,
        date: "2025-03-15",
        amount: 12000,
        flowType: "redemption",
      });

      const estimate = getCapitalGainsEstimate(fiscalYearOf("2025-03-15"));

      expect(estimate.stcgEquity).toBe(2000);
      expect(estimate.ltcgEquity).toBe(0);
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
        fiscalYear: { label: "2026-27", start: "2026-04-01", end: "2027-03-31" },
        // FY 2026-27 has no settings of its own yet, so it inherits the seeded FY 2024-25 values.
        policyFiscalYear: "2024-25",
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
