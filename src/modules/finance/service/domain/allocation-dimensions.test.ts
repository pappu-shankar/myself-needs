import { beforeEach, afterEach, describe, expect, it } from "vitest";
import { setupTestDb, teardownTestDb } from "@/test/db";
import {
  getAllocationByDimension,
  getAllocationCrossTab,
  UNCLASSIFIED,
} from "./allocation-dimensions";
import { createAccount } from "./accounts";
import { createHolding, createValuation } from "./investments";
import { toPriceScaled, toUnitsScaled } from "../utility/units";

beforeEach(setupTestDb);
afterEach(teardownTestDb);

const AS_OF = "2026-03-15";

/** A holding worth exactly `rupees`, via one unit priced at that figure. */
function holdingWorth(rupees: number, overrides: Parameters<typeof createHolding>[0]) {
  const holding = createHolding({ ...overrides, unitsScaled: toUnitsScaled(1) });
  createValuation({
    holdingId: holding.id,
    date: "2026-01-01",
    priceScaled: toPriceScaled(rupees),
    priceCurrency: overrides.currency ?? "INR",
  });
  return holding;
}

describe("allocation by dimension", () => {
  it("does NOT fold a debt fund into equity — the bug the fund category exists to fix", () => {
    // ₹1,00,000 in a gilt fund and ₹1,00,000 in shares. The replaced mapping
    // classified by holding type alone, so both counted as equity and the
    // equity weight read 100% instead of 50% — overstated by exactly the
    // debt-fund balance, in the one figure used to judge over-exposure.
    holdingWorth(100_000, {
      type: "mutual_fund_domestic",
      name: "Gilt Fund",
      currency: "INR",
      fundCategory: "debt",
    });
    holdingWorth(100_000, { type: "equity", name: "Acme", currency: "INR" });

    const byBucket = new Map(
      getAllocationByDimension("total", AS_OF).dimensions.asset_class.slices.map((s) => [
        s.bucket,
        s.value.baseMinor,
      ]),
    );

    expect(byBucket.get("equity")).toBe(10_000_000);
    expect(byBucket.get("debt")).toBe(10_000_000);
  });

  it("shows an uncategorised fund as unclassified rather than defaulting it to equity", () => {
    // A wrong classification is worse than a missing one, because only the
    // missing one prompts anybody to fix it.
    holdingWorth(100_000, {
      type: "mutual_fund_domestic",
      name: "Unknown Fund",
      currency: "INR",
    });

    const view = getAllocationByDimension("total", AS_OF).dimensions.asset_class;

    expect(view.slices.map((s) => s.bucket)).toEqual([UNCLASSIFIED]);
    expect(view.unclassifiedShare).toBe(1);
    expect(view.slices[0].value.baseMinor).toBe(10_000_000);
    // And it is not silently dropped from the total either.
    expect(view.total.baseMinor).toBe(10_000_000);
  });

  it("keeps unknown geography as its own slice, not folded into home", () => {
    holdingWorth(100_000, {
      type: "equity",
      name: "Tagged",
      currency: "INR",
      country: "IN",
    });
    holdingWorth(100_000, { type: "equity", name: "Untagged", currency: "INR" });

    const slices = getAllocationByDimension("total", AS_OF).dimensions.geography.slices;
    const byBucket = new Map(slices.map((s) => [s.bucket, s.value.baseMinor]));

    expect(byBucket.get("IN")).toBe(10_000_000);
    expect(byBucket.get(UNCLASSIFIED)).toBe(10_000_000);
  });

  it("sorts the unclassified bucket last however large it is", () => {
    // It is a gap in the data, not a position. Reading it as the top holding
    // would be a category error.
    holdingWorth(1_000_000, {
      type: "mutual_fund_domestic",
      name: "Big untagged",
      currency: "INR",
    });
    holdingWorth(1_000, { type: "equity", name: "Small tagged", currency: "INR" });

    const slices = getAllocationByDimension("total", AS_OF).dimensions.asset_class.slices;

    expect(slices[0].bucket).toBe("equity");
    expect(slices.at(-1)!.bucket).toBe(UNCLASSIFIED);
  });

  it("every dimension sums to the same total", () => {
    // Each dimension is a one-way grouping of one figure, so this is the
    // property that makes two dimensions comparable at all.
    createAccount({
      name: "Bank",
      type: "savings",
      currency: "INR",
      openingBalanceMinor: 500_000,
    });
    holdingWorth(100_000, {
      type: "equity",
      name: "Acme",
      currency: "INR",
      sector: "IT",
      marketCapBand: "large",
      country: "IN",
    });
    holdingWorth(50_000, { type: "gold", name: "Coins", currency: "INR" });

    const view = getAllocationByDimension("total", AS_OF);
    const totals = Object.values(view.dimensions).map((d) =>
      d.slices.reduce((s, slice) => s + slice.value.baseMinor, 0),
    );

    expect(new Set(totals).size).toBe(1);
    expect(totals[0]).toBe(view.dimensions.asset_class.total.baseMinor);
  });

  it("reports currency exposure before conversion", () => {
    // A rupee view of dollar assets hides the exposure; this dimension is the
    // one whose buckets are never a guess.
    createAccount({
      name: "Dollars",
      type: "savings",
      currency: "USD",
      openingBalanceMinor: 100_000,
    });
    createAccount({
      name: "Rupees",
      type: "savings",
      currency: "INR",
      openingBalanceMinor: 100_000,
    });

    const slices = getAllocationByDimension("total", AS_OF).dimensions.currency.slices;
    const usd = slices.find((s) => s.bucket === "USD")!;

    // The USD slice still reports its own unconverted figure, whatever the
    // base currency is.
    expect(usd.value.byCurrency[0].minor).toBe(100_000);
    expect(usd.value.byCurrency[0].currency).toBe("USD");
  });

  it("withholds shares when the total could not be fully converted", () => {
    // A share of an unknown whole is not a share. No FX rates are stored here,
    // so the dollar account cannot be converted.
    createAccount({
      name: "Dollars",
      type: "savings",
      currency: "USD",
      openingBalanceMinor: 100_000,
    });

    const view = getAllocationByDimension("total", AS_OF).dimensions.asset_class;

    expect(view.total.complete).toBe(false);
    expect(view.slices.every((s) => s.share === null)).toBe(true);
    expect(view.unclassifiedShare).toBeNull();
  });

  it("gives a bond no sector rather than inventing one", () => {
    holdingWorth(100_000, { type: "bond", name: "GoI 2030", currency: "INR" });

    const slices = getAllocationByDimension("total", AS_OF).dimensions.sector.slices;

    expect(slices.map((s) => s.bucket)).toEqual([UNCLASSIFIED]);
  });

  it("cross-tabs two dimensions without either deriving from the other", () => {
    holdingWorth(100_000, {
      type: "equity",
      name: "Indian IT",
      currency: "INR",
      country: "IN",
      sector: "IT",
    });
    holdingWorth(200_000, {
      type: "intl_equity",
      name: "US tech",
      currency: "INR",
      country: "US",
      sector: "IT",
    });

    const { cells, total } = getAllocationCrossTab("asset_class", "geography", "total", AS_OF);

    expect(total.baseMinor).toBe(30_000_000);
    const cell = (row: string, col: string) =>
      cells.find((c) => c.rowBucket === row && c.columnBucket === col)?.value.baseMinor;
    expect(cell("equity", "IN")).toBe(10_000_000);
    expect(cell("equity", "US")).toBe(20_000_000);
    // And the cells add back to the same total every dimension reports.
    expect(cells.reduce((s, c) => s + c.value.baseMinor, 0)).toBe(total.baseMinor);
  });
});
