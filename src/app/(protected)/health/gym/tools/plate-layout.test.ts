import { describe, expect, it } from "vitest";
import { describePlates, loadableAbove, plateColor, plateShapes } from "./plate-layout";
import {
  formatInUnit,
  loadStepKg,
  parsePlates,
  parsePositive,
  plateSizesInUnit,
  typedToKg,
} from "./tool-utils";

const PLATES = [25, 20, 15, 10, 5, 2.5, 1.25];

describe("plateShapes", () => {
  it("sizes heavier plates bigger and caps at the 25 kg reference", () => {
    const [big, mid, small, huge] = plateShapes([25, 10, 1.25, 45]);
    expect(big.heightPct).toBe(100);
    expect(mid.heightPct).toBeLessThan(big.heightPct);
    expect(small.heightPct).toBeLessThan(mid.heightPct);
    expect(huge.heightPct).toBe(100);
    expect(big.widthPx).toBeGreaterThan(small.widthPx);
  });

  it("scales lb plates against 45 lb and colours them by lb size", () => {
    const [big, small] = plateShapes([45, 2.5], "lb");
    expect(big.heightPct).toBe(100);
    expect(small.heightPct).toBeLessThan(50);
    expect(big.size).toBe(45);
    expect(plateColor(45, "lb")).toBe("var(--chart-8)");
  });

  it("colours known sizes and leaves odd ones neutral", () => {
    expect(plateColor(20)).toBe("var(--chart-1)");
    expect(plateColor(1.25)).toBe("var(--muted-foreground)");
  });
});

describe("describePlates", () => {
  it("groups equal plates", () => {
    expect(describePlates([20, 20, 5])).toBe("2 × 20 kg, 1 × 5 kg");
    expect(describePlates([])).toBe("");
    expect(describePlates([45, 45, 10], "lb")).toBe("2 × 45 lb, 1 × 10 lb");
  });
});

describe("loadableAbove", () => {
  it("returns the target when loadable", () => {
    expect(loadableAbove(100, 20, PLATES)).toBe(100);
  });

  it("finds the next load up when it is not", () => {
    // finest step is 2.5 kg (a pair of 1.25s)
    expect(loadableAbove(101, 20, PLATES)).toBe(102.5);
  });

  it("works with odd plate sets", () => {
    // pairs of 5 and 7 → loads 20 + {5,7,10,12,14,...}
    expect(loadableAbove(26, 20, [2.5, 3.5])).toBe(27);
  });

  it("handles targets under the bar and empty plate sets", () => {
    expect(loadableAbove(10, 20, PLATES)).toBe(20);
    expect(loadableAbove(100, 20, [])).toBeNull();
  });
});

describe("tool-utils", () => {
  it("parses positives", () => {
    expect(parsePositive("82.5")).toBe(82.5);
    expect(parsePositive("")).toBeNull();
    expect(parsePositive("-3")).toBeNull();
    expect(parsePositive("abc")).toBeNull();
  });

  it("parses plate lists", () => {
    expect(parsePlates("25, 20 15")).toEqual([25, 20, 15]);
    expect(parsePlates("25, x")).toBeNull();
  });

  it("derives the load step", () => {
    expect(loadStepKg([25, 1.25])).toBe(2.5);
    expect(loadStepKg([])).toBe(2.5);
    expect(loadStepKg([], "lb")).toBeCloseTo(2.268, 3);
    expect(
      loadStepKg(
        [45, 2.5].map((p) => p * 0.45359237),
        "lb",
      ),
    ).toBeCloseTo(2.268, 3);
  });
});

describe("unit helpers", () => {
  it("converts typed values and prints them in the unit", () => {
    expect(typedToKg(null, "lb")).toBeNull();
    expect(typedToKg(225, "lb")).toBeCloseTo(102.058, 3);
    expect(formatInUnit(225, "lb")).toBe("225 lb");
    expect(formatInUnit(62.5, "kg")).toBe("62.5 kg");
  });

  it("shows stored kg plates as round lb sizes", () => {
    expect(
      plateSizesInUnit(
        [45, 35, 2.5].map((p) => p * 0.45359237),
        "lb",
      ),
    ).toEqual([45, 35, 2.5]);
    expect(plateSizesInUnit([20, 1.25], "kg")).toEqual([20, 1.25]);
  });
});
