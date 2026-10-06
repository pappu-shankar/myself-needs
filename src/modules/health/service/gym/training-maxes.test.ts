import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setupTestDb, teardownTestDb } from "@/test/db";
import { createCustomExercise } from "./exercises";
import {
  deleteTrainingMax,
  latestTrainingMaxes,
  listTrainingMaxes,
  setTrainingMax,
} from "./training-maxes";

beforeEach(setupTestDb);
afterEach(teardownTestDb);

function lift(name: string) {
  return createCustomExercise({ name, bodyPart: "upper legs" }).id;
}

describe("training maxes", () => {
  it("lists newest first with the exercise name", () => {
    const squat = lift("Squat");
    setTrainingMax({ exerciseId: squat, trainingMaxKg: 100, effectiveFrom: "2026-08-01" });
    setTrainingMax({
      exerciseId: squat,
      trainingMaxKg: 105,
      effectiveFrom: "2026-09-01",
      note: " cycle 2 ",
    });
    const rows = listTrainingMaxes(squat);
    expect(rows.map((r) => r.trainingMaxKg)).toEqual([105, 100]);
    expect(rows[0]).toMatchObject({ exerciseName: "Squat", note: "cycle 2" });
    expect(listTrainingMaxes(undefined, { limit: 1 })).toHaveLength(1);
  });

  it("picks the latest max per exercise, optionally as of a date", () => {
    const squat = lift("Squat");
    const bench = lift("Bench");
    setTrainingMax({ exerciseId: squat, trainingMaxKg: 100, effectiveFrom: "2026-08-01" });
    setTrainingMax({ exerciseId: squat, trainingMaxKg: 110, effectiveFrom: "2026-10-01" });
    setTrainingMax({ exerciseId: bench, trainingMaxKg: 80, effectiveFrom: "2026-09-01" });

    expect(latestTrainingMaxes().map((r) => [r.exerciseName, r.trainingMaxKg])).toEqual([
      ["Bench", 80],
      ["Squat", 110],
    ]);
    expect(latestTrainingMaxes("2026-09-15").map((r) => [r.exerciseName, r.trainingMaxKg])).toEqual(
      [
        ["Bench", 80],
        ["Squat", 100],
      ],
    );
    expect(latestTrainingMaxes("2026-07-01")).toEqual([]);
  });

  it("replaces the value when set again for the same lift and date", () => {
    const squat = lift("Squat");
    const first = setTrainingMax({
      exerciseId: squat,
      trainingMaxKg: 100,
      effectiveFrom: "2026-08-01",
    });
    const again = setTrainingMax({
      exerciseId: squat,
      trainingMaxKg: 102.5,
      effectiveFrom: "2026-08-01",
    });
    expect(again.id).toBe(first.id);
    expect(listTrainingMaxes(squat).map((r) => r.trainingMaxKg)).toEqual([102.5]);
  });

  it("validates the value, date and exercise", () => {
    const squat = lift("Squat");
    const plank = createCustomExercise({
      name: "Plank",
      bodyPart: "waist",
      defaultMode: "time",
    }).id;
    expect(() =>
      setTrainingMax({ exerciseId: squat, trainingMaxKg: 0, effectiveFrom: "2026-08-01" }),
    ).toThrow("more than 0");
    expect(() =>
      setTrainingMax({ exerciseId: squat, trainingMaxKg: -5, effectiveFrom: "2026-08-01" }),
    ).toThrow("more than 0");
    expect(() =>
      setTrainingMax({ exerciseId: squat, trainingMaxKg: 100, effectiveFrom: "08/01/2026" }),
    ).toThrow("calendar date");
    expect(() =>
      setTrainingMax({ exerciseId: 999_999, trainingMaxKg: 100, effectiveFrom: "2026-08-01" }),
    ).toThrow("doesn't exist");
    expect(() =>
      setTrainingMax({ exerciseId: plank, trainingMaxKg: 20, effectiveFrom: "2026-08-01" }),
    ).toThrow("weight × reps");
  });

  it("deletes one", () => {
    const squat = lift("Squat");
    const tm = setTrainingMax({
      exerciseId: squat,
      trainingMaxKg: 100,
      effectiveFrom: "2026-08-01",
    });
    deleteTrainingMax(tm.id);
    expect(listTrainingMaxes(squat)).toEqual([]);
    expect(() => deleteTrainingMax(tm.id)).toThrow("doesn't exist");
  });
});
