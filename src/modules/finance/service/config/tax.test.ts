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
    expect(getTaxSettingsForYear("2024-25")).toMatchObject({
      fiscalYear: "2024-25",
      eightyCLimit: 150000,
      eightyDLimit: 25000,
    });

    const updated = setTaxSettings("2024-25", { eightyCLimit: 200000 });

    expect(updated.eightyCLimit).toBe(200000);
    expect(getTaxSettingsForYear("2024-25").eightyCLimit).toBe(200000);
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
    expect(() => setTaxSettings("2026-27", { eightyCLimit: 1 })).toThrow(DomainError);
  });
});

describe("startFiscalYear", () => {
  it("copies the most recent FY's settings and slabs without touching the source", () => {
    setTaxSettings("2024-25", { eightyCLimit: 175000 });

    startFiscalYear("2025-26");

    const view = getTaxPolicyView("2025-26");
    expect(view.hasOwnSettings).toBe(true);
    expect(view.settings.eightyCLimit).toBe(175000);
    expect(view.oldSlabs.every((s) => s.fiscalYear === "2025-26")).toBe(true);
    expect(view.oldSlabs.map((s) => [s.uptoAmount, s.ratePercent])).toEqual(
      getTaxSlabsForYear("2024-25", "old").map((s) => [s.uptoAmount, s.ratePercent]),
    );

    setTaxSettings("2025-26", { eightyCLimit: 1 });
    expect(getTaxSettingsForYear("2024-25").eightyCLimit).toBe(175000);
    // Later years now inherit from 2025-26, the closest earlier FY.
    expect(getTaxSettingsForYear("2027-28").fiscalYear).toBe("2025-26");
  });

  it("rejects a duplicate or malformed FY", () => {
    expect(() => startFiscalYear("2024-25")).toThrow(/already exists/);
    expect(() => startFiscalYear("2025-27")).toThrow(DomainError);
  });
});

describe("slab CRUD", () => {
  it("seeds default slabs ascending by uptoAmount, with the uncapped top bracket last", () => {
    const oldSlabs = getTaxSlabsForYear("2024-25", "old");

    expect(oldSlabs.map((s) => s.uptoAmount)).toEqual([250000, 500000, 1000000, null]);
    expect(oldSlabs.map((s) => s.ratePercent)).toEqual([0, 5, 20, 30]);
  });

  it("adds, edits and deletes a bracket within one FY + regime", () => {
    const added = addTaxSlab("2024-25", "old", 2000000, 30);
    expect(added).toMatchObject({ fiscalYear: "2024-25", regime: "old", uptoAmount: 2000000 });

    const edited = editTaxSlab(added.id, 1500000, 25);
    expect(edited).toMatchObject({ uptoAmount: 1500000, ratePercent: 25 });

    removeTaxSlab(added.id);
    expect(getTaxSlabsForYear("2024-25", "old").map((s) => s.uptoAmount)).toEqual([
      250000,
      500000,
      1000000,
      null,
    ]);
  });

  it("edits in one FY never change another FY's slabs", () => {
    startFiscalYear("2025-26");
    const top = getTaxSlabsForYear("2025-26", "new").at(-1)!;
    editTaxSlab(top.id, null, 35);
    expect(getTaxSlabsForYear("2024-25", "new").at(-1)!.ratePercent).toBe(30);
  });

  it("rejects a schedule that isn't a single ascending progression with one open-ended top", () => {
    expect(() => addTaxSlab("2024-25", "old", null, 40)).toThrow(/only have one open-ended/);
    expect(() => addTaxSlab("2024-25", "old", 500000, 10)).toThrow(/strictly ascending/);
    expect(() => addTaxSlab("2024-25", "old", 600000, 101)).toThrow(/between 0 and 100/);

    const top = getTaxSlabsForYear("2024-25", "old").at(-1)!;
    expect(() => editTaxSlab(top.id, 3000000, 30)).toThrow(/needs one open-ended top bracket/);
    expect(() => removeTaxSlab(top.id)).toThrow(/needs one open-ended top bracket/);

    expect(() =>
      validateSlabSchedule("2024-25", "old", [{ uptoAmount: null, ratePercent: -1 }]),
    ).toThrow(DomainError);
    expect(() => validateSlabSchedule("2024-25", "old", [])).toThrow(/at least one bracket/);
  });

  it("refuses slab changes for an FY that hasn't been started, and for a missing slab", () => {
    expect(() => addTaxSlab("2026-27", "old", 100, 1)).toThrow(/hasn't been started/);
    expect(() => editTaxSlab(99999, null, 1)).toThrow(/no longer exists/);
  });
});
