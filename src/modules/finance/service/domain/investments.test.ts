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
  getPortfolioXirrByCurrency,
  getHoldingsTotalByCurrency,
  getValuationsForHolding,
  recordCashFlow,
  refreshMutualFundNav,
  signedAmountMinor,
  correctCashFlow,
  getCashFlow,
  getCashFlowCorrectionTrail,
  voidCashFlow,
} from "./investments";
import { listCashFlowsForHolding } from "../../db/queries/domain/investments";
import { todayIso } from "@/lib/dates";
import { toPriceScaled, toRateBps, toUnitsScaled } from "../utility/units";
import { createGoal } from "./goals";

beforeEach(setupTestDb);
afterEach(teardownTestDb);

describe("investments service", () => {
  it("creates a holding and fetches it by id, or null when missing", () => {
    const holding = createHolding({
      type: "equity",
      name: "Stock A",
      unitsScaled: toUnitsScaled(10),
    });

    expect(getHolding(holding.id)).toMatchObject({
      name: "Stock A",
      unitsScaled: toUnitsScaled(10),
    });
    expect(getHolding(holding.id + 999)).toBeNull();
  });

  it("creates and lists cash flows for a holding, newest first", () => {
    const holding = createHolding({
      type: "equity",
      name: "Stock A",
      unitsScaled: toUnitsScaled(10),
    });
    createCashFlow({
      holdingId: holding.id,
      date: "2021-01-01",
      amountMinor: -100000,
      flowType: "contribution",
    });
    createCashFlow({
      holdingId: holding.id,
      date: "2021-06-01",
      amountMinor: -50000,
      flowType: "contribution",
    });

    const flows = getCashFlowsForHolding(holding.id);
    expect(flows.map((f) => f.date)).toEqual(["2021-06-01", "2021-01-01"]);
  });

  it("creates and lists valuations for a holding, newest first", () => {
    const holding = createHolding({
      type: "equity",
      name: "Stock A",
      unitsScaled: toUnitsScaled(10),
    });
    createValuation({ holdingId: holding.id, date: "2021-01-01", priceScaled: toPriceScaled(10) });
    createValuation({ holdingId: holding.id, date: "2021-06-01", priceScaled: toPriceScaled(12) });

    const valuations = getValuationsForHolding(holding.id);
    expect(valuations.map((v) => v.priceScaled)).toEqual([toPriceScaled(12), toPriceScaled(10)]);
  });

  it("a second valuation for the same day replaces the price", () => {
    const holding = createHolding({
      type: "equity",
      name: "Stock A",
      unitsScaled: toUnitsScaled(10),
    });
    createValuation({ holdingId: holding.id, date: "2021-01-01", priceScaled: toPriceScaled(10) });
    createValuation({ holdingId: holding.id, date: "2021-01-01", priceScaled: toPriceScaled(11) });

    expect(getValuationsForHolding(holding.id).map((v) => v.priceScaled)).toEqual([
      toPriceScaled(11),
    ]);
  });

  describe("getHoldingValue", () => {
    it("unit-priced: 0 flagged missing price, with a null asOfDate, when there's no valuation yet", () => {
      const holding = createHolding({
        type: "equity",
        name: "Stock A",
        unitsScaled: toUnitsScaled(10),
      });

      expect(getHoldingValue(holding)).toMatchObject({
        currentValueMinor: 0,
        basis: "valuation",
        asOfDate: null,
        unitsScaled: toUnitsScaled(10),
        missing: "price",
      });
    });

    it("unit-priced: units * latest price on/before asOfDate", () => {
      const holding = createHolding({
        type: "equity",
        name: "Stock A",
        unitsScaled: toUnitsScaled(10),
      });
      createValuation({
        holdingId: holding.id,
        date: "2026-01-10",
        priceScaled: toPriceScaled(50),
      });
      createValuation({
        holdingId: holding.id,
        date: "2026-02-10",
        priceScaled: toPriceScaled(60),
      });

      expect(getHoldingValue(holding, "2026-01-15")).toMatchObject({
        currentValueMinor: 50000,
        basis: "valuation",
        asOfDate: "2026-01-10",
        missing: null,
      });
      expect(getHoldingValue(holding, "2026-02-10")).toMatchObject({
        currentValueMinor: 60000,
        basis: "valuation",
        asOfDate: "2026-02-10",
      });
    });

    it("accrual (FD/RD): a single contribution compounds annually to the standard formula", () => {
      // 365.25 days/year * 4 = exactly 1461 days, matching the real calendar span
      // 2020-01-01 -> 2024-01-01 (one leap day per year on average), so years = 4 exactly.
      // 10000 * (1.10)^4 = 14641.
      const holding = createHolding({ type: "fd", name: "Fixed Deposit", rateBps: toRateBps(10) });
      createCashFlow({
        holdingId: holding.id,
        date: "2020-01-01",
        amountMinor: -1000000,
        flowType: "contribution",
      });

      const value = getHoldingValue(holding, "2024-01-01");

      expect(value.basis).toBe("accrual");
      expect(value.currentValueMinor).toBe(1464100);
    });

    it("accrual: same-day valuation returns the un-compounded principal minus any payout", () => {
      const holding = createHolding({ type: "fd", name: "Fixed Deposit", rateBps: toRateBps(10) });
      createCashFlow({
        holdingId: holding.id,
        date: "2021-06-01",
        amountMinor: -1000000,
        flowType: "contribution",
      });

      expect(getHoldingValue(holding, "2021-06-01").currentValueMinor).toBe(1000000);

      createCashFlow({
        holdingId: holding.id,
        date: "2021-06-01",
        amountMinor: 1200000,
        flowType: "maturity",
      });
      // A payout larger than the (uncompounded) principal floors at 0, never negative.
      expect(getHoldingValue(holding, "2021-06-01").currentValueMinor).toBe(0);
    });

    it("net_invested: total contributed minus total received, filtered by asOfDate", () => {
      const holding = createHolding({ type: "chit_fund", name: "Chit" });
      createCashFlow({
        holdingId: holding.id,
        date: "2021-01-01",
        amountMinor: -500000,
        flowType: "contribution",
      });
      createCashFlow({
        holdingId: holding.id,
        date: "2021-06-01",
        amountMinor: -300000,
        flowType: "contribution",
      });
      createCashFlow({
        holdingId: holding.id,
        date: "2021-08-01",
        amountMinor: 200000,
        flowType: "dividend",
      });

      expect(getHoldingValue(holding, "2021-05-01").currentValueMinor).toBe(500000);
      expect(getHoldingValue(holding, "2021-12-31").currentValueMinor).toBe(600000);
    });
  });

  describe("units over time (unit-priced)", () => {
    it("sums units from buys and sells up to the valuation date", () => {
      const fund = createHolding({ type: "mutual_fund_domestic", name: "Fund" });
      recordCashFlow({
        holdingId: fund.id,
        date: "2025-01-01",
        flowType: "contribution",
        amountMinor: 100000,
        unitsScaled: toUnitsScaled(100),
      });
      recordCashFlow({
        holdingId: fund.id,
        date: "2025-06-01",
        flowType: "contribution",
        amountMinor: 60000,
        unitsScaled: toUnitsScaled(50),
      });
      recordCashFlow({
        holdingId: fund.id,
        date: "2025-09-01",
        flowType: "redemption",
        amountMinor: 48000,
        unitsScaled: toUnitsScaled(40),
      });
      createValuation({ holdingId: fund.id, date: "2025-01-01", priceScaled: toPriceScaled(10) });
      createValuation({ holdingId: fund.id, date: "2025-08-01", priceScaled: toPriceScaled(12) });

      expect(getHoldingValue(fund, "2025-03-01")).toMatchObject({
        unitsScaled: toUnitsScaled(100),
        currentValueMinor: 100000,
      });
      expect(getHoldingValue(fund, "2025-08-15")).toMatchObject({
        unitsScaled: toUnitsScaled(150),
        currentValueMinor: 180000,
      });
      expect(getHoldingValue(fund, "2025-12-31")).toMatchObject({
        unitsScaled: toUnitsScaled(110),
        currentValueMinor: 132000,
      });
    });

    it("adds per-flow units on top of a legacy holding-level units balance", () => {
      const stock = createHolding({
        type: "equity",
        name: "Legacy",
        unitsScaled: toUnitsScaled(10),
      });
      createCashFlow({
        holdingId: stock.id,
        date: "2024-01-01",
        amountMinor: -100000,
        flowType: "contribution",
      });
      recordCashFlow({
        holdingId: stock.id,
        date: "2025-01-01",
        flowType: "contribution",
        amountMinor: 50000,
        unitsScaled: toUnitsScaled(5),
      });
      createValuation({ holdingId: stock.id, date: "2025-02-01", priceScaled: toPriceScaled(100) });

      expect(getHoldingValue(stock, "2025-02-01")).toMatchObject({
        unitsScaled: toUnitsScaled(15),
        currentValueMinor: 150000,
      });
    });

    it("never assumes 1 unit: no units anywhere means value unknown ('Add units')", () => {
      const stock = createHolding({ type: "equity", name: "No units" });
      createCashFlow({
        holdingId: stock.id,
        date: "2024-01-01",
        amountMinor: -100000,
        flowType: "contribution",
      });
      createValuation({ holdingId: stock.id, date: "2024-06-01", priceScaled: toPriceScaled(250) });

      expect(getHoldingValue(stock, "2024-06-01")).toMatchObject({
        currentValueMinor: 0,
        unitsScaled: null,
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
        amountMinor: 100000,
        unitsScaled: toUnitsScaled(10),
      });
      recordCashFlow({
        holdingId: stock.id,
        date: "2024-06-01",
        flowType: "redemption",
        amountMinor: 120000,
        unitsScaled: toUnitsScaled(10),
      });
      createValuation({ holdingId: stock.id, date: "2024-06-01", priceScaled: toPriceScaled(120) });

      expect(getHoldingValue(stock, "2024-07-01")).toMatchObject({
        currentValueMinor: 0,
        closed: true,
      });
    });
  });

  describe("recordCashFlow (sign derived from flow type)", () => {
    it("stores contributions negative and every money-received type positive", () => {
      expect(signedAmountMinor("contribution", 50000)).toBe(-50000);
      for (const t of ["redemption", "dividend", "interest", "maturity"] as const) {
        expect(signedAmountMinor(t, 50000)).toBe(50000);
      }
      // A stray minus from the user never flips the meaning.
      expect(signedAmountMinor("contribution", -50000)).toBe(-50000);
      expect(signedAmountMinor("redemption", -50000)).toBe(50000);
    });

    it("stores signed amount and signed units from positive input", () => {
      const fund = createHolding({ type: "mutual_fund_domestic", name: "Fund" });
      recordCashFlow({
        holdingId: fund.id,
        date: "2025-01-01",
        flowType: "contribution",
        amountMinor: 100000,
        unitsScaled: toUnitsScaled(100),
      });
      recordCashFlow({
        holdingId: fund.id,
        date: "2025-02-01",
        flowType: "redemption",
        amountMinor: 30000,
        unitsScaled: toUnitsScaled(25),
      });

      const flows = getCashFlowsForHolding(fund.id);
      expect(flows.map((f) => [f.flowType, f.amountMinor, f.unitsScaled])).toEqual([
        ["redemption", 30000, toUnitsScaled(-25)],
        ["contribution", -100000, toUnitsScaled(100)],
      ]);
    });

    it("requires units for buys/sells of unit-priced holdings", () => {
      const fund = createHolding({ type: "mutual_fund_domestic", name: "Fund" });
      expect(() =>
        recordCashFlow({
          holdingId: fund.id,
          date: "2025-01-01",
          flowType: "contribution",
          amountMinor: 100000,
        }),
      ).toThrow("Enter how many units this bought");
      // Dividends don't change units, so none needed.
      expect(() =>
        recordCashFlow({
          holdingId: fund.id,
          date: "2025-01-01",
          flowType: "dividend",
          amountMinor: 5000,
        }),
      ).not.toThrow();
    });

    it("rejects selling more units than held on that date", () => {
      const fund = createHolding({ type: "mutual_fund_domestic", name: "Fund" });
      recordCashFlow({
        holdingId: fund.id,
        date: "2025-01-01",
        flowType: "contribution",
        amountMinor: 100000,
        unitsScaled: toUnitsScaled(10),
      });
      expect(() =>
        recordCashFlow({
          holdingId: fund.id,
          date: "2025-02-01",
          flowType: "redemption",
          amountMinor: 200000,
          unitsScaled: toUnitsScaled(11),
        }),
      ).toThrow("Only 10 units were held on 2025-02-01");
    });

    it("rejects a non-positive amount and an unknown holding", () => {
      const fd = createHolding({ type: "fd", name: "FD", rateBps: toRateBps(7) });
      expect(() =>
        recordCashFlow({
          holdingId: fd.id,
          date: "2025-01-01",
          flowType: "contribution",
          amountMinor: 0,
        }),
      ).toThrow("Amount must be more than zero");
      expect(() =>
        recordCashFlow({
          holdingId: fd.id + 99,
          date: "2025-01-01",
          flowType: "contribution",
          amountMinor: 100,
        }),
      ).toThrow("Holding not found");
    });

    it("ignores units for holdings that aren't unit-priced", () => {
      const fd = createHolding({ type: "fd", name: "FD", rateBps: toRateBps(7) });
      const flow = recordCashFlow({
        holdingId: fd.id,
        date: "2025-01-01",
        flowType: "contribution",
        amountMinor: 100000,
        unitsScaled: toUnitsScaled(3),
      });
      expect(flow).toMatchObject({ amountMinor: -100000, unitsScaled: null });
    });
  });

  describe("FD/RD maturity", () => {
    // 2020-01-01 -> 2022-01-01 is 731 days = 2 whole years + a 0.5-day stub.
    // Whole years compound: 1,000,000 -> 1,210,000 paise. The stub is simple
    // pro-rata: 1,210,000 * 10% * 0.5/365.25 = 165.6 -> 166 paise.
    const maturityValueMinor = 1210166;

    function makeFd() {
      const fd = createHolding({
        type: "fd",
        name: "FD",
        rateBps: toRateBps(10),
        maturityDate: "2022-01-01",
      });
      recordCashFlow({
        holdingId: fd.id,
        date: "2020-01-01",
        flowType: "contribution",
        amountMinor: 1000000,
      });
      return fd;
    }

    it("stops accruing at maturity and flags the missing payout", () => {
      const fd = makeFd();
      const before = getHoldingValue(fd, "2021-01-01");
      expect(before.maturedOn).toBeNull();

      const after = getHoldingValue(fd, "2026-01-01");
      expect(after.currentValueMinor).toBe(maturityValueMinor);
      expect(after).toMatchObject({
        maturedOn: "2022-01-01",
        asOfDate: "2022-01-01",
        closed: false,
      });
    });

    it("is closed at 0 once the maturity payout is recorded", () => {
      const fd = makeFd();
      recordCashFlow({
        holdingId: fd.id,
        date: "2022-01-01",
        flowType: "maturity",
        amountMinor: 1210000,
      });

      expect(getHoldingValue(fd, "2026-01-01")).toMatchObject({
        currentValueMinor: 0,
        closed: true,
        maturedOn: null,
      });
      // Net-worth history before the payout still shows the accrued value.
      expect(getHoldingValue(fd, "2021-12-31").currentValueMinor).toBeGreaterThan(10000);
    });

    it("a redemption after maturity also closes it", () => {
      const fd = makeFd();
      recordCashFlow({
        holdingId: fd.id,
        date: "2022-01-05",
        flowType: "redemption",
        amountMinor: 1210000,
      });
      expect(getHoldingValue(fd, "2023-01-01")).toMatchObject({
        currentValueMinor: 0,
        closed: true,
      });
    });
  });

  describe("government schemes", () => {
    it("credited interest raises the balance; paid-out interest (dividend) and withdrawals don't inflate it", () => {
      const ppf = createHolding({ type: "govt_scheme", name: "PPF" });
      recordCashFlow({
        holdingId: ppf.id,
        date: "2024-04-01",
        flowType: "contribution",
        amountMinor: 15000000,
      });
      recordCashFlow({
        holdingId: ppf.id,
        date: "2025-03-31",
        flowType: "interest",
        amountMinor: 1065000,
      });
      expect(getHoldingValue(ppf, "2025-04-01")).toMatchObject({
        currentValueMinor: 16065000,
        basis: "balance",
      });

      recordCashFlow({
        holdingId: ppf.id,
        date: "2025-06-01",
        flowType: "redemption",
        amountMinor: 5000000,
      });
      recordCashFlow({
        holdingId: ppf.id,
        date: "2025-07-01",
        flowType: "dividend",
        amountMinor: 100000,
      });
      expect(getHoldingValue(ppf, "2025-12-31").currentValueMinor).toBe(11065000);
    });
  });

  it("getHoldingsTotalByCurrency sums every holding's value as of a given date", () => {
    const fd = createHolding({ type: "fd", name: "Fixed Deposit", rateBps: toRateBps(10) });
    createCashFlow({
      holdingId: fd.id,
      date: "2021-06-01",
      amountMinor: -1000000,
      flowType: "contribution",
    });
    const chit = createHolding({ type: "chit_fund", name: "Chit" });
    createCashFlow({
      holdingId: chit.id,
      date: "2021-01-01",
      amountMinor: -200000,
      flowType: "contribution",
    });

    expect(getHoldingsTotalByCurrency("2021-06-01").byCurrency.get("INR")).toBe(1000000 + 200000);
  });

  it("getHoldingsByGoalId returns only holdings linked to that goal", () => {
    // `linked_goal_id` is a real foreign key now (decision 40), so the goals
    // have to exist — an arbitrary id no longer inserts.
    const target = createGoal({ name: "House", targetAmountMinor: 100_000_000 });
    const other = createGoal({ name: "Car", targetAmountMinor: 50_000_000 });

    const linked = createHolding({
      type: "equity",
      name: "Linked",
      unitsScaled: toUnitsScaled(1),
      linkedGoalId: target.id,
    });
    createHolding({ type: "equity", name: "Unlinked", unitsScaled: toUnitsScaled(1) });
    createHolding({
      type: "equity",
      name: "Other goal",
      unitsScaled: toUnitsScaled(1),
      linkedGoalId: other.id,
    });

    const holdings = getHoldingsByGoalId(target.id);
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
      const holding = createHolding({
        type: "equity",
        name: "Stock A",
        unitsScaled: toUnitsScaled(100),
      });
      createCashFlow({
        holdingId: holding.id,
        date: "2021-01-01",
        amountMinor: -100000,
        flowType: "contribution",
      });
      createValuation({
        holdingId: holding.id,
        date: "2021-06-01",
        priceScaled: toPriceScaled(11),
      });

      const [withValue] = getHoldingsWithValue();

      expect(withValue.currentValueMinor).toBe(110000);
      // -1000 on 2021-01-01, +1100 "as of today" (2022-01-01) is exactly 365 days -> 10% XIRR.
      expect(withValue.xirr).toBeCloseTo(0.1, 4);
    });

    it("XIRR is null (shown as —), not -100%, when a holding has no valuation", () => {
      const holding = createHolding({
        type: "equity",
        name: "Unpriced",
        unitsScaled: toUnitsScaled(10),
      });
      createCashFlow({
        holdingId: holding.id,
        date: "2021-01-01",
        amountMinor: -100000,
        flowType: "contribution",
      });

      const [withValue] = getHoldingsWithValue();
      expect(withValue.missing).toBe("price");
      expect(withValue.xirr).toBeNull();
      expect(getPortfolioXirrByCurrency().get("INR") ?? null).toBeNull();
    });

    it("govt-scheme credited interest isn't double-counted in XIRR", () => {
      const ppf = createHolding({ type: "govt_scheme", name: "PPF" });
      recordCashFlow({
        holdingId: ppf.id,
        date: "2021-01-01",
        flowType: "contribution",
        amountMinor: 100000,
      });
      recordCashFlow({
        holdingId: ppf.id,
        date: "2021-12-31",
        flowType: "interest",
        amountMinor: 10000,
      });

      const [withValue] = getHoldingsWithValue();
      expect(withValue.currentValueMinor).toBe(110000);
      // -1000 on 2021-01-01, +1100 balance on 2022-01-01 -> 10%.
      expect(withValue.xirr).toBeCloseTo(0.1, 4);
    });

    it("getPortfolioXirrByCurrency combines every holding's cash flows plus total current value", () => {
      const holding = createHolding({
        type: "equity",
        name: "Stock A",
        unitsScaled: toUnitsScaled(100),
      });
      createCashFlow({
        holdingId: holding.id,
        date: "2021-01-01",
        amountMinor: -100000,
        flowType: "contribution",
      });
      createValuation({
        holdingId: holding.id,
        date: "2021-06-01",
        priceScaled: toPriceScaled(11),
      });

      expect(getPortfolioXirrByCurrency().get("INR")).toBeCloseTo(0.1, 4);
    });
  });

  describe("refreshMutualFundNav", () => {
    it("throws for an unknown holding id", async () => {
      await expect(refreshMutualFundNav(999)).rejects.toThrow("Holding not found");
    });

    it("throws for a holding that isn't a domestic mutual fund", async () => {
      const holding = createHolding({
        type: "equity",
        name: "Stock A",
        unitsScaled: toUnitsScaled(10),
      });
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
        expect.objectContaining({ date: "2024-10-26", priceScaled: toPriceScaled(102.25) }),
      ]);
    });

    it("throws when the holding has no AMFI scheme code", async () => {
      const holding = createHolding({
        type: "mutual_fund_domestic",
        name: "Fund A",
        unitsScaled: toUnitsScaled(10),
      });
      await expect(refreshMutualFundNav(holding.id)).rejects.toThrow(
        "This holding has no AMFI scheme code set",
      );
    });
  });
});

