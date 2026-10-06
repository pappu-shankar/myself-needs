import { describe, expect, it } from "vitest";
import {
  formatWeight,
  fromDisplayWeight,
  paceSecPerKm,
  smallestStepKg,
  speedKmh,
  toDisplayWeight,
  floorToStep,
  formatDuration,
  formatKg,
  formatPace,
  kgToLb,
  lbToKg,
  roundTo,
  snapToStep,
} from "./units";

describe("roundTo", () => {
  it("rounds half up without float surprises", () => {
    expect(roundTo(1.005, 2)).toBe(1.01);
    expect(roundTo(2.25, 1)).toBe(2.3);
    expect(roundTo(97.32, 0)).toBe(97);
    expect(roundTo(1e-7, 2)).toBe(0);
    expect(roundTo(-0.04, 1)).toBe(0);
    expect(Object.is(roundTo(-0.04, 1), -0)).toBe(false);
  });
});

describe("snapToStep", () => {
  it("snaps to the nearest multiple, computed in grams", () => {
    expect(snapToStep(2.5 * 0.9, 2.5)).toBe(2.5);
    expect(snapToStep(60 * 0.9, 2.5)).toBe(55);
    expect(snapToStep(97.32, 2.5)).toBe(97.5);
    expect(snapToStep(0.1 + 0.2, 0.1)).toBe(0.3);
    expect(snapToStep(3.7, 1.25)).toBe(3.75);
  });

  it("rounds halves up", () => {
    expect(snapToStep(56.25, 2.5)).toBe(57.5);
  });

  it("rounds to 0.1 kg without a usable step", () => {
    expect(snapToStep(61.234969, 0)).toBe(61.2);
    expect(snapToStep(61.26, -1)).toBe(61.3);
    expect(snapToStep(61.26, 0.0001)).toBe(61.3);
  });
});

describe("floorToStep", () => {
  it("never rounds up", () => {
    expect(floorToStep(99.9, 2.5)).toBe(97.5);
    expect(floorToStep(100, 2.5)).toBe(100);
    expect(floorToStep(0.3, 0.1)).toBe(0.3);
    expect(floorToStep(61.29, 0)).toBe(61.2);
  });
});

describe("formatKg", () => {
  it("drops trailing zeros and keeps plate precision", () => {
    expect(formatKg(62.5)).toBe("62.5 kg");
    expect(formatKg(60)).toBe("60 kg");
    expect(formatKg(1.25)).toBe("1.25 kg");
    expect(formatKg(57.49999999)).toBe("57.5 kg");
    expect(formatKg(-0)).toBe("0 kg");
  });
});

describe("lb/kg", () => {
  it("uses the international pound and round-trips", () => {
    expect(lbToKg(100)).toBeCloseTo(45.359237, 9);
    expect(kgToLb(lbToKg(135))).toBeCloseTo(135, 9);
  });
});

describe("formatDuration / formatPace", () => {
  it("prints m:ss, adding hours only when there are any", () => {
    expect(formatDuration(45)).toBe("0:45");
    expect(formatDuration(725)).toBe("12:05");
    expect(formatDuration(3723)).toBe("1:02:03");
    expect(formatDuration(-5)).toBe("0:00");
    expect(formatDuration(Number.NaN)).toBe("0:00");
    expect(formatDuration(59.6)).toBe("1:00");
  });

  it("prints a pace per km, or a dash", () => {
    expect(formatPace(330)).toBe("5:30 /km");
    expect(formatPace(0)).toBe("—");
    expect(formatPace(Number.POSITIVE_INFINITY)).toBe("—");
  });
});

describe("display units", () => {
  it("round-trips pound loads through kg storage", () => {
    const stored = fromDisplayWeight(225, "lb");
    expect(stored).toBeCloseTo(102.058, 3);
    expect(toDisplayWeight(stored, "lb")).toBe(225);
    expect(formatWeight(stored, "lb")).toBe("225 lb");
    expect(formatWeight(62.5, "kg")).toBe("62.5 kg");
    expect(formatWeight(62.5)).toBe("62.5 kg");
  });

  it("uses 5 lb as the smallest jump for pound users", () => {
    expect(toDisplayWeight(smallestStepKg("lb"), "lb")).toBe(5);
    expect(smallestStepKg("kg")).toBe(2.5);
  });

  it("derives cardio speed and pace", () => {
    expect(speedKmh(5, 1500)).toBe(12);
    expect(paceSecPerKm(5, 1500)).toBe(300);
    expect(speedKmh(null, 1500)).toBeNull();
    expect(paceSecPerKm(5, 0)).toBeNull();
  });
});
