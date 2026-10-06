import { beforeEach, afterEach, describe, expect, it } from "vitest";
import { setupTestDb, teardownTestDb } from "@/test/db";
import { DomainError } from "@/modules/core/errors";
import {
  addTaxSlab,
  editTaxSlab,
  getTaxPolicyView,
  getTaxSettingsForYear,
  getTaxSlabsForYear,
  listTaxPolicyYears,
  removeTaxSlab,
  resolvePolicyYear,
  setTaxSettings,
  startFiscalYear,
  validateSlabSchedule,
} from "./tax";

beforeEach(setupTestDb);
afterEach(teardownTestDb);

describe("per-FY tax settings", () => {
  it("seeds FY 2024-25 defaults on a brand-new vault, then persists a patch to that FY", () => {
    expect(listTaxPolicyYears()).toEqual(["2024-25"]);
    // Statutory INR paise: ₹1,50,000 and ₹25,000.
    expect(getTaxSettingsForYear("2024-25")).toMatchObject({
      fiscalYear: "2024-25",
      eightyCLimitMinor: 15_000_000,
      eightyDLimitMinor: 2_500_000,
    });

    const updated = setTaxSettings("2024-25", { eightyCLimitMinor: 20_000_000 });

    expect(updated.eightyCLimitMinor).toBe(20_000_000);
    expect(getTaxSettingsForYear("2024-25").eightyCLimitMinor).toBe(20_000_000);
  });

  it("a FY without its own row uses the closest earlier FY's (or the earliest, if it predates all)", () => {
    expect(resolvePolicyYear("2026-27", ["2024-25", "2025-26"])).toBe("2025-26");
    expect(resolvePolicyYear("2025-26", ["2024-25", "2026-27"])).toBe("2024-25");
    expect(resolvePolicyYear("2020-21", ["2024-25"])).toBe("2024-25");
    expect(resolvePolicyYear("2020-21", [])).toBeUndefined();

    expect(getTaxSettingsForYear("2026-27").fiscalYear).toBe("2024-25");
    expect(getTaxPolicyView("2026-27").hasOwnSettings).toBe(false);
  });

  it("refuses to edit an FY that hasn't been started", () => {
    expect(() => setTaxSettings("2026-27", { eightyCLimitMinor: 1 })).toThrow(DomainError);
  });
});

describe("startFiscalYear", () => {
  it("copies the most recent FY's settings and slabs without touching the source", () => {
    setTaxSettings("2024-25", { eightyCLimitMinor: 17_500_000 });

    startFiscalYear("2025-26");

    const view = getTaxPolicyView("2025-26");
    expect(view.hasOwnSettings).toBe(true);
    expect(view.settings.eightyCLimitMinor).toBe(17_500_000);
    expect(view.oldSlabs.every((s) => s.fiscalYear === "2025-26")).toBe(true);
    expect(view.oldSlabs.map((s) => [s.uptoAmountMinor, s.rateBps])).toEqual(
      getTaxSlabsForYear("2024-25", "old").map((s) => [s.uptoAmountMinor, s.rateBps]),
    );

    setTaxSettings("2025-26", { eightyCLimitMinor: 1 });
    expect(getTaxSettingsForYear("2024-25").eightyCLimitMinor).toBe(17_500_000);
    // Later years now inherit from 2025-26, the closest earlier FY.
    expect(getTaxSettingsForYear("2027-28").fiscalYear).toBe("2025-26");
  });

  it("rejects a duplicate or malformed FY", () => {
    expect(() => startFiscalYear("2024-25")).toThrow(/already exists/);
    expect(() => startFiscalYear("2025-27")).toThrow(DomainError);
  });
});

describe("slab CRUD", () => {
  it("seeds default slabs ascending by uptoAmountMinor, with the uncapped top bracket last", () => {
    const oldSlabs = getTaxSlabsForYear("2024-25", "old");

    // ₹2.5 L / ₹5 L / ₹10 L in paise; rates as basis points.
    expect(oldSlabs.map((s) => s.uptoAmountMinor)).toEqual([
      25_000_000,
      50_000_000,
      100_000_000,
      null,
    ]);
    expect(oldSlabs.map((s) => s.rateBps)).toEqual([0, 500, 2000, 3000]);
  });

  it("adds, edits and deletes a bracket within one FY + regime", () => {
    const added = addTaxSlab("2024-25", "old", 200_000_000, 3000);
    expect(added).toMatchObject({
      fiscalYear: "2024-25",
      regime: "old",
      uptoAmountMinor: 200_000_000,
    });

    const edited = editTaxSlab(added.id, 150_000_000, 2500);
    expect(edited).toMatchObject({ uptoAmountMinor: 150_000_000, rateBps: 2500 });

    removeTaxSlab(added.id);
    expect(getTaxSlabsForYear("2024-25", "old").map((s) => s.uptoAmountMinor)).toEqual([
      25_000_000,
      50_000_000,
      100_000_000,
      null,
    ]);
  });

  it("edits in one FY never change another FY's slabs", () => {
    startFiscalYear("2025-26");
    const top = getTaxSlabsForYear("2025-26", "new").at(-1)!;
    editTaxSlab(top.id, null, 3500);
    expect(getTaxSlabsForYear("2024-25", "new").at(-1)!.rateBps).toBe(3000);
  });

  it("rejects a schedule that isn't a single ascending progression with one open-ended top", () => {
    expect(() => addTaxSlab("2024-25", "old", null, 4000)).toThrow(/only have one open-ended/);
    expect(() => addTaxSlab("2024-25", "old", 50_000_000, 1000)).toThrow(/strictly ascending/);
    expect(() => addTaxSlab("2024-25", "old", 60_000_000, 10_001)).toThrow(/between 0 and 100/);

    const top = getTaxSlabsForYear("2024-25", "old").at(-1)!;
    expect(() => editTaxSlab(top.id, 300_000_000, 3000)).toThrow(
      /needs one open-ended top bracket/,
    );
    expect(() => removeTaxSlab(top.id)).toThrow(/needs one open-ended top bracket/);

    expect(() =>
      validateSlabSchedule("2024-25", "old", [{ uptoAmountMinor: null, rateBps: -1 }]),
    ).toThrow(DomainError);
    expect(() => validateSlabSchedule("2024-25", "old", [])).toThrow(/at least one bracket/);
  });

  it("rejects fractional paise limits and fractional basis points", () => {
    expect(() =>
      validateSlabSchedule("2024-25", "old", [{ uptoAmountMinor: null, rateBps: 512.5 }]),
    ).toThrow(/between 0 and 100/);
    expect(() =>
      validateSlabSchedule("2024-25", "old", [
        { uptoAmountMinor: 25_000_000.5, rateBps: 0 },
        { uptoAmountMinor: null, rateBps: 3000 },
      ]),
    ).toThrow(/more than zero/);
  });

  it("names the colliding bracket as money, in statutory rupees", () => {
    expect(() => addTaxSlab("2024-25", "old", 50_000_000, 1000)).toThrow(/₹5,00,000/);
  });

  it("refuses slab changes for an FY that hasn't been started, and for a missing slab", () => {
    expect(() => addTaxSlab("2026-27", "old", 10_000, 100)).toThrow(/hasn't been started/);
    expect(() => editTaxSlab(99999, null, 100)).toThrow(/no longer exists/);
  });
});
