import { describe, expect, it } from "vitest";
import {
  valueOfUnits,
  toUnitsScaled,
  toPriceScaled,
  fromUnitsScaled,
  UNITS_SCALE,
  PRICE_SCALE,
  toRateBps,
  fromRateBps,
  applyRateBps,
} from "./units";
import { CURRENCIES, CURRENCY_EXPONENT } from "../../db/schema/currency";

describe("valueOfUnits", () => {
  it("values a plain holding exactly", () => {
    // 100 units at ₹250.50 = ₹25,050.00 = 2,505,000 paise
    expect(valueOfUnits(toUnitsScaled(100), toPriceScaled(250.5), "INR")).toBe(2_505_000);
  });

  it("stays exact on the fractional units a mutual fund actually produces", () => {
    // 1234.5678 units at ₹106.8821 = ₹131,953.26 (to the paisa)
    const value = valueOfUnits(toUnitsScaled(1234.5678), toPriceScaled(106.8821), "INR");
    expect(value).toBe(Math.round(1234.5678 * 106.8821 * 100));
  });

  it("survives a product that overflows the safe integer range", () => {
    // 1e7 units at ₹100,000: the intermediate product is 1e24, which a float
    // multiply would silently mangle. The answer is exact in BigInt.
    const value = valueOfUnits(toUnitsScaled(1e7), toPriceScaled(100_000), "INR");
    expect(value).toBe(1e7 * 100_000 * 100);
    expect(Number.isSafeInteger(value)).toBe(true);
  });

  it("rounds half away from zero rather than truncating", () => {
    // 1 unit at a price of exactly half a paisa rounds up, not down.
    expect(valueOfUnits(UNITS_SCALE, toPriceScaled(0.005), "INR")).toBe(1);
    expect(valueOfUnits(-UNITS_SCALE, toPriceScaled(0.005), "INR")).toBe(-1);
  });

  it("respects the currency's minor-unit exponent", () => {
    // Same quantity and price, different currency: both are 2-exponent today,
    // so this pins the behaviour before a 0- or 3-exponent currency is added.
    expect(valueOfUnits(toUnitsScaled(10), toPriceScaled(1.5), "USD")).toBe(1_500);
    expect(valueOfUnits(toUnitsScaled(10), toPriceScaled(1.5), "EUR")).toBe(1_500);
  });

  it("handles a redemption's negative units", () => {
    expect(valueOfUnits(toUnitsScaled(-25), toPriceScaled(40), "INR")).toBe(-100_000);
  });

  it("refuses fractional input, which would mean an unscaled value slipped through", () => {
    expect(() => valueOfUnits(100.5, PRICE_SCALE, "INR")).toThrow(/scaled integers/);
    expect(() => valueOfUnits(UNITS_SCALE, 10.25, "INR")).toThrow(/scaled integers/);
  });

  it("round-trips a unit count", () => {
    expect(fromUnitsScaled(toUnitsScaled(1234.5678))).toBe(1234.5678);
  });
});

describe("rate basis points", () => {
  it("round-trips a typed percentage", () => {
    expect(toRateBps(7.5)).toBe(750);
    expect(toRateBps(8.65)).toBe(865);
    expect(fromRateBps(865)).toBe(8.65);
  });

  it("applies a rate to money in exact integers", () => {
    // ₹1,00,000.00 at 8.65% = ₹8,650.00
    expect(applyRateBps(10_000_000, 865)).toBe(865_000);
  });

  it("rounds half away from zero, so a credit and its debit match", () => {
    expect(applyRateBps(1, 5000)).toBe(1);
    expect(applyRateBps(-1, 5000)).toBe(-1);
  });

  it("survives a position whose intermediate product exceeds 2^53", () => {
    // ₹1,000 Cr in paise × 2000bps: the product is ~2e16, past MAX_SAFE_INTEGER.
    expect(applyRateBps(1_000_00_00_00_000, 2000)).toBe(200_00_00_00_000);
  });
});

describe("CURRENCY_EXPONENT", () => {
  it("agrees with Intl for every launch currency", () => {
    for (const currency of CURRENCIES) {
      const fromIntl = new Intl.NumberFormat("en-US", { style: "currency", currency })
        .resolvedOptions().maximumFractionDigits;
      expect(CURRENCY_EXPONENT[currency], currency).toBe(fromIntl);
    }
  });
});
