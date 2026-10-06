import { describe, expect, it } from "vitest";
import {
  applyRatio,
  computeCagr,
  computeInflationAdjustedValue,
  computeIrr,
  computeLumpsumFutureValue,
  computeRealRateOfReturn,
  computeSipFutureValue,
  computeXirr,
} from "./returns";

describe("returns service", () => {
  describe("applyRatio", () => {
    it("rounds the product to a whole minor unit, half away from zero", () => {
      expect(applyRatio(100, 1.005)).toBe(101);
      expect(applyRatio(-100, 1.005)).toBe(-101);
    });

    it("stays exact for a product that overflows the float-safe range", () => {
      // 1e15 paise (₹10,000 Cr) doubled is 2e15 — beyond what a float product
      // of a rupee amount could represent without drift.
      expect(applyRatio(1_000_000_000_000_000, 2)).toBe(2_000_000_000_000_000);
    });
  });

  describe("computeCagr", () => {
    it("returns 100% for money that doubles in exactly 1 year", () => {
      expect(computeCagr(10_000, 20_000, 1)).toBeCloseTo(1, 10);
    });

    it("returns 100% for money that quadruples in exactly 2 years", () => {
      expect(computeCagr(10_000, 40_000, 2)).toBeCloseTo(1, 10);
    });

    it("returns null for a non-positive start value or duration", () => {
      expect(computeCagr(0, 20_000, 1)).toBeNull();
      expect(computeCagr(10_000, 20_000, 0)).toBeNull();
      expect(computeCagr(-10_000, 20_000, 1)).toBeNull();
      expect(computeCagr(10_000, 0, 1)).toBeNull();
      expect(computeCagr(10_000, -5_000, 2)).toBeNull();
    });
  });

  describe("computeLumpsumFutureValue", () => {
    it("matches the standard compound-interest formula, in exact minor units", () => {
      // ₹1,000 (100000 paise) * (1.10)^2 = ₹1,210.
      expect(computeLumpsumFutureValue(100_000, 1000, 2)).toBe(121_000);
    });
  });

  describe("computeInflationAdjustedValue", () => {
    it("uses the same compounding formula as the lumpsum calculator", () => {
      expect(computeInflationAdjustedValue(100_000, 1000, 2)).toBe(121_000);
    });
  });

  describe("computeRealRateOfReturn", () => {
    it("subtracts inflation from the nominal rate, in basis points", () => {
      expect(computeRealRateOfReturn(1200, 600)).toBe(600);
    });
  });

  describe("computeSipFutureValue", () => {
    it("sums to the plain total invested with no gain when the rate is 0", () => {
      const result = computeSipFutureValue(100_000, 0, 2);
      expect(result).toEqual({
        futureValueMinor: 2_400_000,
        totalInvestedMinor: 2_400_000,
        totalGainMinor: 0,
      });
    });

    it("hand-verified single-month annuity-due: one deposit grows for exactly one month", () => {
      // 1 month at 1% monthly (1200bps/12): ₹1,000 deposited at the start of
      // the month compounds to ₹1,010.
      const result = computeSipFutureValue(100_000, 1200, 1 / 12);

      expect(result.totalInvestedMinor).toBe(100_000);
      expect(result.futureValueMinor).toBe(101_000);
      expect(result.totalGainMinor).toBe(1_000);
    });

    it("future value, invested and gain always add up — gain is a difference of integers, not a third rounding", () => {
      const result = computeSipFutureValue(123_457, 1337, 7);
      expect(result.futureValueMinor - result.totalInvestedMinor).toBe(result.totalGainMinor);
    });
  });

  describe("computeXirr", () => {
    it("hand-verified: a single-year 10% return solves to 0.1", () => {
      // 2023-01-01 to 2024-01-01 spans exactly 365 days (2023 is not a leap year).
      const xirr = computeXirr([{ amountMinor: -100_000, date: "2023-01-01" }], 110_000, "2024-01-01");
      expect(xirr).not.toBeNull();
      expect(xirr!).toBeCloseTo(0.1, 4);
    });

    it("returns null when there isn't enough data to solve", () => {
      expect(computeXirr([], 100_000, "2024-01-01")).toBeNull();
    });

    it("returns null (not -100%) when there is no value to set against contributions", () => {
      expect(computeXirr([{ amountMinor: -100_000, date: "2023-01-01" }], 0, "2024-01-01")).toBeNull();
    });

    it("returns null when every cash flow lands on the same day", () => {
      expect(
        computeXirr([{ amountMinor: -100_000, date: "2024-01-01" }], 100_000, "2024-01-01"),
      ).toBeNull();
    });
  });

  describe("computeIrr", () => {
    it("hand-verified: a single-period -1000 -> 1100 flow solves to 10%", () => {
      expect(computeIrr([-100_000, 110_000])).toBeCloseTo(0.1, 6);
    });

    it("returns null with fewer than 2 amounts", () => {
      expect(computeIrr([-100_000])).toBeNull();
    });

    it("returns null when every amount has the same sign", () => {
      expect(computeIrr([10_000, 20_000, 30_000])).toBeNull();
      expect(computeIrr([-10_000, -20_000])).toBeNull();
    });
  });
});
