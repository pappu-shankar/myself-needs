import { describe, expect, it } from "vitest";
import {
  computeCagr,
  computeInflationAdjustedValue,
  computeIrr,
  computeLumpsumFutureValue,
  computeRealRateOfReturn,
  computeSipFutureValue,
  computeXirr,
} from "./returns";

describe("returns service", () => {
  describe("computeCagr", () => {
    it("returns 100% for money that doubles in exactly 1 year", () => {
      expect(computeCagr(100, 200, 1)).toBeCloseTo(1, 10);
    });

    it("returns 100% for money that quadruples in exactly 2 years", () => {
      expect(computeCagr(100, 400, 2)).toBeCloseTo(1, 10);
    });

    it("returns null for a non-positive start value or duration", () => {
      expect(computeCagr(0, 200, 1)).toBeNull();
      expect(computeCagr(100, 200, 0)).toBeNull();
      expect(computeCagr(-100, 200, 1)).toBeNull();
      expect(computeCagr(100, 0, 1)).toBeNull();
      expect(computeCagr(100, -50, 2)).toBeNull();
    });
  });

  describe("computeLumpsumFutureValue", () => {
    it("matches the standard compound-interest formula", () => {
      // 1000 * (1.10)^2 = 1210.
      expect(computeLumpsumFutureValue(1000, 10, 2)).toBeCloseTo(1210, 6);
    });
  });

  describe("computeInflationAdjustedValue", () => {
    it("uses the same compounding formula as the lumpsum calculator", () => {
      expect(computeInflationAdjustedValue(1000, 10, 2)).toBeCloseTo(1210, 6);
    });
  });

  describe("computeRealRateOfReturn", () => {
    it("subtracts inflation from the nominal rate", () => {
      expect(computeRealRateOfReturn(12, 6)).toBe(6);
    });
  });

  describe("computeSipFutureValue", () => {
    it("sums to the plain total invested with no gain when the rate is 0", () => {
      const result = computeSipFutureValue(1000, 0, 2);
      expect(result).toEqual({ futureValue: 24000, totalInvested: 24000, totalGain: 0 });
    });

    it("hand-verified single-month annuity-due: one deposit grows for exactly one month", () => {
      // 1 month at 1% monthly (12%/12): 1000 deposited at the start of the month compounds to 1010.
      const result = computeSipFutureValue(1000, 12, 1 / 12);

      expect(result.totalInvested).toBeCloseTo(1000, 6);
      expect(result.futureValue).toBeCloseTo(1010, 6);
      expect(result.totalGain).toBeCloseTo(10, 6);
    });
  });

  describe("computeXirr", () => {
    it("hand-verified: a single-year 10% return solves to 0.1", () => {
      // 2023-01-01 to 2024-01-01 spans exactly 365 days (2023 is not a leap year).
      const xirr = computeXirr([{ amount: -1000, date: "2023-01-01" }], 1100, "2024-01-01");
      expect(xirr).not.toBeNull();
      expect(xirr!).toBeCloseTo(0.1, 4);
    });

    it("returns null when there isn't enough data to solve", () => {
      expect(computeXirr([], 1000, "2024-01-01")).toBeNull();
    });

    it("returns null (not -100%) when there is no value to set against contributions", () => {
      expect(computeXirr([{ amount: -1000, date: "2023-01-01" }], 0, "2024-01-01")).toBeNull();
    });

    it("returns null when every cash flow lands on the same day", () => {
      expect(computeXirr([{ amount: -1000, date: "2024-01-01" }], 1000, "2024-01-01")).toBeNull();
    });
  });

  describe("computeIrr", () => {
    it("hand-verified: a single-period -1000 -> 1100 flow solves to 10%", () => {
      expect(computeIrr([-1000, 1100])).toBeCloseTo(0.1, 6);
    });

    it("returns null with fewer than 2 amounts", () => {
      expect(computeIrr([-1000])).toBeNull();
    });

    it("returns null when every amount has the same sign", () => {
      expect(computeIrr([100, 200, 300])).toBeNull();
      expect(computeIrr([-100, -200])).toBeNull();
    });
  });
});
