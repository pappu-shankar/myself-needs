import { describe, expect, it } from "vitest";
import { addDays } from "@/lib/dates";
import {
  bmi,
  bmiCategory,
  bodyComposition,
  bodyFatCategory,
  ffmi,
  goalProgress,
  navyBodyFat,
  normalizedFfmi,
  weightTrend,
} from "./body-composition";

describe("bmi / bmiCategory", () => {
  it("is kg / m², rounded to 0.1", () => {
    expect(bmi(80, 180)).toBe(24.7);
    expect(bmi(55, 165)).toBe(20.2);
  });

  it("is null on missing or non-positive input", () => {
    expect(bmi(null, 180)).toBeNull();
    expect(bmi(80, 0)).toBeNull();
    expect(bmi(-80, 180)).toBeNull();
  });

  it("uses the WHO cut-offs", () => {
    expect([18.4, 18.5, 24.9, 25, 29.9, 30].map(bmiCategory)).toEqual([
      "underweight",
      "normal",
      "normal",
      "overweight",
      "overweight",
      "obese",
    ]);
  });
});

describe("navyBodyFat", () => {
  it("applies the cm-based US Navy formula for men and women", () => {
    expect(navyBodyFat({ sex: "male", heightCm: 180, neckCm: 38, waistCm: 85 })).toBe(16.1);
    expect(navyBodyFat({ sex: "female", heightCm: 165, neckCm: 32, waistCm: 70, hipsCm: 95 })).toBe(
      24.9,
    );
  });

  it("needs hips for women", () => {
    expect(navyBodyFat({ sex: "female", heightCm: 165, neckCm: 32, waistCm: 70 })).toBeNull();
    expect(
      navyBodyFat({ sex: "female", heightCm: 165, neckCm: 32, waistCm: 70, hipsCm: null }),
    ).toBeNull();
  });

  it("is null when a log argument would be non-positive or a measurement is missing", () => {
    expect(navyBodyFat({ sex: "male", heightCm: 180, neckCm: 40, waistCm: 40 })).toBeNull();
    expect(navyBodyFat({ sex: "male", heightCm: 180, neckCm: 45, waistCm: 40 })).toBeNull();
    expect(navyBodyFat({ sex: "male", heightCm: 0, neckCm: 38, waistCm: 85 })).toBeNull();
    expect(navyBodyFat({ sex: "male", heightCm: 180, neckCm: undefined, waistCm: 85 })).toBeNull();
    expect(navyBodyFat({ sex: "male", heightCm: null, neckCm: 38, waistCm: 85 })).toBeNull();
  });

  it("rejects an implausible result rather than reporting it", () => {
    // waist barely above neck → the formula goes negative
    expect(navyBodyFat({ sex: "male", heightCm: 180, neckCm: 40, waistCm: 41 })).toBeNull();
  });
});

describe("ffmi / normalizedFfmi", () => {
  it("is lean kg / m², normalized to 1.8 m with + 6.1 × (1.8 − h)", () => {
    expect(ffmi(68, 180)).toBe(21);
    expect(normalizedFfmi(68, 180)).toBe(21);
    expect(ffmi(68, 170)).toBe(23.5);
    expect(normalizedFfmi(68, 170)).toBe(24.1); // 23.53 + 0.61
    expect(normalizedFfmi(68, 190)).toBe(18.2); // 18.84 − 0.61
  });

  it("is null without lean mass or height", () => {
    expect(ffmi(null, 180)).toBeNull();
    expect(normalizedFfmi(68, null)).toBeNull();
  });
});

