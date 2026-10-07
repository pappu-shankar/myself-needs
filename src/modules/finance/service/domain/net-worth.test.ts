import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { setupTestDb, teardownTestDb } from "@/test/db";
import Database from "better-sqlite3-multiple-ciphers";
import { getNetWorthTrend } from "./net-worth";
import { createAccount } from "./accounts";
import { createCategory } from "./categories";
import { createTransaction } from "./transactions";
import { createHolding, createValuation } from "./investments";
import { toPriceScaled, toUnitsScaled } from "../utility/units";

beforeEach(setupTestDb);
afterEach(teardownTestDb);

describe("net-worth service", () => {
  it("hand-verified: sums point-in-time account balances and holding values for each of the last N months", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-10T00:00:00Z"));

    const checking = createAccount({
      name: "Checking",
      type: "checking",
      openingBalanceMinor: 100000,
    });
    const salary = createCategory({ name: "Salary", type: "income" });
    createTransaction({
      type: "income",
      accountId: checking.id,
      categoryId: salary.id,
      amountMinor: 50000,
      date: "2026-01-15",
    });
    createTransaction({
      type: "income",
      accountId: checking.id,
      categoryId: salary.id,
      amountMinor: 20000,
      date: "2026-02-05",
    });

    const holding = createHolding({
      type: "equity",
      name: "Stock A",
      unitsScaled: toUnitsScaled(10),
    });
    createValuation({ holdingId: holding.id, date: "2026-01-20", priceScaled: toPriceScaled(100) });
    createValuation({ holdingId: holding.id, date: "2026-02-05", priceScaled: toPriceScaled(120) });

    const trend = getNetWorthTrend(2);

    // Jan point is as-of the last day of Jan (2026-01-31): checking = 1000+500=1500,
    // holding = 10 * 100 (latest valuation on/before 2026-01-31) = 1000. Total 2500.
    // Feb point (the current month) is as-of "today" (2026-02-10): checking = 1000+500+200=1700,
    // holding = 10 * 120 (latest valuation on/before 2026-02-10) = 1200. Total 2900.
    expect(trend.map((p) => [p.month, p.netWorth.baseMinor, p.netWorth.complete])).toEqual([
      ["2026-01", 250000, true],
      ["2026-02", 290000, true],
    ]);

    vi.useRealTimers();
  });

  it("defaults to a 12-month trend", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-15T00:00:00Z"));

    createAccount({ name: "Checking", type: "checking", openingBalanceMinor: 50000 });

    expect(getNetWorthTrend()).toHaveLength(12);
    const last = getNetWorthTrend().at(-1);
    expect(last?.month).toBe("2026-06");
    expect(last?.netWorth.baseMinor).toBe(50000);

    vi.useRealTimers();
  });
});

describe("net-worth trend query batching (step 5.6)", () => {
  /**
   * Counts statements by wrapping the driver's `prepare`, which is where every
   * query drizzle issues ends up — spying on the drizzle handle instead would
   * miss everything built through the query builder rather than raw SQL.
   */
  function countingQueries<T>(run: () => T): { result: T; queries: number } {
    const proto = Database.prototype as unknown as { prepare: (sql: string) => unknown };
    const original = proto.prepare;
    let queries = 0;
    proto.prepare = function (this: unknown, sql: string) {
      queries += 1;
      return original.call(this, sql);
    } as typeof original;
    try {
      return { result: run(), queries };
    } finally {
      proto.prepare = original;
    }
  }

  /**
   * Seeds a vault with `holdingCount` priced holdings, each with units and a
   * valuation, so the per-holding fan-out has something to fan out over.
   */
  function seedPortfolio(holdingCount: number) {
    createAccount({ name: "Checking", type: "checking", openingBalanceMinor: 1_000_000 });
    for (let i = 0; i < holdingCount; i += 1) {
      const holding = createHolding({
        type: "equity",
        name: `Stock ${i}`,
        unitsScaled: toUnitsScaled(10),
      });
      createValuation({
        holdingId: holding.id,
        date: "2026-01-15",
        priceScaled: toPriceScaled(100 + i),
        priceCurrency: "INR",
      });
    }
  }

  it("does not issue more queries as the portfolio grows", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-10T00:00:00Z"));

    seedPortfolio(10);
    const small = countingQueries(() => getNetWorthTrend(12));

    teardownTestDb();
    setupTestDb();
    vi.setSystemTime(new Date("2026-02-10T00:00:00Z"));
    seedPortfolio(40);
    const large = countingQueries(() => getNetWorthTrend(12));

    // The loop used to cost 2 queries per holding per month — roughly 757 at
    // 30 holdings over 12 months. Quadrupling the portfolio must now move the
    // count not at all, which is the property that actually matters: no fan-out.
    expect(large.queries).toBe(small.queries);
    // And it is a small constant rather than hundreds: 30 at the time of
    // writing, for a 12-month trend of any size, against roughly 757 before.
    expect(small.queries).toBeLessThan(80);
    // Sanity: the figures still differ, so the two runs really did see
    // different portfolios and the count is not constant because nothing ran.
    expect(large.result[11].netWorth.baseMinor).not.toBe(small.result[11].netWorth.baseMinor);
    vi.useRealTimers();
  });

  it("produces the same figures the per-holding computation did", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-10T00:00:00Z"));
    seedPortfolio(3);

    const trend = getNetWorthTrend(3);

    // Hand-computed: ₹10,000 cash, plus 10 units each at ₹100, ₹101 and ₹102,
    // which is ₹3,030. The valuations are dated 2026-01-15, so December has
    // cash only.
    const byMonth = new Map(trend.map((p) => [p.month, p.netWorth.baseMinor]));
    expect(byMonth.get("2025-12")).toBe(1_000_000);
    expect(byMonth.get("2026-01")).toBe(1_000_000 + 303_000);
    expect(byMonth.get("2026-02")).toBe(1_000_000 + 303_000);
    expect(trend.every((p) => p.netWorth.complete)).toBe(true);
    vi.useRealTimers();
  });

  it("resolves each month against its own as-of date, not today's", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-10T00:00:00Z"));
    createAccount({ name: "Checking", type: "checking", openingBalanceMinor: 1_000_000 });
    const holding = createHolding({
      type: "equity",
      name: "Late valuation",
      unitsScaled: toUnitsScaled(10),
    });
    // Priced only in February. January must not borrow February's price —
    // that is the bug a preload makes easy to introduce, because the whole
    // history is sitting in memory.
    createValuation({
      holdingId: holding.id,
      date: "2026-02-01",
      priceScaled: toPriceScaled(500),
      priceCurrency: "INR",
    });

    const byMonth = new Map(getNetWorthTrend(2).map((p) => [p.month, p.netWorth.baseMinor]));

    expect(byMonth.get("2026-01")).toBe(1_000_000);
    expect(byMonth.get("2026-02")).toBe(1_000_000 + 500_000);
    vi.useRealTimers();
  });
});
