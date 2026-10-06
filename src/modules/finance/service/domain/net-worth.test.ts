import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { setupTestDb, teardownTestDb } from "@/test/db";
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
