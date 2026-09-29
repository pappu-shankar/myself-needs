// @vitest-environment node
import { describe, expect, it } from "vitest";
import { formatAmount, formatINR, formatNumber, formatPercent } from "./format";

describe("formatAmount", () => {
  it("uses Indian digit grouping with two decimals", () => {
    expect(formatAmount(1234567.5)).toBe("12,34,567.50");
  });

  it("never prints negative zero from float noise", () => {
    expect(formatAmount(0.3 - 0.1 - 0.2)).toBe("0.00");
    expect(formatAmount(-0.004)).toBe("0.00");
  });
});

describe("formatINR", () => {
  it("adds the rupee symbol, optionally rounding to whole rupees", () => {
    expect(formatINR(1500)).toBe("₹1,500.00");
    expect(formatINR(150000.6, { wholeRupees: true })).toBe("₹1,50,001");
  });
});

describe("formatPercent", () => {
  it("formats a fraction as a percentage and handles missing values", () => {
    expect(formatPercent(0.12345)).toBe("12.35%");
    expect(formatPercent(0.1, 1)).toBe("10.0%");
    expect(formatPercent(null)).toBe("—");
    expect(formatPercent(Number.NaN)).toBe("—");
    expect(formatPercent(-0.00001, 1)).toBe("0.0%");
  });
});

describe("formatNumber", () => {
  it("drops float noise", () => {
    expect(formatNumber(Math.round(2.9 / 0.1) * 0.1)).toBe("2.9");
  });
});
