import { describe, expect, it } from "vitest";
import type { ExerciseSession, SetRecord } from "@/modules/health/engine/types";
import { newRecords } from "@/modules/health/engine/records";
import { condenseHistory, formatSetBrief, lastPerformedSession, previousSetFor } from "./history";

function set(
  weightKg: number | null,
  reps: number | null,
  extra: Partial<SetRecord> = {},
): SetRecord {
  return {
    kind: "working",
    weightKg,
    reps,
    durationSec: null,
    distanceKm: null,
    rir: null,
    rpe: null,
    completed: true,
    ...extra,
  };
}

function session(workoutId: number, date: string, sets: SetRecord[]): ExerciseSession {
  return { workoutId, date, target: null, sets };
}

describe("previous set lookup", () => {
  const last = session(2, "2026-10-01", [
    set(20, 10, { kind: "warmup" }),
    set(60, 5, { kind: "warmup" }),
    set(80, 5),
    set(80, 5),
    set(80, 4),
  ]);

  it("lines up work sets with work sets and warm-ups with warm-ups", () => {
    const today = [
      { kind: "warmup" as const },
      { kind: "working" as const },
      { kind: "working" as const },
    ];
    expect(previousSetFor(last, today, 0)).toMatchObject({ weightKg: 20, reps: 10 });
    expect(previousSetFor(last, today, 1)).toMatchObject({ weightKg: 80, reps: 5 });
    expect(previousSetFor(last, today, 2)).toMatchObject({ weightKg: 80, reps: 5 });
  });

  it("doesn't shift when today has no warm-ups", () => {
    const today = [
      { kind: "working" as const },
      { kind: "amrap" as const },
      { kind: "working" as const },
    ];
    expect(previousSetFor(last, today, 2)).toMatchObject({ weightKg: 80, reps: 4 });
  });

  it("returns null past the end, for no history, or a bad index", () => {
    const today = Array.from({ length: 5 }, () => ({ kind: "working" as const }));
    expect(previousSetFor(last, today, 3)).toBeNull();
    expect(previousSetFor(null, today, 0)).toBeNull();
    expect(previousSetFor(last, today, 9)).toBeNull();
  });

  it("ignores sets that weren't done", () => {
    const skipped = session(3, "2026-10-02", [set(85, 0, { completed: false }), set(85, 3)]);
    expect(previousSetFor(skipped, [{ kind: "working" }], 0)).toMatchObject({ reps: 3 });
  });

  it("finds the last session in which anything was done", () => {
    const empty = session(4, "2026-10-03", [set(90, 5, { completed: false })]);
    expect(lastPerformedSession([last, empty])?.workoutId).toBe(2);
    expect(lastPerformedSession([empty])).toBeNull();
    expect(lastPerformedSession([])).toBeNull();
  });
});

describe("formatSetBrief", () => {
  it("formats each mode compactly", () => {
    expect(formatSetBrief(set(80, 5), "reps", false)).toBe("80 × 5");
    expect(formatSetBrief(set(82.5, 5), "reps", false, { units: true })).toBe("82.5 kg × 5");
    expect(formatSetBrief(set(10, 8), "reps", true)).toBe("+10 × 8");
    expect(formatSetBrief(set(null, 12), "reps", true)).toBe("12 reps");
    expect(formatSetBrief(set(10, null, { durationSec: 45 }), "time", false)).toBe("0:45 @ 10");
    expect(formatSetBrief(set(null, null, { durationSec: 90 }), "time", true)).toBe("1:30");
    expect(
      formatSetBrief(set(null, null, { durationSec: 1800, distanceKm: 5 }), "cardio", false),
    ).toBe("30:00 · 5 km · 10 km/h · 6:00 /km");
    expect(formatSetBrief(set(null, null, { durationSec: 1800 }), "cardio", false)).toBe("30:00");
  });

  it("shows weights in pounds when asked", () => {
    const lb = { weightUnit: "lb" as const };
    expect(formatSetBrief(set(102.058, 5), "reps", false, lb)).toBe("225 × 5");
    expect(formatSetBrief(set(102.058, 5), "reps", false, { ...lb, units: true })).toBe(
      "225 lb × 5",
    );
    expect(formatSetBrief(set(4.536, 8), "reps", true, { ...lb, units: true })).toBe("+10 lb × 8");
  });
});

describe("condenseHistory", () => {
  const options = { formula: "epley" as const, mode: "reps" as const, isBodyweight: false };

  const history: ExerciseSession[] = [
    session(1, "2026-09-01", [
      set(20, 10, { kind: "warmup" }),
      set(100, 5),
      set(100, 5),
      set(90, 8),
    ]),
    session(2, "2026-09-05", [
      set(105, 3),
      set(80, 12),
      set(70, 15),
      set(60, 20, { completed: false }),
    ]),
    session(3, "2026-09-09", [set(110, 1), set(95, 6), set(95, 6), set(50, 30)]),
    session(4, "2026-09-12", [set(100, 5), set(100, 4)]),
  ];

  it("keeps the last performed session whole and shrinks the rest", () => {
    const condensed = condenseHistory(history, "epley");
    expect(condensed).toHaveLength(2);
    expect(condensed[1]).toBe(history[3]);
    const olderWorkSets = history
      .slice(0, 3)
      .flatMap((s) => s.sets.filter((x) => x.completed && x.kind !== "warmup"));
    expect(condensed[0].sets.length).toBeLessThan(olderWorkSets.length);
  });

  it("finds exactly the same new records as the full history", () => {
    const todays = [
      [set(100, 6)],
      [set(112.5, 1)],
      [set(96, 6)],
      [set(70, 16)],
      [set(50, 31)],
      [set(80, 12)],
      [set(60, 5)],
      [set(120, 2), set(90, 10)],
    ];
    const condensed = condenseHistory(history, "epley");
    for (const sets of todays) {
      const today = session(9, "2026-10-04", sets);
      expect(newRecords(1, condensed, today, options)).toEqual(
        newRecords(1, history, today, options),
      );
    }
  });

  it("matches for timed holds, cardio and bodyweight too", () => {
    const holds = [
      session(1, "2026-09-01", [
        set(null, null, { durationSec: 60 }),
        set(null, null, { durationSec: 75 }),
      ]),
      session(2, "2026-09-02", [set(null, null, { durationSec: 70 })]),
    ];
    const today = session(9, "2026-10-04", [set(null, null, { durationSec: 80 })]);
    const holdOptions = { formula: "epley" as const, mode: "time" as const, isBodyweight: true };
    expect(newRecords(1, condenseHistory(holds, "epley"), today, holdOptions)).toEqual(
      newRecords(1, holds, today, holdOptions),
    );

    const pullups = [
      session(1, "2026-09-01", [set(null, 10), set(10, 6), set(null, 8)]),
      session(2, "2026-09-02", [set(5, 8)]),
    ];
    const bwOptions = { formula: "epley" as const, mode: "reps" as const, isBodyweight: true };
    for (const sets of [[set(null, 11)], [set(10, 7)], [set(5, 9)], [set(2.5, 9)]]) {
      const now = session(9, "2026-10-04", sets);
      expect(newRecords(1, condenseHistory(pullups, "epley"), now, bwOptions)).toEqual(
        newRecords(1, pullups, now, bwOptions),
      );
    }
  });

  it("is empty for no history and keeps a lone session as is", () => {
    expect(condenseHistory([], "epley")).toEqual([]);
    expect(condenseHistory([history[0]], "epley")).toEqual([history[0]]);
  });
});
