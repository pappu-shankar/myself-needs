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
  refreshMutualFundNav,
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

  describe("getHoldingValue", () => {
    it("unit-priced: 0 with a null asOfDate when there's no valuation yet", () => {
      const holding = createHolding({ type: "equity", name: "Stock A", units: 10 });

      expect(getHoldingValue(holding)).toEqual({
        currentValue: 0,
        basis: "valuation",
        asOfDate: null,
      });
    });

    it("unit-priced: units * latest price on/before asOfDate", () => {
      const holding = createHolding({ type: "equity", name: "Stock A", units: 10 });
      createValuation({ holdingId: holding.id, date: "2026-01-10", pricePerUnit: 50 });
      createValuation({ holdingId: holding.id, date: "2026-02-10", pricePerUnit: 60 });

      expect(getHoldingValue(holding, "2026-01-15")).toEqual({
        currentValue: 500,
        basis: "valuation",
        asOfDate: "2026-01-10",
      });
      expect(getHoldingValue(holding, "2026-02-10")).toEqual({
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

    it("throws when the holding has no AMFI scheme code", async () => {
      const holding = createHolding({ type: "mutual_fund_domestic", name: "Fund A", units: 10 });
      await expect(refreshMutualFundNav(holding.id)).rejects.toThrow(
        "This holding has no AMFI scheme code set",
      );
    });
  });
});
