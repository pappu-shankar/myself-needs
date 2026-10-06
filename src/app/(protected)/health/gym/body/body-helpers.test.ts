import { describe, expect, it } from "vitest";
import {
  formatChange,
  formatTrend,
  goalDirection,
  measurementRows,
  toStorageKg,
  withGoalDirection,
} from "./body-helpers";

describe("measurementRows", () => {
  it("gives latest value and change vs the previous reading, in site order", () => {
    const rows = measurementRows([
      {
        site: "waist",
        points: [
          { id: 1, date: "2026-08-01", value: 84 },
          { id: 2, date: "2026-09-01", value: 82.5 },
        ],
      },
      { site: "neck", points: [{ id: 3, date: "2026-09-01", value: 38 }] },
      { site: "hips", points: [] },
    ]);
    expect(rows.map((r) => r.site)).toEqual(["neck", "waist"]);
    expect(rows[0].change).toBeNull();
    expect(rows[1].change).toBe(-1.5);
    expect(rows[1].latest.id).toBe(2);
    expect(rows[1].unit).toBe("cm");
  });

  it("uses % for measured body fat", () => {
    const [row] = measurementRows([
      { site: "body_fat_pct", points: [{ id: 1, date: "2026-09-01", value: 18 }] },
    ]);
    expect(row.unit).toBe("%");
  });
});

describe("formatChange", () => {
  it("signs with a real minus and handles null/zero", () => {
    expect(formatChange(0.5)).toBe("+0.5");
    expect(formatChange(-1.2)).toBe("−1.2");
    expect(formatChange(0)).toBe("0");
    expect(formatChange(null)).toBe("—");
    expect(formatTrend(-0.4)).toBe("−0.4 kg/week");
    expect(formatTrend(-0.4, "lb")).toBe("−0.9 lb/week");
  });
});

describe("toStorageKg", () => {
  it("converts a typed lb value to kg rounded to grams", () => {
    expect(toStorageKg(225, "lb")).toBe(102.058);
    expect(toStorageKg(80.5, "kg")).toBe(80.5);
  });
});

describe("goalDirection", () => {
  it("compares distance to the goal", () => {
    expect(goalDirection(90, 89, 80)).toBe("toward");
    expect(goalDirection(70, 69, 80)).toBe("away");
    expect(goalDirection(85, 85, 80)).toBe("flat");
    expect(goalDirection(null, 85, 80)).toBe("first");
    expect(goalDirection(90, 89, null)).toBe("no-goal");
  });

  it("counts overshooting past the goal by distance", () => {
    expect(goalDirection(82, 79, 80)).toBe("toward");
    expect(goalDirection(82, 77, 80)).toBe("away");
  });
});

describe("withGoalDirection", () => {
  it("adds display-unit change and direction per point", () => {
    const rows = withGoalDirection(
      [
        { date: "2026-09-01", weightKg: 90 },
        { date: "2026-09-08", weightKg: 89.5 },
      ],
      80,
      "kg",
    );
    expect(rows.map((r) => r.direction)).toEqual(["first", "toward"]);
    expect(rows[1].change).toBe(-0.5);
    expect(rows[1].display).toBe(89.5);
  });
});