describe("bodyComposition", () => {
  it("derives everything from the Navy estimate when no body fat was measured", () => {
    expect(
      bodyComposition({
        sex: "male",
        heightCm: 180,
        weightKg: 80,
        measured: { neck: 38, waist: 85 },
      }),
    ).toEqual({
      bmi: 24.7,
      bodyFatPct: 16.1,
      bodyFatSource: "navy",
      leanMassKg: 67.1,
      ffmi: 20.7,
      normalizedFfmi: 20.7,
      waistToHeight: 0.47,
    });
  });

  it("prefers a measured body-fat percentage", () => {
    const result = bodyComposition({
      sex: "male",
      heightCm: 180,
      weightKg: 80,
      measured: { neck: 38, waist: 85, body_fat_pct: 20 },
    });
    expect(result).toMatchObject({ bodyFatPct: 20, bodyFatSource: "measured", leanMassKg: 64 });
  });

  it("leaves derived fields null when their inputs are missing", () => {
    expect(bodyComposition({ sex: null, heightCm: null, weightKg: null, measured: {} })).toEqual({
      bmi: null,
      bodyFatPct: null,
      bodyFatSource: null,
      leanMassKg: null,
      ffmi: null,
      normalizedFfmi: null,
      waistToHeight: null,
    });
    // no sex → no Navy estimate, but BMI and waist-to-height still work
    expect(
      bodyComposition({
        sex: null,
        heightCm: 180,
        weightKg: 80,
        measured: { neck: 38, waist: 90 },
      }),
    ).toMatchObject({ bmi: 24.7, bodyFatPct: null, leanMassKg: null, waistToHeight: 0.5 });
    // body fat known but no weight → no lean mass or FFMI
    expect(
      bodyComposition({
        sex: "female",
        heightCm: 165,
        weightKg: null,
        measured: { body_fat_pct: 25 },
      }),
    ).toMatchObject({ bodyFatPct: 25, leanMassKg: null, ffmi: null });
  });
});

describe("bodyFatCategory", () => {
  it("uses the ACE bands per sex", () => {
    expect([3, 6, 13.9, 14, 18, 24.9, 25].map((p) => bodyFatCategory("male", p))).toEqual([
      "essential",
      "athletes",
      "athletes",
      "fitness",
      "average",
      "average",
      "obese",
    ]);
    expect([12, 14, 21, 25, 31.9, 32].map((p) => bodyFatCategory("female", p))).toEqual([
      "essential",
      "athletes",
      "fitness",
      "average",
      "average",
      "obese",
    ]);
  });
});

describe("weightTrend", () => {
  const today = "2026-10-04";
  const line = (days: number, start: number, perDay: number) =>
    Array.from({ length: days + 1 }, (_, i) => ({
      date: addDays(today, i - days),
      value: start + perDay * i,
    }));

  it("fits a least-squares slope over the window", () => {
    // −0.1 kg/day for 28 days: −0.7 kg/week, fitted current 77.2 kg
    expect(weightTrend(line(28, 80, -0.1), 28, today)).toEqual({
      perWeekKg: -0.7,
      perWeekPct: -0.91,
    });
  });

  it("averages out noise instead of following the last point", () => {
    const points = [
      { date: "2026-09-20", value: 80 },
      { date: "2026-09-21", value: 81 },
      { date: "2026-09-27", value: 80 },
      { date: "2026-09-28", value: 81 },
      { date: "2026-10-04", value: 79 }, // one light morning
    ];
    const trend = weightTrend(points, 28, today);
    expect(trend?.perWeekKg).toBeLessThan(0);
    expect(trend?.perWeekKg).toBeGreaterThan(-1);
  });

  it("ignores points outside the window and after today", () => {
    const points = [
      { date: "2026-01-01", value: 120 },
      ...line(14, 70, 0.05),
      { date: "2026-10-10", value: 50 },
    ];
    // +0.05 kg/day: +0.35 kg/week on a fitted 70.7 kg
    expect(weightTrend(points, 28, today)).toEqual({ perWeekKg: 0.35, perWeekPct: 0.5 });
  });

  it("is null with under 2 points or under 7 days of span", () => {
    expect(weightTrend([], 28, today)).toBeNull();
    expect(weightTrend([{ date: today, value: 80 }], 28, today)).toBeNull();
    expect(weightTrend(line(6, 80, -0.1), 28, today)).toBeNull();
    expect(weightTrend(line(7, 80, -0.1), 28, today)).not.toBeNull();
  });
});

describe("goalProgress", () => {
  it("is the share of the way from start to goal, for cutting and bulking", () => {
    expect(goalProgress(90, 85, 80)).toBe(0.5);
    expect(goalProgress(60, 63, 66)).toBe(0.5);
  });

  it("clamps to 0–1", () => {
    expect(goalProgress(90, 92, 80)).toBe(0);
    expect(goalProgress(90, 78, 80)).toBe(1);
  });

  it("is null when start equals goal or an input is missing", () => {
    expect(goalProgress(80, 80, 80)).toBeNull();
    expect(goalProgress(null, 80, 75)).toBeNull();
  });
});
