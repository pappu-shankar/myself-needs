import { describe, expect, it } from "vitest";
import { formatMoney, formatMoneyAmount } from "./format";

describe("formatMoney", () => {
  it("formats rupees with Indian digit grouping", () => {
    expect(formatMoney({ minor: 12_345_670, currency: "INR" })).toBe("₹1,23,456.70");
  });

  it("groups each currency in its own convention, not the reader's", () => {
    // The point: Intl would otherwise apply Indian grouping to a dollar figure
    // ($1,23,456.70) because locale and currency are independent to it.
    expect(formatMoney({ minor: 12_345_670, currency: "USD" })).toBe("$123,456.70");
    expect(formatMoney({ minor: 12_345_670, currency: "GBP" })).toBe("£123,456.70");
    expect(formatMoney({ minor: 12_345_670, currency: "INR" })).toBe("₹1,23,456.70");
  });

  it("honours an explicit locale override", () => {
    expect(formatMoney({ minor: 12_345_670, currency: "USD" }, { locale: "en-IN" })).toBe(
      "$1,23,456.70",
    );
  });

  it("respects a zero-decimal currency, which the old rupee formatter could not", () => {
    // ¥12,345 is 12345 minor units, not 123.45 — the exponent is 0.
    expect(formatMoney({ minor: 12_345, currency: "JPY" })).toContain("12,345");
  });

  it("respects a three-decimal currency", () => {
    // KWD has 3 minor digits: 12345 fils = 12.345 dinar.
    expect(formatMoney({ minor: 12_345, currency: "KWD" })).toContain("12.345");
  });

  it("prints negative zero as zero", () => {
    expect(formatMoney({ minor: -0, currency: "INR" })).toBe("₹0.00");
  });

  it("formats a negative amount", () => {
    expect(formatMoney({ minor: -500_000, currency: "INR" })).toContain("5,000.00");
  });

  it("can drop the minor units for headline figures", () => {
    expect(formatMoney({ minor: 12_345_670, currency: "INR" }, { wholeUnits: true })).toBe(
      "₹1,23,457",
    );
  });
});

describe("formatMoneyAmount", () => {
  it("omits the symbol but keeps the currency's exponent", () => {
    expect(formatMoneyAmount({ minor: 12_345_670, currency: "INR" })).toBe("1,23,456.70");
    expect(formatMoneyAmount({ minor: 12_345, currency: "JPY" })).toBe("12,345");
  });
});
