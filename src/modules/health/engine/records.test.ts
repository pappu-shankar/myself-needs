import { lbToKg } from "./units";
import { describe, expect, it } from "vitest";
import { newRecords, personalRecords, type RecordOptions } from "./records";
import type { ExerciseSession, SetRecord } from "./types";

const set = (fields: Partial<SetRecord>): SetRecord => ({
  kind: "working",
  weightKg: null,
  reps: null,
  durationSec: null,
  distanceKm: null,
  rir: null,
  rpe: null,
  completed: true,
  ...fields,
});
const lift = (weightKg: number | null, reps: number, extra: Partial<SetRecord> = {}) =>
  set({ weightKg, reps, ...extra });
const session = (workoutId: number, date: string, sets: SetRecord[]): ExerciseSession => ({
  workoutId,
  date,
  target: null,
  sets,
});

const LOADED: RecordOptions = { formula: "epley", mode: "reps", isBodyweight: false };
const BODYWEIGHT: RecordOptions = { formula: "epley", mode: "reps", isBodyweight: true };

describe("personalRecords — loaded lifts", () => {
  const history = [
    session(1, "2026-01-01", [lift(100, 5), lift(90, 8), lift(140, 1, { kind: "warmup" })]),
    session(2, "2026-01-08", [lift(80, 10), lift(85, 7), lift(110, 2, { completed: false })]),
    session(3, "2026-01-15", [lift(100, 5), lift(102.5, 2)]),
  ];
  const records = personalRecords(7, history, LOADED);
  const one = (type: string) => records.filter((r) => r.type === type);

  it("finds e1RM, heaviest and best set volume, keeping the earliest on ties", () => {
    expect(one("e1rm")).toEqual([
      {
        type: "e1rm",
        exerciseId: 7,
        value: 116.7,
        context: "100 kg × 5",
        date: "2026-01-01",
        workoutId: 1,
      },
    ]);
    expect(one("heaviest")[0]).toMatchObject({
      value: 102.5,
      context: "102.5 kg × 2",
      workoutId: 3,
    });
    expect(one("best_set_volume")[0]).toMatchObject({
      value: 800,
      context: "80 kg × 10",
      workoutId: 2,
    });
  });

  it("lists rep records along the weight/reps frontier, heaviest first", () => {
    expect(one("most_reps_at_weight").map((r) => r.context)).toEqual([
      "102.5 kg × 2",
      "100 kg × 5",
      "90 kg × 8",
      "80 kg × 10",
    ]);
    // 100 × 5 was first done in workout 1, not workout 3
    expect(one("most_reps_at_weight")[1].workoutId).toBe(1);
  });

  it("ignores warm-ups, unchecked sets and empty history", () => {
    expect(one("heaviest")[0].value).not.toBe(140);
    expect(personalRecords(7, [], LOADED)).toEqual([]);
  });
});

describe("personalRecords — other modes", () => {
  it("bodyweight work only tracks reps at bodyweight and with added load", () => {
    const records = personalRecords(
      3,
      [session(1, "2026-02-01", [lift(null, 12), lift(0, 15), lift(10, 8), lift(20, 4)])],
      BODYWEIGHT,
    );
    expect(records.map((r) => [r.type, r.value, r.context])).toEqual([
      ["most_reps_at_weight", 4, "+20 kg × 4"],
      ["most_reps_at_weight", 8, "+10 kg × 8"],
      ["most_reps_at_weight", 15, "15 reps"],
    ]);
  });

  it("timed holds track the longest hold", () => {
    const records = personalRecords(
      4,
      [
        session(1, "2026-02-01", [
          set({ durationSec: 60 }),
          set({ durationSec: 90, weightKg: 10 }),
        ]),
      ],
      { formula: "epley", mode: "time", isBodyweight: true },
    );
    expect(records).toEqual([
      expect.objectContaining({ type: "longest_hold", value: 90, context: "1:30 hold with 10 kg" }),
    ]);
  });

  it("cardio tracks the longest distance", () => {
    const records = personalRecords(
      5,
      [
        session(1, "2026-02-01", [
          set({ distanceKm: 5.2, durationSec: 1500 }),
          set({ distanceKm: 3 }),
        ]),
      ],
      { formula: "epley", mode: "cardio", isBodyweight: false },
    );
    expect(records).toEqual([
      expect.objectContaining({ type: "longest_distance", value: 5.2, context: "5.2 km in 25:00" }),
    ]);
  });
});

