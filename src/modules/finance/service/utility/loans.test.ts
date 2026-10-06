import { describe, expect, it } from "vitest";
import {
  computeAmortizationSchedule,
  computeEmiAmount,
  computePrepaymentImpact,
  getCreditUtilization,
} from "./loans";

describe("loans service", () => {
  describe("computeEmiAmount", () => {
    it("returns 0 for a non-positive tenure", () => {
      expect(computeEmiAmount(10_000_000, 1000, 0)).toBe(0);
      expect(computeEmiAmount(10_000_000, 1000, -1)).toBe(0);
    });

    it("divides principal evenly across tenure when the rate is 0", () => {
      expect(computeEmiAmount(120_000, 0, 12)).toBe(10_000);
    });

    it("matches the standard EMI formula for a 1-month tenure", () => {
      // ₹1,200 principal, 12% annual (1200bps, 1% monthly), 1 month:
      // EMI = P*r*(1+r) / r = P*(1+r) = ₹1,212 — exact to the paisa.
      expect(computeEmiAmount(120_000, 1200, 1)).toBe(121_200);
    });
  });

  describe("computeAmortizationSchedule", () => {
    it("pays off a 1-period loan exactly, with interest = balance * monthly rate", () => {
      const rows = computeAmortizationSchedule({
        outstandingBalanceMinor: 120_000,
        rateBps: 1200,
        emiMinor: 121_200,
      });

      expect(rows).toHaveLength(1);
      expect(rows[0]).toEqual({
        period: 1,
        openingBalanceMinor: 120_000,
        interestMinor: 1_200,
        principalMinor: 120_000,
        closingBalanceMinor: 0,
      });
    });

    it("sums principal across the schedule back to the outstanding balance and reaches zero by the stated tenure", () => {
      const outstandingBalanceMinor = 10_000_000; // ₹1,00,000
      const rateBps = 950;
      const tenureMonths = 24;
      const emiMinor = computeEmiAmount(outstandingBalanceMinor, rateBps, tenureMonths);

      const rows = computeAmortizationSchedule({
        outstandingBalanceMinor,
        rateBps,
        emiMinor,
      });

      expect(rows).toHaveLength(tenureMonths);
      // Exactly zero, not "close to" zero: the whole point of integer minor
      // units is that the last row lands on the balance instead of near it.
      expect(rows[rows.length - 1].closingBalanceMinor).toBe(0);

      const totalPrincipal = rows.reduce((sum, r) => sum + r.principalMinor, 0);
      expect(totalPrincipal).toBe(outstandingBalanceMinor);

      // Every period pays exactly the EMI except the last, which pays whatever
      // is left (the rounded EMI can't divide the balance evenly).
      for (const row of rows.slice(0, -1)) {
        expect(row.interestMinor + row.principalMinor).toBe(emiMinor);
      }
      const last = rows[rows.length - 1];
      expect(last.interestMinor + last.principalMinor).toBeLessThanOrEqual(emiMinor);
    });

    it("stops at maxPeriods when the EMI never covers interest, without going negative", () => {
      // Monthly rate is 10%, so period-1 interest (₹100) already exceeds the
      // ₹50 EMI: principal stays 0 forever.
      const rows = computeAmortizationSchedule({
        outstandingBalanceMinor: 100_000,
        rateBps: 12_000,
        emiMinor: 5_000,
        maxPeriods: 5,
      });

      expect(rows).toHaveLength(5);
      expect(
        rows.every((r) => r.principalMinor === 0 && r.closingBalanceMinor === 100_000),
      ).toBe(true);
    });
  });

  describe("computePrepaymentImpact", () => {
    it("hand-verified: a ₹500 extra payment collapses a 2-period schedule into 1, saving the second period's interest", () => {
      const input = { outstandingBalanceMinor: 100_000, rateBps: 1200, emiMinor: 100_000 };

      const impact = computePrepaymentImpact(input, 50_000);

      // Baseline: period 1 interest ₹10, principal ₹990, closing ₹10;
      // period 2 interest ₹0.10, principal ₹10, closing 0.
      expect(impact.baseline).toHaveLength(2);
      // With ₹500 extra: period 1 pays off the full ₹1,000 balance.
      expect(impact.withExtra).toHaveLength(1);
      expect(impact.monthsSaved).toBe(1);
      expect(impact.interestSavedMinor).toBe(10);
    });
  });

  describe("getCreditUtilization", () => {
    it("computes balance as a percentage of the credit limit", () => {
      expect(getCreditUtilization(250_000, 1_000_000)).toBe(25);
    });

    it("returns 0 when there is no credit limit", () => {
      expect(getCreditUtilization(10_000, 0)).toBe(0);
    });
  });
});
