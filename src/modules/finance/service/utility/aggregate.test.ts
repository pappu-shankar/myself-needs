import { describe, expect, it } from "vitest";
import {
  aggregateToBase,
  confidenceMix,
  mergeByCurrency,
  negateByCurrency,
  weakestConfidence,
} from "./aggregate";
import { FX_RATE_SCALE } from "../../db/schema/currency";
import type { FxRate } from "./fx";
import type { Currency } from "../../db/schema/currency";

/** EUR pivot, as the ECB publishes it: one EUR buys this much of the quote. */
function rate(quote: Currency, value: number, date: string): FxRate {
  return {
    base: "EUR",
    quote,
    date,
    rateScaled: Math.round(value * FX_RATE_SCALE),
    source: "ecb",
  };
}

const RATES: FxRate[] = [rate("INR", 90, "2026-03-01"), rate("USD", 1.08, "2026-03-01")];

describe("aggregateToBase", () => {
  it("converts every currency and reports the rate it used for each", () => {
    const result = aggregateToBase(
      new Map<Currency, number>([
        ["INR", 10_000_000], // ₹1,00,000.00
        ["USD", 100_000], // $1,000.00
      ]),
      { baseCurrency: "INR", asOf: "2026-03-02", rates: RATES },
    );

    // $1,000 → EUR 925.925926 → ₹83,333.33, plus the ₹1,00,000 already in base.
    expect(result.baseCurrency).toBe("INR");
    expect(result.baseMinor).toBe(10_000_000 + 8_333_333);
    expect(result.complete).toBe(true);
    const usd = result.byCurrency.find((c) => c.currency === "USD")!;
    expect(usd.rateDate).toBe("2026-03-01");
    expect(usd.rateSource).toContain("ecb");
    const inr = result.byCurrency.find((c) => c.currency === "INR")!;
    expect(inr.rateSource).toBe("identity");
  });

  it("refuses to invent a rate, and says the total is incomplete", () => {
    const result = aggregateToBase(
      new Map<Currency, number>([
        ["INR", 10_000_000],
        ["GBP", 50_000],
      ]),
      { baseCurrency: "INR", asOf: "2026-03-02", rates: RATES },
    );

    // The GBP leg contributes nothing rather than being converted at 1:1 or at
    // some other currency's rate — and the caller is told.
    expect(result.complete).toBe(false);
    expect(result.baseMinor).toBe(10_000_000);
    const gbp = result.byCurrency.find((c) => c.currency === "GBP")!;
    expect(gbp.baseMinor).toBeNull();
    expect(gbp.minor).toBe(50_000);
  });

  it("will not use a rate dated after the as-of date", () => {
    const result = aggregateToBase(new Map<Currency, number>([["USD", 100_000]]), {
      baseCurrency: "INR",
      asOf: "2026-02-01",
      rates: RATES,
    });
    expect(result.complete).toBe(false);
  });

  it("flags a stale rate without refusing to use it", () => {
    const result = aggregateToBase(new Map<Currency, number>([["USD", 100_000]]), {
      baseCurrency: "INR",
      asOf: "2026-06-01",
      rates: RATES,
      maxRateAgeDays: 7,
    });
    expect(result.complete).toBe(true);
    expect(result.stale).toBe(true);
  });

  it("orders contributions deterministically, so a total does not reshuffle between renders", () => {
    const forward = aggregateToBase(
      new Map<Currency, number>([
        ["USD", 1],
        ["INR", 1],
      ]),
      { baseCurrency: "INR", asOf: "2026-03-02", rates: RATES },
    );
    const reverse = aggregateToBase(
      new Map<Currency, number>([
        ["INR", 1],
        ["USD", 1],
      ]),
      { baseCurrency: "INR", asOf: "2026-03-02", rates: RATES },
    );
    expect(forward.byCurrency.map((c) => c.currency)).toEqual(
      reverse.byCurrency.map((c) => c.currency),
    );
  });

  it("treats a currency with no stated confidence as unknown, not as verified", () => {
    const result = aggregateToBase(new Map<Currency, number>([["INR", 10_000_000]]), {
      baseCurrency: "INR",
      asOf: "2026-03-02",
      rates: RATES,
    });
    expect(result.confidence).toBe("unknown");
  });

  it("takes the weakest confidence and reports the mix by value", () => {
    const result = aggregateToBase(
      new Map<Currency, number>([
        ["INR", 9_000_000],
        ["USD", 100_000],
      ]),
      {
        baseCurrency: "INR",
        asOf: "2026-03-02",
        rates: RATES,
        confidenceByCurrency: new Map<Currency, "verified" | "estimated">([
          ["INR", "verified"],
          ["USD", "estimated"],
        ]),
      },
    );
    expect(result.confidence).toBe("estimated");
    const estimated = result.confidenceMix.find((m) => m.confidence === "estimated")!;
    // The $1,000 leg is ~₹83,333 of a ~₹1,73,333 total: a bit under half.
    expect(estimated.share).toBeGreaterThan(0.4);
    expect(estimated.share).toBeLessThan(0.5);
    expect(result.confidenceMix.map((m) => m.share).reduce((a, b) => a + b, 0)).toBeCloseTo(1);
  });
});

describe("weakestConfidence", () => {
  it("is unknown for an empty set — nothing observed is not something verified", () => {
    expect(weakestConfidence([])).toBe("unknown");
  });

  it("ranks unknown below estimated below reported below verified", () => {
    expect(weakestConfidence(["verified", "reported"])).toBe("reported");
    expect(weakestConfidence(["verified", "estimated"])).toBe("estimated");
    expect(weakestConfidence(["estimated", "unknown"])).toBe("unknown");
  });
});

describe("confidenceMix", () => {
  it("weights by absolute value, so a liability does not cancel an asset's share", () => {
    const mix = confidenceMix([
      { confidence: "verified", baseMinor: 1000 },
      { confidence: "estimated", baseMinor: -1000 },
    ]);
    expect(mix.find((m) => m.confidence === "verified")!.share).toBeCloseTo(0.5);
    expect(mix.find((m) => m.confidence === "estimated")!.share).toBeCloseTo(0.5);
  });

  it("does not divide by zero on an empty aggregate", () => {
    const mix = confidenceMix([{ confidence: "verified", baseMinor: 0 }]);
    expect(mix[0].share).toBe(0);
  });
});

describe("mergeByCurrency / negateByCurrency", () => {
  it("adds subtotals per currency without converting", () => {
    const merged = mergeByCurrency(
      new Map<Currency, number>([
        ["INR", 100],
        ["USD", 5],
      ]),
      new Map<Currency, number>([["INR", 50]]),
    );
    expect(merged.get("INR")).toBe(150);
    expect(merged.get("USD")).toBe(5);
  });

  it("negates every subtotal", () => {
    expect([...negateByCurrency(new Map<Currency, number>([["INR", 100]]))]).toEqual([
      ["INR", -100],
    ]);
  });
});