describe("cash flow void and correct", () => {
  /** A unit-priced holding, one contribution, one price — enough for an XIRR. */
  function seedFund(name: string, contributionMinor: number) {
    const holding = createHolding({ type: "equity", name, unitsScaled: null });
    recordCashFlow({
      holdingId: holding.id,
      date: "2026-01-01",
      flowType: "contribution",
      amountMinor: contributionMinor,
      unitsScaled: toUnitsScaled(100),
    });
    createValuation({
      holdingId: holding.id,
      date: "2026-06-01",
      priceScaled: toPriceScaled(1500),
      priceCurrency: "INR",
      source: "user",
      method: "manual",
      confidence: "reported",
      asOf: "2026-06-01",
    });
    return holding;
  }

  it("voids a flow, keeps it readable with its reason, and drops it from the ledger", () => {
    const holding = seedFund("Fund A", 100000);
    const [flow] = getCashFlowsForHolding(holding.id);

    const voided = voidCashFlow(flow.id, "  Logged against the wrong fund  ");
    expect(voided.voidedAt).toBe(todayIso());
    expect(voided.voidReason).toBe("Logged against the wrong fund");
    expect(voided.supersededById).toBeNull();

    expect(getCashFlowsForHolding(holding.id)).toEqual([]);
    const trail = listCashFlowsForHolding(holding.id, undefined, { includeVoided: true });
    expect(trail).toHaveLength(1);
    expect(trail[0]).toMatchObject({ id: flow.id, voidReason: "Logged against the wrong fund" });
    // No units left, so the holding reports unknown rather than a stale value.
    expect(getHoldingValue(holding).missing).toBe("units");
  });

  it("refuses a void with no reason, a missing flow, and a second void", () => {
    const holding = seedFund("Fund A", 100000);
    const [flow] = getCashFlowsForHolding(holding.id);

    expect(() => voidCashFlow(flow.id, "  ")).toThrow("Say why");
    expect(() => voidCashFlow(flow.id + 999, "gone")).toThrow("no longer exists");

    voidCashFlow(flow.id, "Duplicate");
    expect(() => voidCashFlow(flow.id, "Duplicate again")).toThrow("already been reversed");
    expect(getCashFlow(flow.id)?.voidReason).toBe("Duplicate");
  });

  it("reports the same XIRR after a correction as if the right amount had been entered first", () => {
    const corrected = seedFund("A Mistyped", 1000000); // 10,000 typed instead of 1,000
    seedFund("B Clean", 100000);
    const [wrongFlow] = getCashFlowsForHolding(corrected.id);

    const result = correctCashFlow(
      wrongFlow.id,
      {
        holdingId: corrected.id,
        date: "2026-01-01",
        flowType: "contribution",
        amountMinor: 100000,
        unitsScaled: toUnitsScaled(100),
      },
      "Amount typed with an extra zero",
    );

    // This is the whole reason void-and-replace is worth the extra rows: the
    // void and its replacement net out, so the reported return is the return
    // of the corrected history, not an average of the two entries.
    const byName = new Map(getHoldingsWithValue().map((h) => [h.name, h]));
    expect(byName.get("A Mistyped")!.xirr).toBe(byName.get("B Clean")!.xirr);
    expect(byName.get("A Mistyped")!.xirr).not.toBeNull();
    expect(byName.get("A Mistyped")!.currentValueMinor).toBe(
      byName.get("B Clean")!.currentValueMinor,
    );
    // Same for the portfolio rate: it is one solve over every live flow, so a
    // voided flow left in would move it too.
    expect(getPortfolioXirrByCurrency().get("INR")).toBe(byName.get("B Clean")!.xirr);

    // Signs still come from the flow type on the replacement, not from input.
    expect(result.replacement.amountMinor).toBe(-100000);
    expect(result.voided.supersededById).toBe(result.replacement.id);
    const trail = getCashFlowCorrectionTrail(wrongFlow.id);
    expect(trail?.row.voidReason).toBe("Amount typed with an extra zero");
    expect(trail?.replacement?.id).toBe(result.replacement.id);
    expect(getCashFlowCorrectionTrail(result.replacement.id)?.replacement).toBeNull();
  });

  it("lets a correction re-use the units the voided flow had claimed", () => {
    const holding = seedFund("Fund A", 100000);
    recordCashFlow({
      holdingId: holding.id,
      date: "2026-03-01",
      flowType: "redemption",
      amountMinor: 160000,
      unitsScaled: toUnitsScaled(100),
    });
    const [redemption] = getCashFlowsForHolding(holding.id);
    expect(redemption.flowType).toBe("redemption");

    // Nothing is held any more, so a fresh sell of the same units is refused.
    expect(() =>
      recordCashFlow({
        holdingId: holding.id,
        date: "2026-03-01",
        flowType: "redemption",
        amountMinor: 160000,
        unitsScaled: toUnitsScaled(100),
      }),
    ).toThrow("units were held");

    // Correcting it is not: the void lands first inside the same DB
    // transaction, so the units check sees the corrected world. A check run
    // before the void would reject every sell correction outright.
    const { replacement } = correctCashFlow(
      redemption.id,
      {
        holdingId: holding.id,
        date: "2026-03-01",
        flowType: "redemption",
        amountMinor: 150000,
        unitsScaled: toUnitsScaled(100),
      },
      "Proceeds were 1,500",
    );
    expect(replacement.amountMinor).toBe(150000);
    expect(getCashFlowsForHolding(holding.id)).toHaveLength(2);
  });

  it("rolls the void back when the replacement is refused", () => {
    const holding = seedFund("Fund A", 100000);
    const [flow] = getCashFlowsForHolding(holding.id);

    // An equity buy without units is refused for a correction exactly as for a
    // fresh entry — a correction is not a side door past the rules.
    expect(() =>
      correctCashFlow(
        flow.id,
        {
          holdingId: holding.id,
          date: "2026-01-01",
          flowType: "contribution",
          amountMinor: 90000,
        },
        "Wrong amount",
      ),
    ).toThrow("how many units");

    // A voided flow with no replacement would be a reversal nobody asked for.
    expect(getCashFlow(flow.id)?.voidedAt).toBeNull();
    expect(getCashFlowsForHolding(holding.id)).toHaveLength(1);
  });

  it("refuses to fork the chain or correct an already-voided flow", () => {
    const holding = seedFund("Fund A", 100000);
    const [flow] = getCashFlowsForHolding(holding.id);
    const replacementInput = {
      holdingId: holding.id,
      date: "2026-01-01",
      flowType: "contribution" as const,
      amountMinor: 90000,
      unitsScaled: toUnitsScaled(100),
    };

    expect(() => correctCashFlow(flow.id, replacementInput, " ")).toThrow("Say why");
    expect(() => correctCashFlow(flow.id + 999, replacementInput, "gone")).toThrow(
      "no longer exists",
    );

    const { replacement } = correctCashFlow(flow.id, replacementInput, "Wrong amount");
    expect(() => correctCashFlow(flow.id, replacementInput, "again")).toThrow(
      "already been corrected",
    );

    voidCashFlow(replacement.id, "Never happened");
    expect(() => correctCashFlow(replacement.id, replacementInput, "too late")).toThrow(
      "nothing to correct",
    );
  });
});
