import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setupTestDb, teardownTestDb } from "@/test/db";
import { clearLandmarkOverride, getLandmarkOverrides, setLandmarkOverride } from "./landmarks";

beforeEach(setupTestDb);
afterEach(teardownTestDb);

describe("volume landmark overrides", () => {
  it("stores, replaces and clears an override per muscle", () => {
    expect(getLandmarkOverrides()).toEqual({});

    setLandmarkOverride("chest", { mev: 8, mavLow: 12, mavHigh: 18, mrv: 22 });
    expect(setLandmarkOverride("chest", { mev: 6, mavLow: 10, mavHigh: 16, mrv: 20 })).toEqual({
      mev: 6,
      mavLow: 10,
      mavHigh: 16,
      mrv: 20,
    });
    setLandmarkOverride("calves", { mev: 0, mavLow: 0, mavHigh: 0, mrv: 0 });

    expect(getLandmarkOverrides()).toEqual({
      chest: { mev: 6, mavLow: 10, mavHigh: 16, mrv: 20 },
      calves: { mev: 0, mavLow: 0, mavHigh: 0, mrv: 0 },
    });

    clearLandmarkOverride("chest");
    expect(Object.keys(getLandmarkOverrides())).toEqual(["calves"]);
  });

  it("requires climbing whole-set landmarks within 0–60 for a known muscle", () => {
    expect(() =>
      setLandmarkOverride("chest", { mev: 12, mavLow: 10, mavHigh: 16, mrv: 20 }),
    ).toThrow("must climb");
    expect(() =>
      setLandmarkOverride("chest", { mev: 6, mavLow: 10, mavHigh: 22, mrv: 20 }),
    ).toThrow("must climb");
    expect(() =>
      setLandmarkOverride("chest", { mev: -1, mavLow: 10, mavHigh: 16, mrv: 20 }),
    ).toThrow("must climb");
    expect(() =>
      setLandmarkOverride("chest", { mev: 6, mavLow: 10, mavHigh: 16, mrv: 61 }),
    ).toThrow("must climb");
    expect(() =>
      setLandmarkOverride("chest", { mev: 6.5, mavLow: 10, mavHigh: 16, mrv: 20 }),
    ).toThrow("whole numbers");
    expect(() => setLandmarkOverride("pecs", { mev: 6, mavLow: 10, mavHigh: 16, mrv: 20 })).toThrow(
      "Unknown muscle",
    );
    expect(() => clearLandmarkOverride("pecs")).toThrow("Unknown muscle");
    expect(getLandmarkOverrides()).toEqual({});
  });
});
