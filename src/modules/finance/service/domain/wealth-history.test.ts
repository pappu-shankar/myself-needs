import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { setupTestDb, teardownTestDb } from "@/test/db";
import { getWealthAttribution, getWealthHistory } from "./wealth-history";
import { createAccount } from "./accounts";
import { createCategory } from "./categories";
import { createTransaction } from "./transactions";
import { createHolding, createValuation, recordCashFlow } from "./investments";
import { toPriceScaled, toUnitsScaled } from "../utility/units";
import { upsertFxRates } from "../../db/queries/config/fx-rates";

beforeEach(setupTestDb);
afterEach(teardownTestDb);

const PERIOD = ["2026-03-01", "2026-04-01"] as const;

describe("wealth history", () => {
  it("flags a point that cannot be known in the base currency rather than back-converting", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-20T00:00:00Z"));
    createAccount({
      name: "Dollars",
      type: "savings",
      currency: "USD",
      openingBalanceMinor: 100_000,
    });
    // A rate exists only from mid-March, so February cannot be converted.
    upsertFxRates([
      { base: "EUR", quote: "INR", date: "2026-03-15", rateScaled: 90 * 1e8, source: "test" },
      { base: "EUR", quote: "USD", date: "2026-03-15", rateScaled: 1.08 * 1e8, source: "test" },
    ]);

    const points = getWealthHistory(2);
    const byMonth = new Map(points.map((p) => [p.month, p]));

    // February is unknown — not bridged at the nearest rate. A back-converted
    // figure is indistinguishable on a chart from an observed one.
    expect(byMonth.get("2026-02")!.unknown).toBe(true);
    // And the point still carries what is knowable: the native subtotal.
    expect(byMonth.get("2026-02")!.value.byCurrency[0].minor).toBe(100_000);
    expect(byMonth.get("2026-02")!.value.byCurrency[0].baseMinor).toBeNull();
    // March is knowable.
    expect(byMonth.get("2026-03")!.unknown).toBe(false);
    vi.useRealTimers();
  });
});

