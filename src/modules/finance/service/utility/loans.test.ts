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
      expect(computeEmiAmount(100000, 10, 0)).toBe(0);
      expect(computeEmiAmount(100000, 10, -1)).toBe(0);
    });

    it("divides principal evenly across tenure when the rate is 0", () => {
      expect(computeEmiAmount(1200, 0, 12)).toBe(100);
    });

    it("matches the standard EMI formula for a 1-month tenure", () => {
      // 1200 principal, 12% annual (1% monthly), 1 month: EMI = P*r*(1+r) / r = P*(1+r) = 1212.
      expect(computeEmiAmount(1200, 12, 1)).toBeCloseTo(1212, 6);
    });
  });

  describe("computeAmortizationSchedule", () => {
    it("pays off a 1-period loan exactly, with interest = balance * monthly rate", () => {
      const rows = computeAmortizationSchedule({
        outstandingBalance: 1200,
        annualInterestRate: 12,
        emiAmount: 1212,
      });

      expect(rows).toHaveLength(1);
      expect(rows[0]).toEqual({
        period: 1,
        openingBalance: 1200,
        interest: 12,
        principal: 1200,
        closingBalance: 0,
      });
    });

    it("sums principal across the schedule back to the outstanding balance and reaches zero by the stated tenure", () => {
      const outstandingBalance = 100000;
      const annualInterestRate = 9.5;
      const tenureMonths = 24;
      const emiAmount = computeEmiAmount(outstandingBalance, annualInterestRate, tenureMonths);

      const rows = computeAmortizationSchedule({
        outstandingBalance,
        annualInterestRate,
        emiAmount,
      });

      expect(rows).toHaveLength(tenureMonths);
      expect(rows[rows.length - 1].closingBalance).toBeCloseTo(0, 6);

      const totalPrincipal = rows.reduce((sum, r) => sum + r.principal, 0);
      const totalInterest = rows.reduce((sum, r) => sum + r.interest, 0);
      expect(totalPrincipal).toBeCloseTo(outstandingBalance, 6);
      expect(totalInterest + totalPrincipal).toBeCloseTo(emiAmount * tenureMonths, 4);
    });

    it("stops at maxPeriods when the EMI never covers interest, without going negative", () => {
      // Monthly rate is 10%, so period-1 interest (100) already exceeds the 50 EMI: principal stays 0 forever.
      const rows = computeAmortizationSchedule({
        outstandingBalance: 1000,
        annualInterestRate: 120,
        emiAmount: 50,
        maxPeriods: 5,
      });

      expect(rows).toHaveLength(5);
      expect(rows.every((r) => r.principal === 0 && r.closingBalance === 1000)).toBe(true);
    });
  });

  describe("computePrepaymentImpact", () => {
    it("hand-verified: a 500 extra payment collapses a 2-period schedule into 1, saving the second period's interest", () => {
      const input = { outstandingBalance: 1000, annualInterestRate: 12, emiAmount: 1000 };

      const impact = computePrepaymentImpact(input, 500);

      // Baseline: period 1 interest 10, principal 990, closing 10; period 2 interest 0.1, principal 10, closing 0.
      expect(impact.baseline).toHaveLength(2);
      // With 500 extra: period 1 pays off the full 1000 balance (990 owed after interest, capped by balance).
      expect(impact.withExtra).toHaveLength(1);
      expect(impact.monthsSaved).toBe(1);
      expect(impact.interestSaved).toBeCloseTo(0.1, 6);
    });
  });

  describe("getCreditUtilization", () => {
    it("computes balance as a percentage of the credit limit", () => {
      expect(getCreditUtilization(2500, 10000)).toBe(25);
    });

    it("returns 0 when there is no credit limit", () => {
      expect(getCreditUtilization(100, 0)).toBe(0);
    });
  });
});
