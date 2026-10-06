import { describe, expect, it } from "vitest";
import {
  effortHistogram,
  effortSummary,
  isHardSet,
  isWorkingSet,
  rirOf,
  toScale,
  weeklyEffort,
} from "./effort";
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

const workout = (date: string, sets: SetRecord[]): WorkoutRecord => ({
  id: 1,
  date,
  startedAt: `${date}T10:00:00`,
  finishedAt: `${date}T11:00:00`,
  sessionRpe: null,
  entries: [
    { exerciseId: 1, exerciseName: "Bench", mode: "reps", isBodyweight: false, muscles: {}, sets },
  ],
});

describe("rirOf / toScale", () => {
  it("prefers RIR, converts RPE as 10 − RPE, and treats 0 as a rating", () => {
    expect(rirOf(set({ rir: 2, rpe: 9 }))).toBe(2);
    expect(rirOf(set({ rpe: 8.5 }))).toBe(1.5);
    expect(rirOf(set({ rir: 0 }))).toBe(0);
    expect(rirOf(set())).toBeNull();
  });

  it("converts RIR back to the display scale", () => {
    expect(toScale("rir", 2)).toBe(2);
    expect(toScale("rpe", 2)).toBe(8);
    expect(toScale("rpe", 1.25)).toBe(8.8);
    expect(toScale("rpe", null)).toBeNull();
  });
});

describe("isWorkingSet / isHardSet", () => {
  it("excludes warm-ups and incomplete sets", () => {
    expect(isWorkingSet(set())).toBe(true);
    expect(isWorkingSet(set({ kind: "amrap" }))).toBe(true);
    expect(isWorkingSet(set({ kind: "warmup" }))).toBe(false);
    expect(isWorkingSet(set({ completed: false }))).toBe(false);
  });

  it("counts rated sets at RIR ≤ 3 and unrated working sets as hard", () => {
    expect(isHardSet(set({ rir: 3 }))).toBe(true);
    expect(isHardSet(set({ rpe: 7 }))).toBe(true); // RIR 3
    expect(isHardSet(set({ rir: 3.5 }))).toBe(false);
    expect(isHardSet(set({ rpe: 6 }))).toBe(false);
    expect(isHardSet(set())).toBe(true); // unrated
    expect(isHardSet(set({ kind: "warmup" }))).toBe(false);
    expect(isHardSet(set({ completed: false, rir: 0 }))).toBe(false);
  });
});

describe("effortSummary", () => {
  it("averages rated working sets once there are at least 5", () => {
    const sets = [
      set({ rir: 0 }),
      set({ rir: 1 }),
      set({ rpe: 8 }), // RIR 2
      set({ rir: 3 }),
      set({ rir: 5 }),
      set(), // unrated: done but not rated
      set({ kind: "warmup", rir: 6 }), // ignored
      set({ completed: false, rir: 0 }), // ignored
    ];
    expect(effortSummary(sets)).toEqual({ done: 6, rated: 5, hard: 4, avgRir: 2.2, hardPct: 0.8 });
  });

  it("withholds averages below MIN_RATED", () => {
    expect(effortSummary([set({ rir: 1 }), set({ rir: 2 }), set()])).toEqual({
      done: 3,
      rated: 2,
      hard: 2,
      avgRir: null,
      hardPct: null,
    });
    expect(effortSummary([])).toEqual({ done: 0, rated: 0, hard: 0, avgRir: null, hardPct: null });
  });
});

describe("effortHistogram", () => {
  it("bins rated working sets into 0, 1, 2, 3 and a 4+ tail", () => {
    const bins = effortHistogram([
      set({ rir: 0 }),
      set({ rir: 1.5 }), // floors to 1
      set({ rpe: 8 }),
      set({ rir: 4 }),
      set({ rir: 7 }),
      set(), // unrated, skipped
      set({ kind: "warmup", rir: 8 }), // skipped
    ]);
    expect(bins.map((b) => [b.bucket, b.count])).toEqual([
      [0, 1],
      [1, 1],
      [2, 1],
      [3, 0],
      ["4+", 2],
    ]);
    expect(bins[4].pct).toBeCloseTo(0.4);
    expect(bins.reduce((sum, b) => sum + b.pct, 0)).toBeCloseTo(1);
  });

  it("is all zeros with nothing rated", () => {
    expect(effortHistogram([set()]).every((b) => b.count === 0 && b.pct === 0)).toBe(true);
  });

  it("clamps RIR below 0 into the 0 bucket", () => {
    expect(effortHistogram([set({ rpe: 10.5 })])[0].count).toBe(1);
  });
});

describe("weeklyEffort", () => {
  it("averages per Monday week, oldest first, dropping weeks with < 2 rated sets", () => {
    const weeks = weeklyEffort([
      workout("2026-10-01", [set({ rir: 1 }), set({ rir: 2 }), set()]),
      workout("2026-09-22", [set({ rir: 3 }), set({ rpe: 9 })]),
      workout("2026-09-24", [set({ rir: 2 }), set({ kind: "warmup", rir: 6 })]),
      workout("2026-09-15", [set({ rir: 1 }), set(), set()]), // one rated → dropped
    ]);
    expect(weeks).toEqual([
      { weekStart: "2026-09-21", avgRir: 2, rated: 3, sets: 3 },
      { weekStart: "2026-09-28", avgRir: 1.5, rated: 2, sets: 3 },
    ]);
    expect(weeklyEffort([])).toEqual([]);
  });
});