describe("newRecords", () => {
  const history = [session(1, "2026-01-01", [lift(100, 5), lift(90, 8)])];

  it("flags only what strictly beats history", () => {
    const today = session(2, "2026-01-08", [lift(100, 5), lift(90, 9), lift(85, 8)]);
    const records = newRecords(7, history, today, LOADED);
    // 90 × 9: e1RM 117 > 116.7, volume 810 > 720, a rep record at 90 kg. 85 × 8 beats nothing.
    expect(records.map((r) => [r.type, r.context])).toEqual([
      ["e1rm", "90 kg × 9"],
      ["best_set_volume", "90 kg × 9"],
      ["most_reps_at_weight", "90 kg × 9"],
    ]);
    expect(records.every((r) => r.workoutId === 2 && r.date === "2026-01-08")).toBe(true);
  });

  it("does not call matching your best a record", () => {
    expect(newRecords(7, history, session(2, "2026-01-08", [lift(100, 5)]), LOADED)).toEqual([]);
  });

  it("counts a rep record against the same or a heavier weight", () => {
    // 95 × 6: history at ≥ 95 kg is only 100 × 5, so 6 reps is a record
    const records = newRecords(7, history, session(2, "2026-01-08", [lift(95, 6)]), LOADED);
    expect(records.find((r) => r.type === "most_reps_at_weight")?.context).toBe("95 kg × 6");
  });

  it("treats every best as a record on the very first session", () => {
    const first = session(1, "2026-01-01", [lift(60, 5)]);
    expect(newRecords(7, [], first, LOADED).map((r) => r.type)).toEqual([
      "e1rm",
      "heaviest",
      "best_set_volume",
      "most_reps_at_weight",
    ]);
  });

  it("ignores unchecked sets in the live session", () => {
    const live = session(2, "2026-01-08", [lift(120, 5, { completed: false })]);
    expect(newRecords(7, history, live, LOADED)).toEqual([]);
  });

  it("works for bodyweight reps and timed holds", () => {
    const bwHistory = [session(1, "2026-01-01", [lift(0, 10)])];
    expect(
      newRecords(3, bwHistory, session(2, "2026-01-08", [lift(0, 11)]), BODYWEIGHT).map(
        (r) => r.context,
      ),
    ).toEqual(["11 reps"]);
    const holdOpts: RecordOptions = { formula: "epley", mode: "time", isBodyweight: true };
    const holds = [session(1, "2026-01-01", [set({ durationSec: 60 })])];
    expect(
      newRecords(4, holds, session(2, "2026-01-08", [set({ durationSec: 60 })]), holdOpts),
    ).toEqual([]);
    expect(
      newRecords(4, holds, session(2, "2026-01-08", [set({ durationSec: 65 })]), holdOpts)[0].value,
    ).toBe(65);
  });
});

describe("record context in pounds", () => {
  it("writes contexts in the display unit", () => {
    const set: SetRecord = {
      kind: "working",
      weightKg: lbToKg(225),
      reps: 5,
      durationSec: null,
      distanceKm: null,
      rir: null,
      rpe: null,
      completed: true,
    };
    const records = personalRecords(
      1,
      [{ workoutId: 1, date: "2026-10-01", target: null, sets: [set] }],
      { formula: "epley", mode: "reps", isBodyweight: false, weightUnit: "lb" },
    );
    expect(records.find((r) => r.type === "heaviest")?.context).toBe("225 lb × 5");
  });
});
