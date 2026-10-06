import { describe, expect, it } from "vitest";
import { FX_RATE_SCALE } from "../../db/schema/currency";
import { resolveRate, convert, isStale, FX_PIVOT, type FxRate } from "./fx";

const r = (base: FxRate["base"], quote: FxRate["quote"], date: string, rate: number): FxRate => ({
  base,
  quote,
  date,
  rateScaled: Math.round(rate * FX_RATE_SCALE),
  source: "ECB",
});

// ECB publishes EUR→X, which is why EUR is the pivot.
const rates: FxRate[] = [
  r("EUR", "INR", "2026-10-01", 92.5),
  r("EUR", "INR", "2026-10-03", 93.0),
  r("EUR", "USD", "2026-10-03", 1.08),
  r("EUR", "GBP", "2026-10-03", 0.85),
];

describe("resolveRate", () => {
  it("uses the newest rate on or before the as-of date, not the newest overall", () => {
    const resolved = resolveRate(rates, "EUR", "INR", "2026-10-02");
    expect(resolved?.rateDate).toBe("2026-10-01");
    expect(resolved?.rateScaled).toBe(Math.round(92.5 * FX_RATE_SCALE));
  });

  it("is the identity for a same-currency conversion, with no lookup at all", () => {
    const resolved = resolveRate(rates, "INR", "INR", "2026-10-03");
    expect(resolved).toMatchObject({
      rateNum: 1,
      rateDen: 1,
      rateScaled: FX_RATE_SCALE,
      rateDate: "2026-10-03",
      rateSource: "identity",
    });
  });

  it("keeps the inverted and triangulated rates as exact fractions, not quantised quotients", () => {
    // Regression guard. Collapsing these to one scaled rate quantises the
    // quotient before it multiplies the amount — a ~1e-7 relative error, which
    // is around ₹1,800 on a ₹1,000 Cr position.
    const inverted = resolveRate(rates, "INR", "EUR", "2026-10-03");
    expect(inverted).toMatchObject({
      rateNum: FX_RATE_SCALE,
      rateDen: Math.round(93 * FX_RATE_SCALE),
    });

    const triangulated = resolveRate(rates, "USD", "INR", "2026-10-03");
    expect(triangulated).toMatchObject({
      rateNum: Math.round(93 * FX_RATE_SCALE),
      rateDen: Math.round(1.08 * FX_RATE_SCALE),
    });
  });

  it("inverts a stored pair when asked for the other direction", () => {
    const resolved = resolveRate(rates, "INR", "EUR", "2026-10-03");
    // 1 ÷ 93 ≈ 0.01075269
    expect(resolved?.rateScaled).toBe(Math.round((1 / 93) * FX_RATE_SCALE));
    expect(resolved?.rateSource).toContain("inverted");
  });

  it("triangulates a cross-pair through the pivot", () => {
    // USD → INR = (EUR→INR) ÷ (EUR→USD) = 93 ÷ 1.08 ≈ 86.111
    const resolved = resolveRate(rates, "USD", "INR", "2026-10-03");
    expect(resolved?.rateScaled).toBe(Math.round((93 / 1.08) * FX_RATE_SCALE));
    expect(resolved?.rateSource).toContain(`via ${FX_PIVOT}`);
  });

  it("dates a triangulated pair by its older leg, since that is what binds", () => {
    const staleLeg: FxRate[] = [
      r("EUR", "INR", "2026-09-20", 92),
      r("EUR", "USD", "2026-10-03", 1.08),
    ];
    expect(resolveRate(staleLeg, "USD", "INR", "2026-10-03")?.rateDate).toBe("2026-09-20");
  });

  it("returns null before the first known rate rather than reaching forward", () => {
    // This is the rule that matters most: a 2025 trend point must read as
    // unknown, not be converted at a 2026 rate and presented as observed.
    expect(resolveRate(rates, "EUR", "INR", "2025-01-01")).toBeNull();
    expect(convert(rates, 100_00, "EUR", "INR", "2025-01-01")).toBeNull();
  });

  it("returns null for a currency it has never seen", () => {
    expect(
      resolveRate([r("EUR", "USD", "2026-10-03", 1.08)], "GBP", "USD", "2026-10-03"),
    ).toBeNull();
  });
});

describe("convert", () => {
  it("converts and reports the basis it used", () => {
    // €100.00 → ₹9,300.00
    const result = convert(rates, 10_000, "EUR", "INR", "2026-10-03");
    expect(result).toMatchObject({
      minor: 930_000,
      rateDate: "2026-10-03",
      rateSource: "ECB",
    });
  });

  it("round-trips within a paisa", () => {
    const toInr = convert(rates, 10_000, "EUR", "INR", "2026-10-03");
    const back = convert(rates, toInr!.minor, "INR", "EUR", "2026-10-03");
    expect(Math.abs(back!.minor - 10_000)).toBeLessThanOrEqual(1);
  });

  it("stays exact on an amount whose product passes the float-safe range", () => {
    // ₹1,000 Cr in paise × a scaled rate is ~1e21.
    const huge = 1_000_000_000_000_00;
    const result = convert(rates, huge, "INR", "EUR", "2026-10-03");
    expect(Number.isSafeInteger(result!.minor)).toBe(true);
    expect(result!.minor).toBe(Math.round(huge / 93));
  });

  it("refuses a fractional amount, which would mean major units leaked in", () => {
    expect(() => convert(rates, 100.5, "EUR", "INR", "2026-10-03")).toThrow(/integer minor amount/);
  });
});

describe("isStale", () => {
  it("compares the rate's age against the allowed bound", () => {
    expect(isStale("2026-10-01", "2026-10-03", 7)).toBe(false);
    expect(isStale("2026-09-01", "2026-10-03", 7)).toBe(true);
  });
});
