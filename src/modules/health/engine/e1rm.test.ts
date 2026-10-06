import { describe, expect, it } from "vitest";
import { bestE1rm, e1rmSeries, estimate1rm, REP_CAP, repMaxTable, weightForReps } from "./e1rm";
import type { ExerciseSession, SetRecord } from "./types";

const set = (
  weightKg: number | null,
  reps: number | null,
  extra: Partial<SetRecord> = {},
): SetRecord => ({
  kind: "working",
  weightKg,
  reps,
  durationSec: null,
  distanceKm: null,
  rir: null,
  rpe: null,
  completed: true,
  ...extra,
});

describe("estimate1rm", () => {
  it("applies each formula", () => {
    expect(estimate1rm(100, 5, "epley")).toBe(116.7);
    expect(estimate1rm(100, 5, "brzycki")).toBe(112.5);
    expect(estimate1rm(100, 5, "lombardi")).toBe(117.5);
  });

  it("returns a single as measured, not estimated", () => {
    expect(estimate1rm(142.5, 1, "epley")).toBe(142.5);
    expect(estimate1rm(142.5, 1, "brzycki")).toBe(142.5);
  });

  it("refuses what it can't honestly answer", () => {
    expect(estimate1rm(0, 5, "epley")).toBeNull();
    expect(estimate1rm(-10, 5, "epley")).toBeNull();
    expect(estimate1rm(100, 0, "epley")).toBeNull();
    expect(estimate1rm(100, REP_CAP + 1, "epley")).toBeNull();
    expect(estimate1rm(Number.NaN, 5, "epley")).toBeNull();
    expect(estimate1rm(100, Number.POSITIVE_INFINITY, "epley")).toBeNull();
    expect(estimate1rm(100, REP_CAP, "brzycki")).toBe(144);
  });
});

describe("bestE1rm", () => {
  it("picks the best completed working set and says where it came from", () => {
    expect(
      bestE1rm(
        [
          set(140, 1, { kind: "warmup" }),
          set(100, 5),
          set(105, 5, { completed: false }),
          set(95, 8),
          set(null, 10),
          set(60, 20),
        ],
        "epley",
      ),
    ).toEqual({ e1rmKg: 120.3, weightKg: 95, reps: 8 });
  });

  it("is null when nothing qualifies", () => {
    expect(bestE1rm([], "epley")).toBeNull();
    expect(bestE1rm([set(50, 15)], "epley")).toBeNull();
  });
});

describe("e1rmSeries", () => {
  it("has one point per session that produced an estimate", () => {
    const sessions: ExerciseSession[] = [
      { workoutId: 1, date: "2026-01-01", target: null, sets: [set(100, 5)] },
      { workoutId: 2, date: "2026-01-03", target: null, sets: [set(50, 20)] },
      { workoutId: 3, date: "2026-01-05", target: null, sets: [set(105, 5), set(110, 3)] },
    ];
    expect(e1rmSeries(sessions, "epley")).toEqual([
      { date: "2026-01-01", workoutId: 1, e1rmKg: 116.7, weightKg: 100, reps: 5 },
      { date: "2026-01-05", workoutId: 3, e1rmKg: 122.5, weightKg: 105, reps: 5 },
    ]);
  });
});

describe("weightForReps / repMaxTable", () => {
  it("inverts each formula", () => {
    for (const formula of ["epley", "brzycki", "lombardi"] as const) {
      const e1rm = estimate1rm(100, 6, formula) as number;
      expect(weightForReps(e1rm, 6, formula)).toBeCloseTo(100, 0);
    }
    expect(weightForReps(120, 1, "epley")).toBe(120);
    expect(weightForReps(120, 13, "epley")).toBeNull();
    expect(weightForReps(0, 5, "epley")).toBeNull();
  });

  it("lists rep maxes 1..12, lighter as reps rise", () => {
    const table = repMaxTable(100, "brzycki");
    expect(table).toHaveLength(REP_CAP);
    expect(table[0]).toEqual({ reps: 1, weightKg: 100 });
    expect(table[9]).toEqual({ reps: 10, weightKg: 75 });
    for (let i = 1; i < table.length; i++) {
      expect(table[i].weightKg).toBeLessThan(table[i - 1].weightKg);
    }
    expect(repMaxTable(-1, "epley")).toEqual([]);
  });
});
