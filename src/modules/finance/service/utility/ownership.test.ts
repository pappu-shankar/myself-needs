import { describe, expect, it } from "vitest";
import {
  prorate,
  stakeBpsAt,
  consolidate,
  BPS_FULL,
  type Stake,
  type EntityPosition,
} from "./ownership";

describe("prorate", () => {
  it("applies a stake in basis points", () => {
    // 70% of ₹20 Cr = ₹14 Cr
    expect(prorate(20_00_00_000_00, 7000)).toBe(14_00_00_000_00);
  });

  it("returns the amount untouched at 100%, with no rounding step at all", () => {
    expect(prorate(123_457, BPS_FULL)).toBe(123_457);
  });

  it("rounds half away from zero, in both directions", () => {
    expect(prorate(999, 5000)).toBe(500); // 499.5
    expect(prorate(-999, 5000)).toBe(-500);
  });

  it("stays exact where minor × bps passes the float-safe range", () => {
    // ₹10,000 Cr in paise × 10000 bps = 1e19, far past MAX_SAFE_INTEGER.
    const huge = 1_000_000_000_000_00; // ₹1,000 Cr in paise
    expect(prorate(huge, 7000)).toBe(700_000_000_000_00);
  });

  it("refuses a fractional amount, which would mean rupees leaked in", () => {
    expect(() => prorate(100.5, 5000)).toThrow(/integer minor amount/);
  });
});

describe("stakeBpsAt", () => {
  const stakes: Stake[] = [
    {
      entityId: 2,
      holderEntityId: 1,
      ownershipBps: 10_000,
      effectiveFrom: "2020-01-01",
      effectiveTo: "2023-06-01",
    },
    {
      entityId: 2,
      holderEntityId: 1,
      ownershipBps: 7_000,
      effectiveFrom: "2023-06-01",
      effectiveTo: null,
    },
  ];

  it("uses the stake in force on the date asked about, not the current one", () => {
    expect(stakeBpsAt(stakes, 2, "2022-01-01")).toBe(10_000);
    expect(stakeBpsAt(stakes, 2, "2024-01-01")).toBe(7_000);
  });

  it("treats effective_to as exclusive, so the handover date has one answer", () => {
    expect(stakeBpsAt(stakes, 2, "2023-06-01")).toBe(7_000);
  });

  it("is null before the first stake and for an unknown entity", () => {
    expect(stakeBpsAt(stakes, 2, "2019-12-31")).toBeNull();
    expect(stakeBpsAt(stakes, 99, "2024-01-01")).toBeNull();
  });
});

describe("consolidate", () => {
  const atPar = { convertToBase: (minor: number) => minor };

  it("sums per entity before prorating, so rounding happens once", () => {
    // Three ₹3.33 rows at a 50% stake. Summing first gives 999 → 500.
    // Prorating each row first gives 167 × 3 = 501 — one paisa of invented
    // money, and it grows with the number of rows.
    const positions: EntityPosition[] = [
      { entityId: 1, currency: "INR", minor: 333 },
      { entityId: 1, currency: "INR", minor: 333 },
      { entityId: 1, currency: "INR", minor: 333 },
    ];
    const result = consolidate(positions, { stakeBpsFor: () => 5000, ...atPar });
    expect(result.totalMinor).toBe(500);
    expect(positions.reduce((s, p) => s + prorate(p.minor, 5000), 0)).toBe(501);
  });

  it("keeps per-currency subtotals in their own currency, pre-conversion", () => {
    const positions: EntityPosition[] = [
      { entityId: 1, currency: "INR", minor: 100_000 },
      { entityId: 1, currency: "USD", minor: 50_000 },
    ];
    const result = consolidate(positions, {
      stakeBpsFor: () => BPS_FULL,
      // 1 USD = 83 INR
      convertToBase: (minor, from) => (from === "USD" ? minor * 83 : minor),
    });
    expect(result.byCurrency).toEqual([
      { currency: "INR", minor: 100_000 },
      { currency: "USD", minor: 50_000 },
    ]);
    expect(result.totalMinor).toBe(100_000 + 50_000 * 83);
  });

  it("prorates per entity, so a part-owned business contributes only its share", () => {
    const positions: EntityPosition[] = [
      { entityId: 1, currency: "INR", minor: 1_000_000 }, // Self, wholly owned
      { entityId: 2, currency: "INR", minor: 2_000_000 }, // business, 70%
    ];
    const result = consolidate(positions, {
      stakeBpsFor: (id) => (id === 1 ? BPS_FULL : 7000),
      ...atPar,
    });
    expect(result.totalMinor).toBe(1_000_000 + 1_400_000);
  });

  it("omits an entity with no stake rather than assuming full ownership", () => {
    const positions: EntityPosition[] = [
      { entityId: 1, currency: "INR", minor: 500 },
      { entityId: 7, currency: "INR", minor: 999_999 },
    ];
    const result = consolidate(positions, {
      stakeBpsFor: (id) => (id === 1 ? BPS_FULL : null),
      ...atPar,
    });
    expect(result.totalMinor).toBe(500);
  });

  it("drops a currency from the total when no rate is known, but still reports it", () => {
    // A rate is never invented. The currency's own subtotal is still shown, so
    // the gap is visible instead of silently absorbed into the base total.
    const positions: EntityPosition[] = [
      { entityId: 1, currency: "INR", minor: 100_000 },
      { entityId: 1, currency: "GBP", minor: 40_000 },
    ];
    const result = consolidate(positions, {
      stakeBpsFor: () => BPS_FULL,
      convertToBase: (minor, from) => (from === "GBP" ? null : minor),
    });
    expect(result.totalMinor).toBe(100_000);
    expect(result.byCurrency).toEqual([
      { currency: "INR", minor: 100_000 },
      { currency: "GBP", minor: 40_000 },
    ]);
  });
});
