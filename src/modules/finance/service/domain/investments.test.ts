import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { setupTestDb, teardownTestDb } from "@/test/db";
import {
  createCashFlow,
  createHolding,
  createValuation,
  getCashFlowsForHolding,
  getHolding,
  getHoldingsByGoalId,
  getHoldingsWithValue,
  getHoldingValue,
  getPortfolioXirr,
  getTotalHoldingsValue,
  getValuationsForHolding,
  recordCashFlow,
  refreshMutualFundNav,
  signedAmount,
} from "./investments";

beforeEach(setupTestDb);
afterEach(teardownTestDb);

describe("investments service", () => {
  it("creates a holding and fetches it by id, or null when missing", () => {
    const holding = createHolding({ type: "equity", name: "Stock A", units: 10 });

    expect(getHolding(holding.id)).toMatchObject({ name: "Stock A", units: 10 });
    expect(getHolding(holding.id + 999)).toBeNull();
  });

  it("creates and lists cash flows for a holding, newest first", () => {
    const holding = createHolding({ type: "equity", name: "Stock A", units: 10 });
    createCashFlow({
      holdingId: holding.id,
      date: "2021-01-01",
      amount: -1000,
      flowType: "contribution",
    });
    createCashFlow({
      holdingId: holding.id,
      date: "2021-06-01",
      amount: -500,
      flowType: "contribution",
    });

    const flows = getCashFlowsForHolding(holding.id);
    expect(flows.map((f) => f.date)).toEqual(["2021-06-01", "2021-01-01"]);
  });

  it("creates and lists valuations for a holding, newest first", () => {
    const holding = createHolding({ type: "equity", name: "Stock A", units: 10 });
    createValuation({ holdingId: holding.id, date: "2021-01-01", pricePerUnit: 10 });
    createValuation({ holdingId: holding.id, date: "2021-06-01", pricePerUnit: 12 });

    const valuations = getValuationsForHolding(holding.id);
    expect(valuations.map((v) => v.pricePerUnit)).toEqual([12, 10]);
  });

  it("a second valuation for the same day replaces the price", () => {
    const holding = createHolding({ type: "equity", name: "Stock A", units: 10 });
    createValuation({ holdingId: holding.id, date: "2021-01-01", pricePerUnit: 10 });
    createValuation({ holdingId: holding.id, date: "2021-01-01", pricePerUnit: 11 });

    expect(getValuationsForHolding(holding.id).map((v) => v.pricePerUnit)).toEqual([11]);
  });

  describe("getHoldingValue", () => {
    it("unit-priced: 0 flagged missing price, with a null asOfDate, when there's no valuation yet", () => {
      const holding = createHolding({ type: "equity", name: "Stock A", units: 10 });

      expect(getHoldingValue(holding)).toMatchObject({
        currentValue: 0,
        basis: "valuation",
        asOfDate: null,
        units: 10,
        missing: "price",
      });
    });

    it("unit-priced: units * latest price on/before asOfDate", () => {
      const holding = createHolding({ type: "equity", name: "Stock A", units: 10 });
      createValuation({ holdingId: holding.id, date: "2026-01-10", pricePerUnit: 50 });
      createValuation({ holdingId: holding.id, date: "2026-02-10", pricePerUnit: 60 });

      expect(getHoldingValue(holding, "2026-01-15")).toMatchObject({
        currentValue: 500,
        basis: "valuation",
        asOfDate: "2026-01-10",
        missing: null,
      });
      expect(getHoldingValue(holding, "2026-02-10")).toMatchObject({
        currentValue: 600,
        basis: "valuation",
        asOfDate: "2026-02-10",
      });
    });

    it("accrual (FD/RD): a single contribution compounds annually to the standard formula", () => {
      // 365.25 days/year * 4 = exactly 1461 days, matching the real calendar span
      // 2020-01-01 -> 2024-01-01 (one leap day per year on average), so years = 4 exactly.
      // 10000 * (1.10)^4 = 14641.
      const holding = createHolding({ type: "fd", name: "Fixed Deposit", interestRate: 10 });
      createCashFlow({
        holdingId: holding.id,
        date: "2020-01-01",
        amount: -10000,
        flowType: "contribution",
      });

      const value = getHoldingValue(holding, "2024-01-01");

      expect(value.basis).toBe("accrual");
      expect(value.currentValue).toBeCloseTo(14641, 3);
    });

    it("accrual: same-day valuation returns the un-compounded principal minus any payout", () => {
      const holding = createHolding({ type: "fd", name: "Fixed Deposit", interestRate: 10 });
      createCashFlow({
        holdingId: holding.id,
        date: "2021-06-01",
        amount: -10000,
        flowType: "contribution",
      });

      expect(getHoldingValue(holding, "2021-06-01").currentValue).toBe(10000);

      createCashFlow({
        holdingId: holding.id,
        date: "2021-06-01",
        amount: 12000,
        flowType: "maturity",
      });
      // A payout larger than the (uncompounded) principal floors at 0, never negative.
      expect(getHoldingValue(holding, "2021-06-01").currentValue).toBe(0);
    });

    it("net_invested: total contributed minus total received, filtered by asOfDate", () => {
      const holding = createHolding({ type: "chit_fund", name: "Chit" });
      createCashFlow({
        holdingId: holding.id,
        date: "2021-01-01",
        amount: -5000,
        flowType: "contribution",
      });
      createCashFlow({
        holdingId: holding.id,
        date: "2021-06-01",
        amount: -3000,
        flowType: "contribution",
      });
      createCashFlow({
        holdingId: holding.id,
        date: "2021-08-01",
        amount: 2000,
        flowType: "dividend",
      });

      expect(getHoldingValue(holding, "2021-05-01").currentValue).toBe(5000);
      expect(getHoldingValue(holding, "2021-12-31").currentValue).toBe(6000);
    });
  });

  describe("units over time (unit-priced)", () => {
    it("sums units from buys and sells up to the valuation date", () => {
      const fund = createHolding({ type: "mutual_fund_domestic", name: "Fund" });
      recordCashFlow({
        holdingId: fund.id,
        date: "2025-01-01",
        flowType: "contribution",
        amount: 1000,
        units: 100,
      });
      recordCashFlow({
        holdingId: fund.id,
        date: "2025-06-01",
        flowType: "contribution",
        amount: 600,
        units: 50,
      });
      recordCashFlow({
        holdingId: fund.id,
        date: "2025-09-01",
        flowType: "redemption",
        amount: 480,
        units: 40,
      });
      createValuation({ holdingId: fund.id, date: "2025-01-01", pricePerUnit: 10 });
      createValuation({ holdingId: fund.id, date: "2025-08-01", pricePerUnit: 12 });

      expect(getHoldingValue(fund, "2025-03-01")).toMatchObject({ units: 100, currentValue: 1000 });
      expect(getHoldingValue(fund, "2025-08-15")).toMatchObject({ units: 150, currentValue: 1800 });
      expect(getHoldingValue(fund, "2025-12-31")).toMatchObject({ units: 110, currentValue: 1320 });
    });

    it("adds per-flow units on top of a legacy holding-level units balance", () => {
      const stock = createHolding({ type: "equity", name: "Legacy", units: 10 });
      createCashFlow({
        holdingId: stock.id,
        date: "2024-01-01",
        amount: -1000,
        flowType: "contribution",
      });
      recordCashFlow({
        holdingId: stock.id,
        date: "2025-01-01",
        flowType: "contribution",
        amount: 500,
        units: 5,
      });
      createValuation({ holdingId: stock.id, date: "2025-02-01", pricePerUnit: 100 });

      expect(getHoldingValue(stock, "2025-02-01")).toMatchObject({ units: 15, currentValue: 1500 });
    });

    it("never assumes 1 unit: no units anywhere means value unknown ('Add units')", () => {
      const stock = createHolding({ type: "equity", name: "No units" });
      createCashFlow({
        holdingId: stock.id,
        date: "2024-01-01",
        amount: -1000,
        flowType: "contribution",
      });
      createValuation({ holdingId: stock.id, date: "2024-06-01", pricePerUnit: 250 });

      expect(getHoldingValue(stock, "2024-06-01")).toMatchObject({
        currentValue: 0,
        units: null,
        missing: "units",
        asOfDate: "2024-06-01",
      });
    });

    it("a fully sold holding is closed at 0", () => {
      const stock = createHolding({ type: "equity", name: "Sold" });
      recordCashFlow({
        holdingId: stock.id,
        date: "2024-01-01",
        flowType: "contribution",
        amount: 1000,
        units: 10,
      });
      recordCashFlow({
        holdingId: stock.id,
        date: "2024-06-01",
        flowType: "redemption",
        amount: 1200,
        units: 10,
      });
      createValuation({ holdingId: stock.id, date: "2024-06-01", pricePerUnit: 120 });

      expect(getHoldingValue(stock, "2024-07-01")).toMatchObject({ currentValue: 0, closed: true });
    });
  });

  describe("recordCashFlow (sign derived from flow type)", () => {
    it("stores contributions negative and every money-received type positive", () => {
      expect(signedAmount("contribution", 500)).toBe(-500);
      for (const t of ["redemption", "dividend", "interest", "maturity"] as const) {
        expect(signedAmount(t, 500)).toBe(500);
      }
      // A stray minus from the user never flips the meaning.
      expect(signedAmount("contribution", -500)).toBe(-500);
      expect(signedAmount("redemption", -500)).toBe(500);
    });

    it("stores signed amount and signed units from positive input", () => {
      const fund = createHolding({ type: "mutual_fund_domestic", name: "Fund" });
      recordCashFlow({
        holdingId: fund.id,
        date: "2025-01-01",
        flowType: "contribution",
        amount: 1000,
        units: 100,
      });
      recordCashFlow({
        holdingId: fund.id,
        date: "2025-02-01",
        flowType: "redemption",
        amount: 300,
        units: 25,
      });

      const flows = getCashFlowsForHolding(fund.id);
      expect(flows.map((f) => [f.flowType, f.amount, f.units])).toEqual([
        ["redemption", 300, -25],
        ["contribution", -1000, 100],
      ]);
    });

    it("requires units for buys/sells of unit-priced holdings", () => {
      const fund = createHolding({ type: "mutual_fund_domestic", name: "Fund" });
      expect(() =>
        recordCashFlow({
          holdingId: fund.id,
          date: "2025-01-01",
          flowType: "contribution",
          amount: 1000,
        }),
      ).toThrow("Enter how many units this bought");
      // Dividends don't change units, so none needed.
      expect(() =>
        recordCashFlow({
          holdingId: fund.id,
          date: "2025-01-01",
          flowType: "dividend",
          amount: 50,
        }),
      ).not.toThrow();
    });

    it("rejects selling more units than held on that date", () => {
      const fund = createHolding({ type: "mutual_fund_domestic", name: "Fund" });
      recordCashFlow({
        holdingId: fund.id,
        date: "2025-01-01",
        flowType: "contribution",
        amount: 1000,
        units: 10,
      });
      expect(() =>
        recordCashFlow({
          holdingId: fund.id,
          date: "2025-02-01",
          flowType: "redemption",
          amount: 2000,
          units: 11,
        }),
      ).toThrow("Only 10 units were held on 2025-02-01");
    });

    it("rejects a non-positive amount and an unknown holding", () => {
      const fd = createHolding({ type: "fd", name: "FD", interestRate: 7 });
      expect(() =>
        recordCashFlow({
          holdingId: fd.id,
          date: "2025-01-01",
          flowType: "contribution",
          amount: 0,
        }),
      ).toThrow("Amount must be more than zero");
      expect(() =>
        recordCashFlow({
          holdingId: fd.id + 99,
          date: "2025-01-01",
          flowType: "contribution",
          amount: 1,
        }),
      ).toThrow("Holding not found");
    });

    it("ignores units for holdings that aren't unit-priced", () => {
      const fd = createHolding({ type: "fd", name: "FD", interestRate: 7 });
      const flow = recordCashFlow({
        holdingId: fd.id,
        date: "2025-01-01",
        flowType: "contribution",
        amount: 1000,
        units: 3,
      });
      expect(flow).toMatchObject({ amount: -1000, units: null });
    });
  });

  describe("FD/RD maturity", () => {
    // 2020-01-01 -> 2022-01-01 is 731 days; 10000 * 1.1^(731/365.25).
    const maturityValue = 10000 * Math.pow(1.1, 731 / 365.25);

    function makeFd() {
      const fd = createHolding({
        type: "fd",
        name: "FD",
        interestRate: 10,
        maturityDate: "2022-01-01",
      });
      recordCashFlow({
        holdingId: fd.id,
        date: "2020-01-01",
        flowType: "contribution",
        amount: 10000,
      });
      return fd;
    }

    it("stops accruing at maturity and flags the missing payout", () => {
      const fd = makeFd();
      const before = getHoldingValue(fd, "2021-01-01");
      expect(before.maturedOn).toBeNull();

      const after = getHoldingValue(fd, "2026-01-01");
      expect(after.currentValue).toBeCloseTo(maturityValue, 6);
      expect(after).toMatchObject({
        maturedOn: "2022-01-01",
        asOfDate: "2022-01-01",
        closed: false,
      });
    });

    it("is closed at 0 once the maturity payout is recorded", () => {
      const fd = makeFd();
      recordCashFlow({ holdingId: fd.id, date: "2022-01-01", flowType: "maturity", amount: 12100 });

      expect(getHoldingValue(fd, "2026-01-01")).toMatchObject({
        currentValue: 0,
        closed: true,
        maturedOn: null,
      });
      // Net-worth history before the payout still shows the accrued value.
      expect(getHoldingValue(fd, "2021-12-31").currentValue).toBeGreaterThan(10000);
    });

    it("a redemption after maturity also closes it", () => {
      const fd = makeFd();
      recordCashFlow({
        holdingId: fd.id,
        date: "2022-01-05",
        flowType: "redemption",
        amount: 12100,
      });
      expect(getHoldingValue(fd, "2023-01-01")).toMatchObject({ currentValue: 0, closed: true });
    });
  });

  describe("government schemes", () => {
    it("credited interest raises the balance; paid-out interest (dividend) and withdrawals don't inflate it", () => {
      const ppf = createHolding({ type: "govt_scheme", name: "PPF" });
      recordCashFlow({
        holdingId: ppf.id,
        date: "2024-04-01",
        flowType: "contribution",
        amount: 150000,
      });
      recordCashFlow({
        holdingId: ppf.id,
        date: "2025-03-31",
        flowType: "interest",
        amount: 10650,
      });
      expect(getHoldingValue(ppf, "2025-04-01")).toMatchObject({
        currentValue: 160650,
        basis: "balance",
      });

      recordCashFlow({
        holdingId: ppf.id,
        date: "2025-06-01",
        flowType: "redemption",
        amount: 50000,
      });
      recordCashFlow({ holdingId: ppf.id, date: "2025-07-01", flowType: "dividend", amount: 1000 });
      expect(getHoldingValue(ppf, "2025-12-31").currentValue).toBe(110650);
    });
  });

  it("getTotalHoldingsValue sums every holding's value as of a given date", () => {
    const fd = createHolding({ type: "fd", name: "Fixed Deposit", interestRate: 10 });
    createCashFlow({
      holdingId: fd.id,
      date: "2021-06-01",
      amount: -10000,
      flowType: "contribution",
    });
    const chit = createHolding({ type: "chit_fund", name: "Chit" });
    createCashFlow({
      holdingId: chit.id,
      date: "2021-01-01",
      amount: -2000,
      flowType: "contribution",
    });

    expect(getTotalHoldingsValue("2021-06-01")).toBe(10000 + 2000);
  });

  it("getHoldingsByGoalId returns only holdings linked to that goal", () => {
    const linked = createHolding({ type: "equity", name: "Linked", units: 1, linkedGoalId: 42 });
    createHolding({ type: "equity", name: "Unlinked", units: 1 });
    createHolding({ type: "equity", name: "Other goal", units: 1, linkedGoalId: 7 });

    const holdings = getHoldingsByGoalId(42);
    expect(holdings.map((h) => h.id)).toEqual([linked.id]);
  });

  describe("with fake time pinned to 2022-01-01 (for the 'as of today' XIRR leg)", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2022-01-01T00:00:00Z"));
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it("getHoldingsWithValue attaches a hand-verified XIRR alongside the value", () => {
      const holding = createHolding({ type: "equity", name: "Stock A", units: 100 });
      createCashFlow({
        holdingId: holding.id,
        date: "2021-01-01",
        amount: -1000,
        flowType: "contribution",
      });
      createValuation({ holdingId: holding.id, date: "2021-06-01", pricePerUnit: 11 });

      const [withValue] = getHoldingsWithValue();

      expect(withValue.currentValue).toBe(1100);
      // -1000 on 2021-01-01, +1100 "as of today" (2022-01-01) is exactly 365 days -> 10% XIRR.
      expect(withValue.xirr).toBeCloseTo(0.1, 4);
    });

    it("XIRR is null (shown as —), not -100%, when a holding has no valuation", () => {
      const holding = createHolding({ type: "equity", name: "Unpriced", units: 10 });
      createCashFlow({
        holdingId: holding.id,
        date: "2021-01-01",
        amount: -1000,
        flowType: "contribution",
      });

      const [withValue] = getHoldingsWithValue();
      expect(withValue.missing).toBe("price");
      expect(withValue.xirr).toBeNull();
      expect(getPortfolioXirr()).toBeNull();
    });

    it("govt-scheme credited interest isn't double-counted in XIRR", () => {
      const ppf = createHolding({ type: "govt_scheme", name: "PPF" });
      recordCashFlow({
        holdingId: ppf.id,
        date: "2021-01-01",
        flowType: "contribution",
        amount: 1000,
      });
      recordCashFlow({ holdingId: ppf.id, date: "2021-12-31", flowType: "interest", amount: 100 });

      const [withValue] = getHoldingsWithValue();
      expect(withValue.currentValue).toBe(1100);
      // -1000 on 2021-01-01, +1100 balance on 2022-01-01 -> 10%.
      expect(withValue.xirr).toBeCloseTo(0.1, 4);
    });

    it("getPortfolioXirr combines every holding's cash flows plus total current value", () => {
      const holding = createHolding({ type: "equity", name: "Stock A", units: 100 });
      createCashFlow({
        holdingId: holding.id,
        date: "2021-01-01",
        amount: -1000,
        flowType: "contribution",
      });
      createValuation({ holdingId: holding.id, date: "2021-06-01", pricePerUnit: 11 });

      expect(getPortfolioXirr()).toBeCloseTo(0.1, 4);
    });
  });

  describe("refreshMutualFundNav", () => {
    it("throws for an unknown holding id", async () => {
      await expect(refreshMutualFundNav(999)).rejects.toThrow("Holding not found");
    });

    it("throws for a holding that isn't a domestic mutual fund", async () => {
      const holding = createHolding({ type: "equity", name: "Stock A", units: 10 });
      await expect(refreshMutualFundNav(holding.id)).rejects.toThrow(
        "NAV refresh is only available for domestic mutual funds",
      );
    });

    it("upserts the fetched NAV as that day's valuation instead of duplicating it", async () => {
      const holding = createHolding({
        type: "mutual_fund_domestic",
        name: "Fund A",
        externalCode: "119551",
      });
      const fetchMock = vi.fn(async () =>
        Response.json({ data: [{ date: "26-10-2024", nav: "101.5" }], status: "SUCCESS" }),
      );
      vi.stubGlobal("fetch", fetchMock);
      try {
        await refreshMutualFundNav(holding.id);
        fetchMock.mockImplementationOnce(async () =>
          Response.json({ data: [{ date: "26-10-2024", nav: "102.25" }] }),
        );
        await refreshMutualFundNav(holding.id);
      } finally {
        vi.unstubAllGlobals();
      }

      expect(getValuationsForHolding(holding.id)).toEqual([
        expect.objectContaining({ date: "2024-10-26", pricePerUnit: 102.25 }),
      ]);
    });

    it("throws when the holding has no AMFI scheme code", async () => {
      const holding = createHolding({ type: "mutual_fund_domestic", name: "Fund A", units: 10 });
      await expect(refreshMutualFundNav(holding.id)).rejects.toThrow(
        "This holding has no AMFI scheme code set",
      );
    });
  });
});
