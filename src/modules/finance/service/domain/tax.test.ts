import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { setupTestDb, teardownTestDb } from "@/test/db";
import { toUnitsScaled } from "../utility/units";
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
import { FX_RATE_SCALE, type Currency } from "../../db/schema/currency";
import { insertAccount } from "../../db/queries/domain/accounts";
import { insertCategory } from "../../db/queries/domain/categories";
import { insertTransaction } from "../../db/queries/domain/transactions";
import { insertCashFlow, insertHolding } from "../../db/queries/domain/investments";
import { insertRecurringRule } from "../../db/queries/domain/recurring";
import { insertInsurancePolicy } from "../../db/queries/domain/insurance";
import { upsertFxRates } from "../../db/queries/config/fx-rates";

beforeEach(setupTestDb);
afterEach(teardownTestDb);

/**
 * Rows go in through the query layer rather than the create-* services: this
 * suite is about what the tax maths does with stored money, and seeding at the
 * storage boundary keeps it honest about the units (paise, not rupees) and
 * independent of each domain service's own input shape.
 */

function seedUsdRate(date: string, rupeesPerDollar: number) {
  upsertFxRates([
    {
      base: "USD",
      quote: "INR",
      date,
      rateScaled: rupeesPerDollar * FX_RATE_SCALE,
      source: "test",
    },
  ]);
}

function seedHolding(
  name: string,
  type: "equity" | "mutual_fund_domestic" = "equity",
  options: { currency?: Currency; is80cEligible?: boolean } = {},
) {
  return insertHolding({
    type,
    name,
    currency: options.currency ?? "INR",
    is80cEligible: options.is80cEligible ?? false,
  });
}

/**
 * Unit-based FIFO needs units, so every flow records them.
 *
 * The default buys and sells the same whole position (100 units), which keeps
 * each fixture's economics exactly what they were under the old amount-matching
 * model: the cost basis is the whole contribution and the proceeds are the
 * whole redemption, so the gain is still proceeds minus cost. That is why the
 * hand-verified figures below did not have to move.
 */
const WHOLE_POSITION_UNITS = 100;

function seedFlow(
  holdingId: number,
  date: string,
  amountMinor: number,
  flowType: "contribution" | "redemption",
  currency: Currency = "INR",
  units: number = WHOLE_POSITION_UNITS,
) {
  return insertCashFlow({
    holdingId,
    date,
    amountMinor,
    flowType,
    currency,
    // The ledger's sign convention is on the amount; the matcher reads
    // direction from the units, so they have to agree.
    unitsScaled: amountMinor < 0 ? toUnitsScaled(units) : -toUnitsScaled(units),
  });
}

