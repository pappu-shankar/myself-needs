import { describe, expect, it } from "vitest";
import {
  BAND_RECOMMENDATIONS,
  checkinScore,
  readinessBand,
  readinessScore,
  sleepScore,
} from "./readiness";
import type { ReadinessInput } from "./types";

const best = { sleepQuality: 5, energy: 5, soreness: 1, stress: 1, motivation: 5 };
const middling = { sleepQuality: 3, energy: 4, soreness: 2, stress: 3, motivation: 4 }; // → 65

const input = (over: Partial<ReadinessInput>): ReadinessInput => ({
  sleepHours: null,
  sleepTargetHours: 8,
  checkin: null,
  acwr: null,
  ...over,
});

describe("sleepScore", () => {
  it("is 100 at or above target and falls linearly to 0 at half the target", () => {
    expect(sleepScore(8, 8)).toBe(100);
    expect(sleepScore(9.5, 8)).toBe(100);
    expect(sleepScore(6, 8)).toBe(50);
    expect(sleepScore(4, 8)).toBe(0);
    expect(sleepScore(2, 8)).toBe(0);
  });

  it("is null when not logged or the target is not positive", () => {
    expect(sleepScore(null, 8)).toBeNull();
    expect(sleepScore(7, 0)).toBeNull();
  });
});

describe("checkinScore", () => {
  it("weights the five items and inverts soreness and stress", () => {
    expect(checkinScore(best)).toBe(100);
    expect(
      checkinScore({ sleepQuality: 1, energy: 1, soreness: 5, stress: 5, motivation: 1 }),
    ).toBe(0);
    // .25·50 + .25·75 + .2·75 + .15·50 + .15·75
    expect(checkinScore(middling)).toBeCloseTo(65, 10);
  });

  it("clamps ratings outside 1–5", () => {
    expect(
      checkinScore({ sleepQuality: 9, energy: 7, soreness: -1, stress: 0, motivation: 6 }),
    ).toBe(100);
  });
});

describe("readinessBand", () => {
  it("bands ≥ 80 push, 60–79 normal, 40–59 easy, < 40 rest", () => {
    expect([80, 79, 60, 59, 40, 39, 0].map(readinessBand)).toEqual([
      "push",
      "normal",
      "normal",
      "easy",
      "easy",
      "rest",
      "rest",
    ]);
  });
});

describe("readinessScore", () => {
  it("blends sleep .3, check-in .5 and load .2", () => {
    // sleep 7/8 h → 75; check-in 65; ACWR 1.4 (high) → 60 ⇒ 22.5 + 32.5 + 12 = 67
    const result = readinessScore(input({ sleepHours: 7, checkin: middling, acwr: 1.4 }));
    expect(result.score).toBe(67);
    expect(result.band).toBe("normal");
    expect(result.recommendation).toBe("Train as planned");
  });

  it("scores a perfect day as 100 → push", () => {
    const result = readinessScore(input({ sleepHours: 8, checkin: best, acwr: 1 }));
    expect(result).toMatchObject({ score: 100, band: "push" });
    expect(result.recommendation).toBe("Good day to push — go for PRs");
    expect(result.factors.every((f) => f.impact === "positive")).toBe(true);
  });

  it("renormalizes over the parts present", () => {
    expect(readinessScore(input({ checkin: middling })).score).toBe(65);
    // sleep 75 and optimal load 100: (.3·75 + .2·100) / .5 = 85
    expect(readinessScore(input({ sleepHours: 7, acwr: 1.1 })).score).toBe(85);
    expect(readinessScore(input({ acwr: 1.6 }))).toMatchObject({ score: 25, band: "rest" });
  });

  it("returns a null score, with an explanation, when nothing is known", () => {
    const result = readinessScore(input({ sleepTargetHours: 0, sleepHours: 7 }));
    expect(result.score).toBeNull();
    expect(result.band).toBeNull();
    expect(result.recommendation).toMatch(/check-in/);
    expect(result.factors).toHaveLength(3);
    expect(result.factors.every((f) => f.impact === "neutral")).toBe(true);
  });

  it("explains each part in plain words with numbers", () => {
    const { factors } = readinessScore(input({ sleepHours: 5, checkin: middling, acwr: 1.62 }));
    const byLabel = Object.fromEntries(factors.map((f) => [f.label, f]));
    expect(byLabel.Sleep.detail).toBe("5 h slept, target 8 h — 25/100");
    expect(byLabel.Sleep.impact).toBe("negative");
    expect(byLabel["Check-in"].detail).toContain("soreness 2/5");
    expect(byLabel["Check-in"].impact).toBe("neutral");
    expect(byLabel["Training load"].detail).toContain("1.62");
    expect(byLabel["Training load"].impact).toBe("negative");
  });

  it("maps low ACWR to a neutral factor and the easy/rest recommendations", () => {
    const low = readinessScore(input({ acwr: 0.5 }));
    expect(low.factors.find((f) => f.label === "Training load")?.impact).toBe("neutral");
    expect(low.score).toBe(80);
    const tired = readinessScore(
      input({ sleepHours: 5, checkin: { ...middling, energy: 2, soreness: 4 } }),
    );
    expect(tired.band).toBe("rest");
    expect(tired.recommendation).toBe(BAND_RECOMMENDATIONS.rest);
    const meh = readinessScore(input({ sleepHours: 6, checkin: middling }));
    expect(meh.band).toBe("easy");
    expect(meh.recommendation).toBe("Keep it lighter: drop a set or cap effort at RPE 7");
  });
});
