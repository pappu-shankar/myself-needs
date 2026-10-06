import { describe, expect, it } from "vitest";
import { addDays } from "@/lib/dates";
import {
  LAMBDA_ACUTE,
  LAMBDA_CHRONIC,
  acwr,
  acwrEwma,
  acwrZone,
  dailyLoads,
  sessionLoad,
  type DailyLoad,
} from "./load";
import type { SetRecord, WorkoutRecord } from "./types";

const set = (over: Partial<SetRecord> = {}): SetRecord => ({
  kind: "working",
  weightKg: 100,
  reps: 5,
  durationSec: null,
  distanceKm: null,
  rir: null,
  rpe: null,
  completed: true,
  ...over,
});

const workout = (
  date: string,
  sets: SetRecord[] = [set()],
  over: Partial<WorkoutRecord> = {},
): WorkoutRecord => ({
  id: 1,
  date,
  startedAt: `${date}T10:00:00`,
  finishedAt: `${date}T11:00:00`,
  sessionRpe: null,
  entries: [
    { exerciseId: 1, exerciseName: "Squat", mode: "reps", isBodyweight: false, muscles: {}, sets },
  ],
  ...over,
});

/** Consecutive daily loads starting at `start`. */
const series = (start: string, loads: number[]): DailyLoad[] =>
  loads.map((load, i) => ({ date: addDays(start, i), load }));
const repeat = (n: number, load: number) => Array.from({ length: n }, () => load);

describe("sessionLoad", () => {
  it("is minutes × session RPE when one was given", () => {
    expect(sessionLoad(workout("2026-10-01", [set({ rpe: 10 })], { sessionRpe: 7 }))).toBe(420);
  });

  it("falls back to the mean effective RPE of rated working sets", () => {
    const sets = [set({ rpe: 8 }), set({ rir: 1 }), set(), set({ kind: "warmup", rpe: 5 })];
    expect(sessionLoad(workout("2026-10-01", sets))).toBe(510); // 60 × 8.5
  });

  it("assumes RPE 5 when nothing is rated", () => {
    expect(sessionLoad(workout("2026-10-01"))).toBe(300);
  });

  it("uses the per-set minutes estimate for an unfinished session", () => {
    const sets = [set(), set(), set(), set()];
    expect(sessionLoad(workout("2026-10-01", sets, { finishedAt: null, sessionRpe: 6 }))).toBe(60);
  });
});

describe("dailyLoads", () => {
  it("lists every day in range with rest days as 0 and same-day sessions summed", () => {
    const days = dailyLoads(
      [
        workout("2026-09-29", [set()], { sessionRpe: 5 }),
        workout("2026-09-29", [set()], { sessionRpe: 5 }),
        workout("2026-10-01", [set()], { sessionRpe: 8 }),
        workout("2026-10-10", [set()], { sessionRpe: 8 }), // outside
      ],
      "2026-09-28",
      "2026-10-04",
    );
    expect(days).toHaveLength(7);
    expect(days.map((d) => d.load)).toEqual([0, 600, 0, 480, 0, 0, 0]);
    expect(days[0].date).toBe("2026-09-28");
    expect(days[6].date).toBe("2026-10-04");
  });

  it("is empty when from is after to", () => {
    expect(dailyLoads([], "2026-10-05", "2026-10-04")).toEqual([]);
  });
});

describe("acwr (rolling averages)", () => {
  it("is 1 for perfectly steady training", () => {
    const daily = series("2026-09-01", repeat(35, 100));
    expect(acwr(daily, "2026-10-05")).toEqual({ acute: 100, chronic: 100, ratio: 1 });
  });

  it("detects a spike: 3 weeks at 100 then a week at 200", () => {
    const daily = series("2026-09-01", [...repeat(21, 100), ...repeat(7, 200)]);
    // acute 200; chronic (21·100 + 7·200) / 28 = 125
    expect(acwr(daily, "2026-09-28")).toEqual({ acute: 200, chronic: 125, ratio: 1.6 });
  });

  it("withholds the ratio with under 21 days of history", () => {
    const daily = series("2026-09-01", repeat(20, 100));
    expect(acwr(daily, "2026-09-20").ratio).toBeNull();
    expect(acwr(series("2026-09-01", repeat(21, 100)), "2026-09-21").ratio).toBe(1);
  });

  it("doesn't count leading rest days as history, nor dilute a newcomer's chronic load", () => {
    // 30 empty days, then 21 steady days: history is 21 days, ratio 1 (not 1.33).
    const daily = series("2026-08-01", [...repeat(30, 0), ...repeat(21, 100)]);
    expect(acwr(daily, "2026-09-20")).toEqual({ acute: 100, chronic: 100, ratio: 1 });
  });

  it("treats days missing from the series as rest and ignores days after onDate", () => {
    const daily = [
      ...series("2026-09-01", repeat(28, 70)),
      { date: "2026-09-29", load: 10_000 },
    ].filter((d) => d.date < "2026-09-22" || d.date > "2026-09-28"); // last week missing
    expect(acwr(daily, "2026-09-28")).toEqual({ acute: 0, chronic: 52.5, ratio: 0 });
  });

  it("has no ratio without any load", () => {
    expect(acwr([], "2026-09-28")).toEqual({ acute: 0, chronic: 0, ratio: null });
    expect(acwr(series("2026-09-01", repeat(28, 0)), "2026-09-28").ratio).toBeNull();
  });
});

describe("acwrEwma", () => {
  it("uses λ = 2 / (N + 1)", () => {
    expect(LAMBDA_ACUTE).toBe(0.25);
    expect(LAMBDA_CHRONIC).toBeCloseTo(0.0689655, 6);
  });

  it("is 1 for steady training from day one (seeded, no warm-up bias)", () => {
    const daily = series("2026-09-01", repeat(21, 100));
    expect(acwrEwma(daily, "2026-09-21")).toEqual({ acute: 100, chronic: 100, ratio: 1 });
  });

  it("follows the recursion through a spike", () => {
    const daily = series("2026-08-01", [...repeat(50, 100), ...repeat(7, 200)]);
    const result = acwrEwma(daily, addDays("2026-08-01", 56));
    // After 7 days at 200 from a steady 100: ewma = 200 − 100 × (1 − λ)^7
    const acute = 200 - 100 * (1 - LAMBDA_ACUTE) ** 7;
    const chronic = 200 - 100 * (1 - LAMBDA_CHRONIC) ** 7;
    expect(result.acute).toBeCloseTo(acute, 1);
    expect(result.chronic).toBeCloseTo(chronic, 1);
    expect(result.ratio).toBe(Math.round((acute / chronic) * 100) / 100);
    expect(acwrZone(result.ratio)).toBe("high");
  });

  it("withholds the ratio with under 21 days of history and handles no load", () => {
    expect(acwrEwma(series("2026-09-01", repeat(10, 100)), "2026-09-10").ratio).toBeNull();
    expect(acwrEwma([], "2026-09-10")).toEqual({ acute: 0, chronic: 0, ratio: null });
  });
});

describe("acwrZone", () => {
  it("uses Gabbett's zones with boundaries in the safer zone", () => {
    expect(acwrZone(0.79)).toBe("low");
    expect(acwrZone(0.8)).toBe("optimal");
    expect(acwrZone(1.3)).toBe("optimal");
    expect(acwrZone(1.31)).toBe("high");
    expect(acwrZone(1.5)).toBe("high");
    expect(acwrZone(1.51)).toBe("danger");
    expect(acwrZone(null)).toBeNull();
  });
});
