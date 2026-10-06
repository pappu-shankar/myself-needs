import { describe, expect, it } from "vitest";
import catalog from "../data/exercise-catalog.json";
import { SEXES } from "../gym-types";
import {
  LIFTS,
  LIFT_CATALOG_KEYS,
  STRENGTH_LEVELS,
  STRENGTH_RATIOS,
  dotsCoefficient,
  dotsScore,
  strengthStandard,
} from "./strength";

describe("DOTS", () => {
  it("matches the hand-evaluated polynomial", () => {
    // men, 100 kg: poly = 812.327 → 500 / poly = 0.615516; × 700 kg
    expect(dotsScore(700, 100, "male")).toBe(430.86);
    // women, 60 kg, 400 kg total
    expect(dotsScore(400, 60, "female")).toBe(443.42);
    expect(dotsCoefficient(100, "male")).toBeCloseTo(0.615516, 6);
  });

  it("clamps bodyweight to the formula's range (men 40–210, women 40–150)", () => {
    expect(dotsCoefficient(250, "male")).toBe(dotsCoefficient(210, "male"));
    expect(dotsCoefficient(30, "male")).toBe(dotsCoefficient(40, "male"));
    expect(dotsCoefficient(170, "female")).toBe(dotsCoefficient(150, "female"));
    expect(dotsCoefficient(35, "female")).toBe(dotsCoefficient(40, "female"));
    expect(dotsCoefficient(149, "female")).not.toBe(dotsCoefficient(150, "female"));
  });

  it("rewards lighter lifters for the same total", () => {
    expect(dotsScore(600, 75, "male")).toBeGreaterThan(dotsScore(600, 100, "male"));
  });
});

describe("STRENGTH_RATIOS", () => {
  it("rises strictly from beginner to elite for every lift and sex", () => {
    for (const lift of LIFTS) {
      for (const sex of SEXES) {
        const values = STRENGTH_LEVELS.map((level) => STRENGTH_RATIOS[lift][sex][level]);
        values.slice(1).forEach((v, i) => expect(v).toBeGreaterThan(values[i]));
      }
    }
  });
});

describe("strengthStandard", () => {
  it("finds the level and the e1RM the next one needs", () => {
    // 140 / 80 = 1.75× → intermediate (1.5); advanced needs 2.25 × 80 = 180
    expect(strengthStandard("squat", 140, 80, "male")).toEqual({
      lift: "squat",
      e1rmKg: 140,
      ratio: 1.75,
      level: "intermediate",
      nextLevelKg: 180,
    });
  });

  it("counts a ratio exactly on a threshold as reaching it", () => {
    expect(strengthStandard("squat", 120, 80, "male").level).toBe("intermediate");
  });

  it("reads untrained below beginner and has no next level at elite", () => {
    expect(strengthStandard("bench", 30, 80, "male")).toMatchObject({
      level: "untrained",
      nextLevelKg: 40,
    });
    expect(strengthStandard("deadlift", 250, 80, "male")).toMatchObject({
      level: "elite",
      nextLevelKg: null,
    });
  });

  it("rounds the next-level target up to 0.5 kg", () => {
    // 2.25 × 77 = 173.25 → 173.5
    expect(strengthStandard("squat", 140, 77, "male").nextLevelKg).toBe(173.5);
    // 0.55 × 80 is 44.000000000000007 in floating point — still 44, not 44.5
    expect(strengthStandard("overhead_press", 35, 80, "male").nextLevelKg).toBe(44);
  });

  it("uses the female table", () => {
    expect(strengthStandard("bench", 45, 60, "female")).toMatchObject({
      ratio: 0.75,
      level: "intermediate",
      nextLevelKg: 60,
    });
  });

  it("treats a pull-up e1RM as bodyweight plus added load", () => {
    // 80 kg lifter + 20 kg belt → 100 / 80 = 1.25 → novice (1.2); intermediate 1.45 × 80 = 116
    expect(strengthStandard("pullup", 100, 80, "male")).toMatchObject({
      level: "novice",
      nextLevelKg: 116,
    });
  });

  it("is all null without an e1RM or bodyweight", () => {
    const empty = { ratio: null, level: null, nextLevelKg: null };
    expect(strengthStandard("row", null, 80, "male")).toEqual({
      lift: "row",
      e1rmKg: null,
      ...empty,
    });
    expect(strengthStandard("row", 80, null, "male")).toMatchObject(empty);
    expect(strengthStandard("row", 80, 0, "male")).toMatchObject(empty);
  });
});

describe("LIFT_CATALOG_KEYS", () => {
  const byKey = new Map(catalog.exercises.map((e) => [e.key, e]));
  const expected: Record<string, string> = {
    "0043": "Barbell Full Squat",
    "1461": "Barbell Full Squat (Back Pov)",
    "1462": "Barbell Full Squat (Side Pov)",
    "1435": "Barbell Low Bar Squat",
    "1436": "Barbell High Bar Squat",
    "0025": "Barbell Bench Press",
    "0032": "Barbell Deadlift",
    "0117": "Barbell Sumo Deadlift",
    "1456": "Barbell Standing Close Grip Military Press",
    "1457": "Barbell Standing Wide Military Press",
    "0091": "Barbell Seated Overhead Press",
    "0027": "Barbell Bent Over Row",
    "3017": "Barbell Pendlay Row",
    "0118": "Barbell Reverse Grip Bent Over Row",
    "0652": "Pull-Up",
    "0841": "Weighted Pull-Up",
    "1429": "Wide Grip Pull-Up",
    "0651": "Pull Up (Neutral Grip)",
    "1326": "Chin-Up",
  };

  it("names exactly the expected catalog exercises", () => {
    const keys = LIFTS.flatMap((lift) => LIFT_CATALOG_KEYS[lift]);
    expect(new Set(keys).size).toBe(keys.length); // no key in two lifts
    expect([...keys].sort()).toEqual(Object.keys(expected).sort());
    for (const key of keys) expect(byKey.get(key)?.name).toBe(expected[key]);
  });

  it("maps barbell lifts to barbell exercises and pull-ups to back exercises", () => {
    for (const lift of LIFTS) {
      for (const key of LIFT_CATALOG_KEYS[lift]) {
        const exercise = byKey.get(key);
        if (lift === "pullup") expect(exercise?.bodyPart).toBe("back");
        else expect(exercise?.equipment).toBe("barbell");
      }
    }
  });
});
