import { describe, expect, it } from "vitest";
import {
  effortOn,
  effortOptions,
  fieldsFor,
  parseDistance,
  parseMinutes,
  parseReps,
  parseSeconds,
  formatWeightInput,
  parseWeight,
} from "./set-input";

const value = (result: ReturnType<typeof parseWeight>) => (result.ok ? result.value : "error");

describe("set input parsing", () => {
  it("parses weights, accepting a decimal comma; blank clears", () => {
    expect(value(parseWeight("82.5"))).toBe(82.5);
    expect(value(parseWeight(" 82,5 "))).toBe(82.5);
    expect(value(parseWeight(".5"))).toBe(0.5);
    expect(value(parseWeight(""))).toBeNull();
    expect(value(parseWeight("abc"))).toBe("error");
    expect(value(parseWeight("-5"))).toBe("error");
    expect(value(parseWeight("2000"))).toBe("error");
  });

  it("reads pounds and returns kg to the gram; shows kg back in pounds", () => {
    expect(value(parseWeight("225", "lb"))).toBe(102.058);
    expect(value(parseWeight("2.5", "lb"))).toBe(1.134);
    expect(value(parseWeight("", "lb"))).toBeNull();
    expect(value(parseWeight("2300", "lb"))).toBe("error");
    expect(formatWeightInput(102.058, "lb")).toBe("225");
    expect(formatWeightInput(100, "lb")).toBe("220.5");
    expect(formatWeightInput(82.5)).toBe("82.5");
    expect(formatWeightInput(null, "lb")).toBe("");
  });

  it("parses whole reps only", () => {
    expect(value(parseReps("8"))).toBe(8);
    expect(value(parseReps("0"))).toBe(0);
    expect(value(parseReps("8.5"))).toBe("error");
    expect(value(parseReps(""))).toBeNull();
  });

  it("parses holds as seconds or a clock", () => {
    expect(value(parseSeconds("45"))).toBe(45);
    expect(value(parseSeconds("1:30"))).toBe(90);
    expect(value(parseSeconds("1:02:03"))).toBe(3723);
    expect(value(parseSeconds("1:75"))).toBe("error");
    expect(value(parseSeconds("4.5"))).toBe("error");
  });

  it("parses cardio time as minutes or a clock", () => {
    expect(value(parseMinutes("30"))).toBe(1800);
    expect(value(parseMinutes("30.5"))).toBe(1830);
    expect(value(parseMinutes("30:15"))).toBe(1815);
    expect(value(parseMinutes("x"))).toBe("error");
  });

  it("parses distance", () => {
    expect(value(parseDistance("5.25"))).toBe(5.25);
    expect(value(parseDistance("five"))).toBe("error");
  });
});

describe("fields per mode", () => {
  it("shows weight + reps, hold + weight, or time + distance", () => {
    expect(fieldsFor("reps", false).map((f) => f.field)).toEqual(["weightKg", "reps"]);
    expect(fieldsFor("reps", true)[0].column).toBe("+kg");
    expect(fieldsFor("time", false).map((f) => f.field)).toEqual(["durationSec", "weightKg"]);
    expect(fieldsFor("cardio", false).map((f) => f.field)).toEqual(["durationSec", "distanceKm"]);
    expect(fieldsFor("cardio", false)[0].format(1815)).toBe("30:15");
    const lb = fieldsFor("reps", true, "lb")[0];
    expect([lb.column, lb.label]).toEqual(["+lb", "added weight in lb"]);
    expect(lb.format(4.536)).toBe("10");
    expect(value(lb.parse("10"))).toBe(4.536);
  });
});

describe("effort", () => {
  it("offers the scale's choices plus an off-list current value", () => {
    expect(effortOptions("rir", null)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(effortOptions("rpe", 5)).toContain(5);
  });

  it("converts a value logged on the other scale", () => {
    expect(effortOn("rpe", { rir: 2, rpe: null })).toBe(8);
    expect(effortOn("rir", { rir: null, rpe: 9.5 })).toBe(0.5);
    expect(effortOn("rir", { rir: 1, rpe: 7 })).toBe(1);
    expect(effortOn("rpe", { rir: null, rpe: null })).toBeNull();
  });
});
