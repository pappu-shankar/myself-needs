import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { setupTestDb, teardownTestDb } from "@/test/db";
import { getAllocationReport, getCurrentAllocation } from "./allocation";
import { setAllocationTarget, setDateOfBirth } from "../config/allocation";
import { createAccount } from "./accounts";
import { createHolding, createValuation } from "./investments";

beforeEach(setupTestDb);
afterEach(teardownTestDb);

describe("allocation service", () => {
  describe("getCurrentAllocation", () => {
    it("groups accounts and holdings by asset class as a percentage of net worth", () => {
      createAccount({ name: "Checking", type: "checking", openingBalance: 5000 });
      const holding = createHolding({ type: "equity", name: "Stock A", units: 30 });
      createValuation({ holdingId: holding.id, date: "2026-01-01", pricePerUnit: 100 });

      const rows = getCurrentAllocation();

      // Net worth = 5000 (cash) + 3000 (holding) = 8000.
      expect(rows).toEqual([
        { assetClass: "cash", value: 5000, percentOfNetWorth: 62.5 },
        { assetClass: "equity", value: 3000, percentOfNetWorth: 37.5 },
      ]);
    });

    it("returns null percentages (not negative ones) when net worth is zero or negative, while keeping raw values", () => {
      // Liability outweighs the liquid asset, so net worth is negative.
      createAccount({ name: "Checking", type: "checking", openingBalance: 2000 });
      createAccount({ name: "Home Loan", type: "loan", openingBalance: 10000 });

      const rows = getCurrentAllocation();

      expect(rows).toEqual([{ assetClass: "cash", value: 2000, percentOfNetWorth: null }]);
    });
  });

  describe("getAllocationReport", () => {
    it("hand-verified: age-based suggested target, current split, and variance", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-06-15T00:00:00Z"));

      // Born 1990-06-20: birthday hasn't occurred yet this year (Jun 15 < Jun 20), so age is 35, not 36.
      setDateOfBirth("1990-06-20");
      createAccount({ name: "Checking", type: "checking", openingBalance: 10000 });

      const report = getAllocationReport();

      // remaining = 100 - 5 (gold) - 10 (cash) = 85; equity fraction = (100-35)/100 = 0.65.
      const expectedEquityTarget = 85 * 0.65;
      const expectedDebtTarget = 85 - expectedEquityTarget;

      expect(report).toEqual([
        {
          assetClass: "equity",
          targetPercentage: expectedEquityTarget,
          isCustom: false,
          currentPercentage: 0,
          variance: -expectedEquityTarget,
        },
        {
          assetClass: "debt",
          targetPercentage: expectedDebtTarget,
          isCustom: false,
          currentPercentage: 0,
          variance: -expectedDebtTarget,
        },
        {
          assetClass: "gold",
          targetPercentage: 5,
          isCustom: false,
          currentPercentage: 0,
          variance: -5,
        },
        {
          assetClass: "cash",
          targetPercentage: 10,
          isCustom: false,
          currentPercentage: 100,
          variance: 90,
        },
      ]);

      vi.useRealTimers();
    });

    it("falls back to the generic moderate split when no date of birth is on file", () => {
      const report = getAllocationReport();
      expect(report.find((r) => r.assetClass === "equity")?.targetPercentage).toBe(55);
      expect(report.find((r) => r.assetClass === "debt")?.targetPercentage).toBe(30);
    });

    it("a custom stored target overrides the suggested one and is flagged isCustom", () => {
      setAllocationTarget("equity", 70);

      const report = getAllocationReport();

      expect(report.find((r) => r.assetClass === "equity")).toMatchObject({
        targetPercentage: 70,
        isCustom: true,
      });
    });
  });
});