describe("tax service", () => {
  describe("80C / 80D utilization", () => {
    it("hand-verified: sums 80C-eligible holding contributions plus 80C/80D-flagged insurance premiums for the current FY", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-06-01T00:00:00Z"));

      const account = insertAccount({ name: "Checking", type: "checking" });
      const premiumCategory = insertCategory({ name: "Insurance Premium", type: "expense" });

      const lifeRule = insertRecurringRule({
        type: "expense",
        accountId: account.id,
        categoryId: premiumCategory.id,
        amountMinor: 2_000_000,
        frequency: "yearly",
        startDate: "2020-01-01",
      });
      insertInsurancePolicy({
        type: "life",
        provider: "Acme",
        name: "Term Life",
        premiumAmountMinor: 2_000_000,
        premiumFrequency: "yearly",
        startDate: "2020-01-01",
        is80cEligible: true,
        is80dEligible: false,
        recurringRuleId: lifeRule.id,
      });
      insertTransaction({
        type: "expense",
        accountId: account.id,
        categoryId: premiumCategory.id,
        amountMinor: 2_000_000,
        date: "2026-05-01",
        recurringRuleId: lifeRule.id,
      });

      const healthRule = insertRecurringRule({
        type: "expense",
        accountId: account.id,
        categoryId: premiumCategory.id,
        amountMinor: 1_500_000,
        frequency: "yearly",
        startDate: "2020-01-01",
      });
      insertInsurancePolicy({
        type: "health",
        provider: "Acme",
        name: "Health Cover",
        premiumAmountMinor: 1_500_000,
        premiumFrequency: "yearly",
        startDate: "2020-01-01",
        is80cEligible: false,
        is80dEligible: true,
        recurringRuleId: healthRule.id,
      });
      insertTransaction({
        type: "expense",
        accountId: account.id,
        categoryId: premiumCategory.id,
        amountMinor: 1_500_000,
        date: "2026-05-01",
        recurringRuleId: healthRule.id,
      });

      const elss = seedHolding("ELSS Fund", "equity", { is80cEligible: true });
      seedFlow(elss.id, "2026-05-15", -5_000_000, "contribution");

      // 80C: ₹50,000 (ELSS contribution) + ₹20,000 (life premium) = ₹70,000, against the default ₹1,50,000 limit.
      const eightyC = get80cUtilization();
      expect(eightyC.used.baseMinor).toBe(7_000_000);
      expect(eightyC.used.baseCurrency).toBe("INR");
      expect(eightyC.used.complete).toBe(true);
      expect(eightyC.limitMinor).toBe(15_000_000);
      expect(eightyC.currency).toBe("INR");
      expect(eightyC.policyFiscalYear).toBe("2024-25");

      // 80D: ₹15,000 (health premium only), against the default ₹25,000 limit.
      const eightyD = get80dUtilization();
      expect(eightyD.used.baseMinor).toBe(1_500_000);
      expect(eightyD.limitMinor).toBe(2_500_000);
      expect(eightyD.policyFiscalYear).toBe("2024-25");

      // FY-scoped: nothing was contributed or paid in the previous FY.
      expect(get80cUtilization(fiscalYearOf("2025-06-01")).used.baseMinor).toBe(0);

      vi.useRealTimers();
    });

    it("converts a foreign-currency contribution into statutory INR and names the rate it used", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-06-01T00:00:00Z"));
      seedUsdRate("2026-06-01", 85);

      const vested = seedHolding("US Plan", "equity", { currency: "USD", is80cEligible: true });
      // $1,000 contributed, so ₹85,000 against a statutory ₹1,50,000 ceiling —
      // the ceiling does not become $1,500 because the holding is in dollars.
      seedFlow(vested.id, "2026-05-15", -100_000, "contribution", "USD");

      const eightyC = get80cUtilization();

      expect(eightyC.used.baseMinor).toBe(8_500_000);
      expect(eightyC.used.complete).toBe(true);
      expect(eightyC.used.byCurrency).toEqual([
        expect.objectContaining({
          currency: "USD",
          minor: 100_000,
          baseMinor: 8_500_000,
          rateDate: "2026-06-01",
          rateSource: "test",
        }),
      ]);

      vi.useRealTimers();
    });

    it("reports an unresolvable currency as incomplete instead of treating it as rupees", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-06-01T00:00:00Z"));

      const vested = seedHolding("US Plan", "equity", { currency: "USD", is80cEligible: true });
      seedFlow(vested.id, "2026-05-15", -100_000, "contribution", "USD");

      const eightyC = get80cUtilization();

      expect(eightyC.used.complete).toBe(false);
      // Not 100_000: $1,000 is not ₹1,000, and no rate was available to say what it is.
      expect(eightyC.used.baseMinor).toBe(0);
      expect(eightyC.used.byCurrency[0]).toMatchObject({ currency: "USD", baseMinor: null });

      vi.useRealTimers();
    });
  });

  describe("getCapitalGainsEstimate (FIFO gain matching)", () => {
    it("hand-verified: a position sold below its cost is a capital LOSS, not a zero-gain event", () => {
      // This test previously asserted the opposite, and it was the clearest
      // symptom of the defect unit-based matching fixes. The old model drew
      // proceeds down against cost and counted only the excess, so selling a
      // ₹10,000 position for ₹6,000 produced *no event at all* — a ₹4,000 loss
      // was simply unrepresentable, which is also why loss harvesting could
      // never be surfaced.
      const holding = seedHolding("Stock RC");
      seedFlow(holding.id, "2020-01-01", -1_000_000, "contribution");
      seedFlow(holding.id, "2021-01-01", 600_000, "redemption");

      const estimate = getCapitalGainsEstimate(fiscalYearOf("2021-01-01"));

      expect(estimate.events).toHaveLength(1);
      expect(estimate.events[0].costBasisMinor).toBe(1_000_000);
      expect(estimate.events[0].proceedsMinor).toBe(600_000);
      expect(estimate.events[0].gainMinor).toBe(-400_000);
      // Held exactly 12 months, so short-term (s.2(42A) is "more than"), and
      // the loss reduces that bucket rather than being clamped at zero.
      expect(estimate.events[0].isLongTerm).toBe(false);
      expect(estimate.stcgEquityMinor).toBe(-400_000);
      expect(estimate.ltcgEquityMinor).toBe(0);
      // No tax is owed on a loss. Applying the rate to a negative bucket would
      // assert a refund, which an estimate has no business doing.
      expect(estimate.totalTaxMinor).toBe(0);
      // The loss stays visible as the amount available for set-off.
      expect(estimate.netLossMinor).toBe(400_000);
    });

    it("partially sells a lot, leaving the unsold units' cost behind", () => {
      // 100 units at ₹10,000; sell 40 for ₹6,000. Cost of those 40 units is
      // ₹4,000, so the gain is ₹2,000 — and ₹6,000 of cost stays with the 60
      // units still held, rather than the sale consuming cost by value.
      const holding = seedHolding("Stock Partial");
      seedFlow(holding.id, "2020-01-01", -1_000_000, "contribution");
      seedFlow(holding.id, "2021-06-01", 600_000, "redemption", "INR", 40);

      const estimate = getCapitalGainsEstimate(fiscalYearOf("2021-06-01"));

      expect(estimate.events).toHaveLength(1);
      expect(estimate.events[0].costBasisMinor).toBe(400_000);
      expect(estimate.events[0].gainMinor).toBe(200_000);
      expect(estimate.complete).toBe(true);
    });

    it("hand-verified: gain equals proceeds beyond the FIFO-matched cost basis, split across LTCG/STCG per lot age", () => {
      const equityHolding = seedHolding("Stock A");
      seedFlow(equityHolding.id, "2020-01-01", -20_000_000, "contribution");
      // 17 months later (>= the 12-month equity LTCG threshold): ₹3,50,000 proceeds − ₹2,00,000 cost = ₹1,50,000 gain, long-term.
      seedFlow(equityHolding.id, "2021-06-01", 35_000_000, "redemption");

      const mfHolding = seedHolding("Fund B", "mutual_fund_domestic");
      seedFlow(mfHolding.id, "2021-01-01", -5_000_000, "contribution");
      // 5 months later (< 12-month threshold): ₹70,000 proceeds − ₹50,000 cost = ₹20,000 gain, short-term.
      seedFlow(mfHolding.id, "2021-06-01", 7_000_000, "redemption");

      const estimate = getCapitalGainsEstimate(fiscalYearOf("2021-06-01"));

      expect(estimate.fiscalYear.label).toBe("2021-22");
      expect(estimate.currency).toBe("INR");
      expect(estimate.events).toHaveLength(2);
      expect(estimate.ltcgEquityMinor).toBe(15_000_000);
      expect(estimate.stcgEquityMinor).toBe(2_000_000);
      expect(estimate.ltcgOtherMinor).toBe(0);
      expect(estimate.stcgOtherMinor).toBe(0);
      // (₹1,50,000 − ₹1,25,000 exemption) at 1250 bps — exact in paise, not a float.
      expect(estimate.taxEquityLtcgMinor).toBe(312_500);
      // ₹20,000 at 2000 bps.
      expect(estimate.taxEquityStcgMinor).toBe(400_000);
      expect(estimate.totalTaxMinor).toBe(712_500);
      expect(estimate.complete).toBe(true);
    });

    it("only counts redemptions inside the FY, applying the exemption once per FY", () => {
      // Two holdings, each: ₹1,00,000 cost, ₹2,00,000 proceeds = ₹1,00,000 LTCG — one on the
      // last day of FY 2024-25, the other on the first day of FY 2025-26.
      for (const [name, redeemedOn] of [
        ["Stock F", "2025-03-31"],
        ["Stock G", "2025-04-01"],
      ]) {
        const holding = seedHolding(name);
        seedFlow(holding.id, "2020-01-01", -10_000_000, "contribution");
        seedFlow(holding.id, redeemedOn, 20_000_000, "redemption");
      }

      const fy2425 = getCapitalGainsEstimate(fiscalYearOf("2025-03-31"));
      const fy2526 = getCapitalGainsEstimate(fiscalYearOf("2025-04-01"));

      expect(fy2425.events.map((e) => e.redemptionDate)).toEqual(["2025-03-31"]);
      expect(fy2425.ltcgEquityMinor).toBe(10_000_000);
      expect(fy2526.events.map((e) => e.redemptionDate)).toEqual(["2025-04-01"]);
      expect(fy2526.ltcgEquityMinor).toBe(10_000_000);
      // ₹1,00,000 each is under the ₹1,25,000 exemption in each FY — a lifetime ₹2,00,000 would not be.
      expect(fy2425.totalTaxMinor).toBe(0);
      expect(fy2526.totalTaxMinor).toBe(0);
      expect(getCapitalGainsEstimate(fiscalYearOf("2023-06-01")).events).toHaveLength(0);
      expect(listTaxFiscalYears()).toEqual(expect.arrayContaining(["2025-26", "2024-25"]));
    });

    it("uses the requested FY's own settings (thresholds, exemption) when it has them", () => {
      startFiscalYear("2025-26");
      setTaxSettings("2025-26", { equityLtcgExemptionMinor: 5_000_000 });
      const holding = seedHolding("Stock S");
      seedFlow(holding.id, "2020-01-01", -10_000_000, "contribution");
      seedFlow(holding.id, "2025-06-01", 20_000_000, "redemption");

      const estimate = getCapitalGainsEstimate(fiscalYearOf("2025-06-01"));

      expect(estimate.policyFiscalYear).toBe("2025-26");
      // (₹1,00,000 − ₹50,000) at 1250 bps.
      expect(estimate.taxEquityLtcgMinor).toBe(625_000);
      // An FY without its own row inherits from the closest earlier one.
      expect(getCapitalGainsEstimate(fiscalYearOf("2023-06-01")).policyFiscalYear).toBe("2024-25");
    });

    it("restates a foreign-currency holding's cost and proceeds in INR at each flow's own date", () => {
      seedUsdRate("2020-01-01", 70);
      seedUsdRate("2021-06-01", 80);

      const holding = seedHolding("US Stock", "equity", { currency: "USD" });
      // $1,000 in at ₹70 = ₹70,000 cost; $1,500 out at ₹80 = ₹1,20,000 proceeds.
      seedFlow(holding.id, "2020-01-01", -100_000, "contribution", "USD");
      seedFlow(holding.id, "2021-06-01", 150_000, "redemption", "USD");

      const estimate = getCapitalGainsEstimate(fiscalYearOf("2021-06-01"));

      // ₹1,20,000 − ₹70,000 = ₹50,000 long-term gain, in paise.
      expect(estimate.ltcgEquityMinor).toBe(5_000_000);
      expect(estimate.complete).toBe(true);
      expect(estimate.conversions).toEqual([
        expect.objectContaining({
          date: "2020-01-01",
          inrMinor: -7_000_000,
          rateDate: "2020-01-01",
        }),
        expect.objectContaining({
          date: "2021-06-01",
          inrMinor: 12_000_000,
          rateDate: "2021-06-01",
        }),
      ]);
    });

    it("leaves out a flow it cannot convert and says the estimate is incomplete", () => {
      const holding = seedHolding("US Stock", "equity", { currency: "USD" });
      seedFlow(holding.id, "2020-01-01", -100_000, "contribution", "USD");
      seedFlow(holding.id, "2021-06-01", 150_000, "redemption", "USD");

      const estimate = getCapitalGainsEstimate(fiscalYearOf("2021-06-01"));

      expect(estimate.complete).toBe(false);
      expect(estimate.unconverted).toHaveLength(2);
      // No 1:1 fallback: $500 of gain did not become ₹500 of gain.
      expect(estimate.events).toHaveLength(0);
      expect(estimate.confidence).toBe("unknown");
    });

    it("splits a gain across lots in whole paise that add back to the gain exactly", () => {
      const holding = seedHolding("Stock Split");
      // Three equal lots, then one redemption whose excess (1 paisa short of
      // divisible by three) has to be apportioned without losing or inventing a paisa.
      seedFlow(holding.id, "2018-01-01", -1_000_000, "contribution");
      seedFlow(holding.id, "2018-02-01", -1_000_000, "contribution");
      seedFlow(holding.id, "2018-03-01", -1_000_000, "contribution");
      // All 300 units in one disposal, so the single extra paisa has to be
      // apportioned across three lots.
      seedFlow(holding.id, "2021-06-01", 3_000_001, "redemption", "INR", 300);

      const estimate = getCapitalGainsEstimate(fiscalYearOf("2021-06-01"));

      expect(estimate.events.reduce((s, e) => s + e.gainMinor, 0)).toBe(1);
      expect(estimate.events.every((e) => Number.isInteger(e.gainMinor))).toBe(true);
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
      const holding = seedHolding("Stock B");
      seedFlow(holding.id, "2024-03-15", -1_000_000, "contribution");
      seedFlow(holding.id, "2025-03-15", 1_200_000, "redemption");

      const estimate = getCapitalGainsEstimate(fiscalYearOf("2025-03-15"));

      expect(estimate.stcgEquityMinor).toBe(200_000);
      expect(estimate.ltcgEquityMinor).toBe(0);
      expect(estimate.events[0].acquisitionDate).toBe("2024-03-15");
    });
  });

  describe("getRegimeComparison", () => {
    it("hand-verified: old vs. new regime slab tax for a clean ₹9,00,000 income with no deductions", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-06-01T00:00:00Z"));

      const account = insertAccount({ name: "Checking", type: "checking" });
      const salary = insertCategory({ name: "Salary", type: "income" });
      insertTransaction({
        type: "income",
        accountId: account.id,
        categoryId: salary.id,
        amountMinor: 90_000_000,
        date: "2026-05-01",
      });

      const comparison = getRegimeComparison();

      // Old: taxable = ₹9,00,000 − ₹50,000 standard deduction = ₹8,50,000.
      // 0 bps up to ₹2,50,000, 500 bps on the next ₹2,50,000 (=₹12,500), 2000 bps on the next
      // ₹3,50,000 (=₹70,000) = ₹82,500, plus 400 bps cess = ₹85,800.
      // New: taxable = ₹9,00,000 − ₹75,000 standard deduction = ₹8,25,000.
      // 0 bps up to ₹3,00,000, 500 bps on the next ₹4,00,000 (=₹20,000), 1000 bps on the next
      // ₹1,25,000 (=₹12,500) = ₹32,500, plus 400 bps cess = ₹33,800.
      expect(comparison).toMatchObject({
        fiscalYear: { label: "2026-27", start: "2026-04-01", end: "2027-03-31" },
        // FY 2026-27 has no settings of its own yet, so it inherits the seeded FY 2024-25 values.
        policyFiscalYear: "2024-25",
        currency: "INR",
        eightyCUsedMinor: 0,
        eightyDUsedMinor: 0,
        oldRegimeTaxMinor: 8_580_000,
        newRegimeTaxMinor: 3_380_000,
        betterRegime: "new",
        savingsMinor: 5_200_000,
        complete: true,
        reason: expect.stringContaining("beat the old regime"),
      });
      expect(comparison.income.baseMinor).toBe(90_000_000);
      expect(comparison.income.baseCurrency).toBe("INR");

      vi.useRealTimers();
    });

    it("converts foreign income into statutory INR before it meets a slab boundary", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-06-01T00:00:00Z"));
      seedUsdRate("2026-06-01", 90);

      const account = insertAccount({ name: "US Payroll", type: "checking", currency: "USD" });
      const salary = insertCategory({ name: "Salary", type: "income" });
      insertTransaction({
        type: "income",
        accountId: account.id,
        categoryId: salary.id,
        amountMinor: 1_000_000,
        date: "2026-05-01",
        currency: "USD",
      });

      const comparison = getRegimeComparison();

      // $10,000 at ₹90 = ₹9,00,000 — the same taxable income as the rupee case above,
      // and the same tax, because the slabs are statutory and did not move.
      expect(comparison.income.baseMinor).toBe(90_000_000);
      expect(comparison.income.byCurrency[0]).toMatchObject({
        currency: "USD",
        rateDate: "2026-06-01",
      });
      expect(comparison.oldRegimeTaxMinor).toBe(8_580_000);
      expect(comparison.newRegimeTaxMinor).toBe(3_380_000);
      expect(comparison.complete).toBe(true);

      vi.useRealTimers();
    });

    it("says so rather than guessing when income is in a currency with no rate", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-06-01T00:00:00Z"));

      const account = insertAccount({ name: "US Payroll", type: "checking", currency: "USD" });
      const salary = insertCategory({ name: "Salary", type: "income" });
      insertTransaction({
        type: "income",
        accountId: account.id,
        categoryId: salary.id,
        amountMinor: 1_000_000,
        date: "2026-05-01",
        currency: "USD",
      });

      const comparison = getRegimeComparison();

      expect(comparison.complete).toBe(false);
      expect(comparison.income.baseMinor).toBe(0);

      vi.useRealTimers();
    });
  });
});