describe("wealth attribution", () => {
  it("hand-verified: components sum to the total change, with nothing unexplained", () => {
    // ₹50,000 opening cash. Earn ₹20,000, pay ₹3,000 tax, spend ₹5,000.
    // Closing cash is ₹62,000, a change of ₹12,000 = 20,000 − 3,000 − 5,000.
    const bank = createAccount({
      name: "Bank",
      type: "savings",
      currency: "INR",
      openingBalanceMinor: 5_000_000,
    });
    const salary = createCategory({ name: "Salary", type: "income" });
    const rent = createCategory({ name: "Rent", type: "expense" });
    const incomeTax = createCategory({ name: "Income tax", type: "expense", isTax: true });

    createTransaction({
      type: "income",
      accountId: bank.id,
      categoryId: salary.id,
      amountMinor: 2_000_000,
      date: "2026-03-02",
    });
    createTransaction({
      type: "expense",
      accountId: bank.id,
      categoryId: incomeTax.id,
      amountMinor: 300_000,
      date: "2026-03-10",
    });
    createTransaction({
      type: "expense",
      accountId: bank.id,
      categoryId: rent.id,
      amountMinor: 500_000,
      date: "2026-03-12",
    });

    const a = getWealthAttribution(...PERIOD);

    expect(a.openingMinor).toBe(5_000_000);
    expect(a.closingMinor).toBe(6_200_000);
    expect(a.totalChangeMinor).toBe(1_200_000);
    expect(a.income.minor).toBe(2_000_000);
    // Tax is separated from spending, not buried in it.
    expect(a.tax.minor).toBe(-300_000);
    expect(a.spending.minor).toBe(-500_000);
    expect(a.unexplained.minor).toBe(0);
    expect(a.unexplained.known).toBe(true);
  });

  it("attributes a currency move to FX effect rather than to investment gain", () => {
    // $1,000 held throughout, with the rupee weakening from ₹80 to ₹90 per
    // dollar. Nothing was earned or bought; the whole change is currency.
    // Hiding it inside investment gain would credit a skill that was a rate.
    createAccount({
      name: "Dollars",
      type: "savings",
      currency: "USD",
      openingBalanceMinor: 100_000,
    });
    upsertFxRates([
      { base: "EUR", quote: "INR", date: "2026-02-01", rateScaled: 80 * 1e8, source: "test" },
      { base: "EUR", quote: "USD", date: "2026-02-01", rateScaled: 1 * 1e8, source: "test" },
      { base: "EUR", quote: "INR", date: "2026-03-20", rateScaled: 90 * 1e8, source: "test" },
      { base: "EUR", quote: "USD", date: "2026-03-20", rateScaled: 1 * 1e8, source: "test" },
    ]);

    const a = getWealthAttribution(...PERIOD);

    // $1,000 at ₹80 = ₹80,000; at ₹90 = ₹90,000. A ₹10,000 change, all FX.
    expect(a.totalChangeMinor).toBe(1_000_000);
    expect(a.fxEffect.minor).toBe(1_000_000);
    expect(a.investmentGain.minor).toBe(0);
    expect(a.income.minor).toBe(0);
    expect(a.unexplained.minor).toBe(0);
  });

  it("separates a holding's gain from what was contributed to it", () => {
    // Opening: 10 units at ₹100 = ₹1,000. During the period the price rises to
    // ₹150 and 10 more units are bought for ₹1,500. Closing value is 20 × ₹150
    // = ₹3,000. The gain is ₹3,000 − ₹1,000 − ₹1,500 = ₹500, not ₹2,000.
    const holding = createHolding({ type: "equity", name: "Acme", currency: "INR" });
    createValuation({
      holdingId: holding.id,
      date: "2026-02-01",
      priceScaled: toPriceScaled(100),
      priceCurrency: "INR",
    });
    recordCashFlow({
      holdingId: holding.id,
      date: "2026-02-01",
      amountMinor: 100_000,
      unitsScaled: toUnitsScaled(10),
      flowType: "contribution",
    });
    createValuation({
      holdingId: holding.id,
      date: "2026-03-10",
      priceScaled: toPriceScaled(150),
      priceCurrency: "INR",
    });
    recordCashFlow({
      holdingId: holding.id,
      date: "2026-03-10",
      amountMinor: 150_000,
      unitsScaled: toUnitsScaled(10),
      flowType: "contribution",
    });

    const a = getWealthAttribution(...PERIOD);

    expect(a.investmentGain.minor).toBe(50_000);
  });

  it("counts principal repaid as debt reduction and leaves the interest to spending", () => {
    // ₹1,00,000 owed, ₹10,000 of principal repaid. Debt reduction is ₹10,000;
    // splitting an EMI's interest out needs the loan engine, so an EMI
    // recorded whole leaves its interest in the residual rather than guessed.
    const bank = createAccount({
      name: "Bank",
      type: "savings",
      currency: "INR",
      openingBalanceMinor: 5_000_000,
    });
    const loan = createAccount({
      name: "Loan",
      type: "loan",
      currency: "INR",
      openingBalanceMinor: 10_000_000,
    });
    createTransaction({
      type: "transfer",
      accountId: bank.id,
      toAccountId: loan.id,
      amountMinor: 1_000_000,
      date: "2026-03-07",
    });

    const a = getWealthAttribution(...PERIOD);

    expect(a.debtReduction.minor).toBe(1_000_000);
    // Net worth is unchanged: cash fell by exactly what the debt fell by.
    // Which is also why debt reduction is reported but not summed — adding it
    // would make every EMI look like it created ₹10,000 of wealth.
    expect(a.totalChangeMinor).toBe(0);
    expect(a.unexplained.minor).toBe(0);
  });

  it("marks the residual unknown when a component had an unconvertible input", () => {
    // A residual computed from incomplete parts is not a measurement of
    // anything, so it must not be presented as an exact figure.
    createAccount({
      name: "Dollars",
      type: "savings",
      currency: "USD",
      openingBalanceMinor: 100_000,
    });

    const a = getWealthAttribution(...PERIOD);

    expect(a.unexplained.known).toBe(false);
  });
});
