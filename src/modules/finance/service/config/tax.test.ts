import { beforeEach, afterEach, describe, expect, it } from "vitest";
import { setupTestDb, teardownTestDb } from "@/test/db";
import {
  addTaxSlab,
  editTaxSlabRate,
  getTaxSettingsView,
  getTaxSlabsView,
  setTaxSettings,
} from "./tax";

beforeEach(setupTestDb);
afterEach(teardownTestDb);

describe("tax settings and slabs CRUD", () => {
  it("seeds and returns default tax settings, then persists a patch", () => {
    expect(getTaxSettingsView()).toMatchObject({ eightyCLimit: 150000, eightyDLimit: 25000 });

    const updated = setTaxSettings({ eightyCLimit: 200000 });

    expect(updated.eightyCLimit).toBe(200000);
    expect(getTaxSettingsView().eightyCLimit).toBe(200000);
  });

  it("seeds default slabs ascending by uptoAmount, with the uncapped top bracket last", () => {
    const oldSlabs = getTaxSlabsView("old");

    expect(oldSlabs.map((s) => s.uptoAmount)).toEqual([250000, 500000, 1000000, null]);
    expect(oldSlabs.map((s) => s.ratePercent)).toEqual([0, 5, 20, 30]);
  });

  it("adds a new slab and edits an existing slab's rate", () => {
    getTaxSlabsView("old"); // ensure seeded

    const added = addTaxSlab("old", 2000000, 35);
    expect(added).toMatchObject({ regime: "old", uptoAmount: 2000000, ratePercent: 35 });

    const edited = editTaxSlabRate(added.id, 40);
    expect(edited.ratePercent).toBe(40);
  });
});
