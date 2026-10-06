import { describe, expect, it } from "vitest";
import {
  fillWeeks,
  landmarkGeometry,
  parseRange,
  pushPullReading,
  quadHamReading,
  visibleVolumes,
} from "./stats-helpers";

const lm = { mev: 8, mavLow: 12, mavHigh: 20, mrv: 22 };

describe("landmarkGeometry", () => {
  it("places ticks and the MAV band on one scale", () => {
    const g = landmarkGeometry(lm, 10);
    expect(g.max).toBeCloseTo(25.3);
    expect(g.mev).toBeCloseTo((8 / 25.3) * 100);
    expect(g.bandLeft).toBeCloseTo((12 / 25.3) * 100);
    expect(g.bandWidth).toBeCloseTo((8 / 25.3) * 100);
    expect(g.value).toBeCloseTo((10 / 25.3) * 100);
  });

  it("stretches the axis when sets exceed MRV and keeps values within 0–100", () => {
    const g = landmarkGeometry(lm, 40);
    expect(g.value).toBeLessThanOrEqual(100);
    expect(g.mrv).toBeLessThan(g.value);
  });

  it("copes with an all-zero landmark", () => {
    const g = landmarkGeometry({ mev: 0, mavLow: 0, mavHigh: 0, mrv: 0 }, 0);
    expect(g).toMatchObject({ mev: 0, bandWidth: 0, value: 0 });
  });
});

describe("visibleVolumes", () => {
  it("keeps muscles with landmarks or sets", () => {
    const row = (hardSets: number, mrv: number) => ({
      muscle: "chest" as const,
      hardSets,
      landmark: { mev: 0, mavLow: 0, mavHigh: 0, mrv },
      status: "none" as const,
    });
    expect(visibleVolumes([row(0, 0), row(2, 0), row(0, 10)])).toHaveLength(2);
  });
});

describe("readings", () => {
  it("reads push:pull", () => {
    expect(pushPullReading(1, 10, 10).label).toBe("Balanced");
    expect(pushPullReading(1.6, 16, 10).label).toBe("Push-heavy");
    expect(pushPullReading(0.5, 5, 10).label).toBe("Pull-heavy");
    expect(pushPullReading(null, 5, 0).label).toBe("All push");
    expect(pushPullReading(null, 0, 0).label).toBe("No data");
  });

  it("reads quad:ham", () => {
    expect(quadHamReading(1.5, 15, 10).label).toBe("Balanced");
    expect(quadHamReading(3, 30, 10).label).toBe("Quad-dominant");
    expect(quadHamReading(0.5, 5, 10).label).toBe("Hamstring-heavy");
    expect(quadHamReading(null, 5, 0).label).toBe("All quads");
  });
});

describe("parseRange", () => {
  it("defaults to month and rejects junk", () => {
    expect(parseRange(undefined)).toBe("month");
    expect(parseRange("nope")).toBe("month");
    expect(parseRange("year")).toBe("year");
    expect(parseRange(["all", "week"])).toBe("all");
  });
});

describe("fillWeeks", () => {
  it("zero-fills missing weeks, ending with the current week", () => {
    // 2026-10-04 is a Sunday; its week starts Mon 2026-09-28.
    const out = fillWeeks(
      [{ weekStart: "2026-09-21", tonnageKg: 500, sets: 10, sessions: 2 }],
      "2026-10-04",
      3,
    );
    expect(out.map((w) => w.weekStart)).toEqual(["2026-09-21", "2026-09-28", "2026-09-14"].sort());
    expect(out[0].tonnageKg).toBe(0);
    expect(out[1].tonnageKg).toBe(500);
    expect(out[2].tonnageKg).toBe(0);
  });
});

describe("hasMuscleLoad / formatTonnage", () => {
  it("detects any non-zero muscle load", async () => {
    const { hasMuscleLoad } = await import("./stats-helpers");
    expect(hasMuscleLoad({ load: {} })).toBe(false);
    expect(hasMuscleLoad({ load: { chest: 0 } })).toBe(false);
    expect(hasMuscleLoad({ load: { chest: 2.5 } })).toBe(true);
  });

  it("formats tonnage in the display unit", async () => {
    const { formatTonnage } = await import("./stats-helpers");
    expect(formatTonnage(1000, "kg")).toBe("1,000 kg");
    expect(formatTonnage(1000, "lb")).toBe("2,205 lb");
  });
});
