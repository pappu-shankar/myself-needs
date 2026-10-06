import { describe, expect, it } from "vitest";
import { MUSCLES, type MuscleWeights } from "../gym-types";
import type { SetRecord, WorkoutRecord } from "./types";
import {
  DEFAULT_LANDMARKS,
  balance,
  hardSetsByMuscle,
  landmarksWith,
  muscleVolumes,
  tonnageOf,
  volumeStatus,
  weeklyTonnage,
} from "./volume";

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

type Entry = WorkoutRecord["entries"][number];
const entry = (muscles: MuscleWeights, sets: SetRecord[], over: Partial<Entry> = {}): Entry => ({
  exerciseId: 1,
  exerciseName: "Exercise",
  mode: "reps",
  isBodyweight: false,
  muscles,
  sets,
  ...over,
});

const workout = (date: string, entries: Entry[]): WorkoutRecord => ({
  id: 1,
  date,
  startedAt: `${date}T10:00:00`,
  finishedAt: `${date}T11:00:00`,
  sessionRpe: null,
  entries,
});

describe("DEFAULT_LANDMARKS", () => {
  it("covers every muscle with MEV ≤ MAV low ≤ MAV high ≤ MRV", () => {
    for (const muscle of MUSCLES) {
      const { mev, mavLow, mavHigh, mrv } = DEFAULT_LANDMARKS[muscle];
      expect(mev).toBeLessThanOrEqual(mavLow);
      expect(mavLow).toBeLessThanOrEqual(mavHigh);
      expect(mavHigh).toBeLessThanOrEqual(mrv);
    }
  });

  it("applies overrides without touching the defaults", () => {
    const custom = { mev: 4, mavLow: 6, mavHigh: 10, mrv: 14 };
    const merged = landmarksWith({ chest: custom });
    expect(merged.chest).toEqual(custom);
    expect(merged.biceps).toEqual(DEFAULT_LANDMARKS.biceps);
    expect(DEFAULT_LANDMARKS.chest).not.toEqual(custom);
  });
});

describe("hardSetsByMuscle", () => {
  const bench = { chest: 1, triceps: 0.5, deltoids: 0.5 };
  const workouts = [
    workout("2026-09-28", [
      entry(bench, [set({ kind: "warmup" }), set(), set({ rir: 2 }), set({ rir: 5 })]), // 2 hard
      entry({ triceps: 1 }, [set(), set({ completed: false })]), // 1 hard
      entry({ quadriceps: 0.5, hamstring: 0.5 }, [set(), set()], { mode: "cardio" }), // skipped
    ]),
    workout("2026-10-01", [entry(bench, [set({ rpe: 8 })])]), // 1 hard
    workout("2026-10-05", [entry(bench, [set()])]), // outside the range
  ];

  it("credits each hard set to its muscles by weight within the date range", () => {
    expect(hardSetsByMuscle(workouts, "2026-09-28", "2026-10-04")).toEqual({
      chest: 3,
      triceps: 2.5,
      deltoids: 1.5,
    });
  });

  it("rounds to 0.1 and is empty with no workouts", () => {
    const thirds = workout("2026-09-28", [entry({ biceps: 1 / 3 }, [set(), set()])]);
    expect(hardSetsByMuscle([thirds], "2026-09-28", "2026-09-28")).toEqual({ biceps: 0.7 });
    expect(hardSetsByMuscle([], "2026-09-28", "2026-10-04")).toEqual({});
  });
});

describe("volumeStatus", () => {
  const landmark = { mev: 8, mavLow: 12, mavHigh: 20, mrv: 22 };

  it("places sets on the landmark scale, boundaries inclusive upward", () => {
    expect(volumeStatus(0, landmark)).toBe("none");
    expect(volumeStatus(7.5, landmark)).toBe("below_mev");
    expect(volumeStatus(8, landmark)).toBe("maintenance");
    expect(volumeStatus(12, landmark)).toBe("productive");
    expect(volumeStatus(20, landmark)).toBe("productive");
    expect(volumeStatus(22, landmark)).toBe("high");
    expect(volumeStatus(22.5, landmark)).toBe("above_mrv");
  });

  it("never reports below_mev when MEV is 0", () => {
    expect(volumeStatus(0.5, { mev: 0, mavLow: 4, mavHigh: 12, mrv: 16 })).toBe("maintenance");
  });
});

describe("muscleVolumes", () => {
  it("lists every muscle in MUSCLES order", () => {
    const volumes = muscleVolumes({ chest: 14 }, DEFAULT_LANDMARKS);
    expect(volumes.map((v) => v.muscle)).toEqual([...MUSCLES]);
    expect(volumes.find((v) => v.muscle === "chest")).toMatchObject({
      hardSets: 14,
      status: "productive",
    });
    expect(volumes.find((v) => v.muscle === "biceps")).toMatchObject({
      hardSets: 0,
      status: "none",
    });
  });
});

describe("balance", () => {
  it("computes push:pull and quad:ham", () => {
    expect(
      balance({
        chest: 10,
        triceps: 4,
        deltoids: 6,
        "upper-back": 12,
        biceps: 6,
        trapezius: 4,
        quadriceps: 12,
        hamstring: 8,
      }),
    ).toEqual({
      pushPull: { push: 17, pull: 20, ratio: 0.85 },
      quadHam: { quad: 12, ham: 8, ratio: 1.5 },
    });
  });

  it("has a null ratio when the denominator is 0", () => {
    expect(balance({ chest: 10 })).toEqual({
      pushPull: { push: 10, pull: 0, ratio: null },
      quadHam: { quad: 0, ham: 0, ratio: null },
    });
  });
});

describe("tonnageOf / weeklyTonnage", () => {
  it("sums weight × reps of completed working sets only", () => {
    const w = workout("2026-09-28", [
      entry({}, [set({ kind: "warmup", weightKg: 60 }), set(), set({ reps: 3 })]), // 500 + 300
      entry({}, [set({ completed: false })]),
      entry({}, [set({ weightKg: null, reps: 10 }), set({ weightKg: 10, reps: 8 })], {
        isBodyweight: true, // only the added 10 kg counts
      }),
      entry({}, [set({ weightKg: null, reps: null, durationSec: 60 })], { mode: "time" }),
    ]);
    expect(tonnageOf(w)).toBe(880);
    expect(tonnageOf(workout("2026-09-28", []))).toBe(0);
  });

  it("rounds away floating-point noise", () => {
    const w = workout("2026-09-28", [entry({}, [set({ weightKg: 0.1, reps: 3 })])]);
    expect(tonnageOf(w)).toBe(0.3);
  });

  it("groups by Monday week, oldest first", () => {
    const weeks = weeklyTonnage([
      workout("2026-10-01", [entry({}, [set(), set()])]),
      workout("2026-09-21", [entry({}, [set()])]),
      workout("2026-09-28", [entry({}, [set(), set({ kind: "warmup" })])]),
    ]);
    expect(weeks).toEqual([
      { weekStart: "2026-09-21", tonnageKg: 500, sets: 1, sessions: 1 },
      { weekStart: "2026-09-28", tonnageKg: 1500, sets: 3, sessions: 2 },
    ]);
    expect(weeklyTonnage([])).toEqual([]);
  });
});
