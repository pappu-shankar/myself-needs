import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/modules/core/db/client";
import { setupTestDb, teardownTestDb } from "@/test/db";
import { gymExercises } from "../../db/schema/gym/exercises";
import type { EntryTarget, PlannedSet } from "../../engine/types";
import {
  getExerciseHistory,
  getExerciseSessions,
  getRecentSessionsByExercise,
  getWorkoutRecords,
} from "./history";
import { completeSet, createWorkout, finishWorkout, type NewWorkoutEntryInput } from "./workouts";

beforeEach(setupTestDb);
afterEach(teardownTestDb);

function insertExercise(name: string, target: string, secondaryMuscles: string[] = []) {
  return getDb()
    .insert(gymExercises)
    .values({ name, bodyPart: "chest", equipment: "barbell", target, secondaryMuscles })
    .returning()
    .get().id;
}

const NO_TARGET: EntryTarget = {
  mode: "reps",
  sets: null,
  reps: null,
  repsMin: null,
  weightKg: null,
  durationSec: null,
  distanceKm: null,
  targetRpe: null,
};

const set = (weightKg: number, reps: number, kind: PlannedSet["kind"] = "working"): PlannedSet => ({
  kind,
  weightKg,
  reps,
  durationSec: null,
  distanceKm: null,
});

function entry(
  exerciseId: number,
  sets: PlannedSet[],
  target: EntryTarget | null = { ...NO_TARGET, sets: sets.length, reps: 5, weightKg: 100 },
): NewWorkoutEntryInput {
  return {
    exerciseId,
    routineExerciseId: null,
    mode: "reps",
    supersetGroup: null,
    perSide: false,
    isBodyweight: false,
    target: target ?? NO_TARGET,
    restSec: null,
    progressionPolicy: null,
    prescriptionKind: null,
    prescriptionReason: null,
    notes: null,
    sets,
  };
}

/** Logs a finished workout, completing all but the sets listed in `skip` (by entry, set index). */
function log(date: string, entries: NewWorkoutEntryInput[], skip: Array<[number, number]> = []) {
  const workout = createWorkout({
    date,
    startedAt: `${date}T07:00:00`,
    routineId: null,
    name: `Workout ${date}`,
    programId: null,
    programWeek: null,
    entries,
  });
  workout.entries.forEach((e, ei) =>
    e.sets.forEach((s, si) => {
      if (!skip.some(([a, b]) => a === ei && b === si)) completeSet(s.id);
    }),
  );
  finishWorkout(workout.id, { finishedAt: `${date}T08:00:00` });
  return workout.id;
}

describe("exercise sessions (engine input)", () => {
  it("returns finished sessions oldest first, with targets, legacy nulls and skipped sets", () => {
    const bench = insertExercise("Bench Press", "pectorals");
    const legacyId = log("2026-09-01", [entry(bench, [set(95, 5)], null)]);
    const secondId = log("2026-09-03", [entry(bench, [set(100, 5), set(100, 5)])], [[0, 1]]);
    const thirdId = log("2026-09-05", [entry(bench, [set(102.5, 5)])]);
    // An in-progress workout is never history.
    createWorkout({
      date: "2026-09-07",
      startedAt: "2026-09-07T07:00:00",
      routineId: null,
      name: "Live",
      programId: null,
      programWeek: null,
      entries: [entry(bench, [set(105, 5)])],
    });

    const sessions = getExerciseSessions(bench);
    expect(sessions.map((s) => s.workoutId)).toEqual([legacyId, secondId, thirdId]);
    expect(sessions[0]).toEqual({
      workoutId: legacyId,
      date: "2026-09-01",
      target: null,
      sets: [
        {
          kind: "working",
          weightKg: 95,
          reps: 5,
          durationSec: null,
          distanceKm: null,
          rir: null,
          rpe: null,
          completed: true,
        },
      ],
    });
    expect(sessions[1].target).toEqual({ ...NO_TARGET, sets: 2, reps: 5, weightKg: 100 });
    expect(sessions[1].sets.map((s) => s.completed)).toEqual([true, false]);

    expect(getExerciseSessions(bench, { limit: 2 }).map((s) => s.workoutId)).toEqual([
      secondId,
      thirdId,
    ]);
    expect(
      getExerciseSessions(bench, { beforeWorkoutId: thirdId }).map((s) => s.workoutId),
    ).toEqual([legacyId, secondId]);
    expect(() => getExerciseSessions(bench, { beforeWorkoutId: 9999 })).toThrow("no longer exists");
  });

  it("merges an exercise logged twice in one workout into one session", () => {
    const bench = insertExercise("Bench Press", "pectorals");
    const id = log("2026-09-01", [entry(bench, [set(100, 5)]), entry(bench, [set(80, 10)], null)]);

    const [session] = getExerciseSessions(bench);
    expect(session.workoutId).toBe(id);
    expect(session.target?.weightKg).toBe(100);
    expect(session.sets.map((s) => s.weightKg)).toEqual([100, 80]);
  });

  it("fetches the last N sessions of several exercises at once", () => {
    const bench = insertExercise("Bench Press", "pectorals");
    const squat = insertExercise("Squat", "quads");
    const unused = insertExercise("Curl", "biceps");
    const w1 = log("2026-09-01", [entry(bench, [set(100, 5)]), entry(squat, [set(140, 5)])]);
    const w2 = log("2026-09-03", [entry(bench, [set(102.5, 5)])]);
    const w3 = log("2026-09-05", [entry(bench, [set(105, 5)]), entry(squat, [set(145, 5)])]);

    const map = getRecentSessionsByExercise([bench, squat, unused, bench], 2);
    expect([...map.keys()]).toEqual([bench, squat, unused]);
    expect(map.get(bench)!.map((s) => s.workoutId)).toEqual([w2, w3]);
    expect(map.get(squat)!.map((s) => [s.workoutId, s.sets[0].weightKg])).toEqual([
      [w1, 140],
      [w3, 145],
    ]);
    expect(map.get(unused)).toEqual([]);
    expect(getRecentSessionsByExercise([]).size).toBe(0);
  });
});

describe("workout records (analytics input)", () => {
  it("returns finished workouts in range, oldest first, with muscles and sets", () => {
    const bench = insertExercise("Bench Press", "pectorals", ["triceps", "delts"]);
    const squat = insertExercise("Squat", "quads", ["glutes"]);
    log("2026-08-31", [entry(bench, [set(100, 5)])]);
    const id = log(
      "2026-09-02",
      [entry(squat, [set(60, 5, "warmup"), set(140, 5)]), entry(bench, [set(100, 5)])],
      [[1, 0]],
    );
    log("2026-09-04", [entry(squat, [set(145, 5)])]);

    const records = getWorkoutRecords({ from: "2026-09-01", to: "2026-09-03" });
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      id,
      date: "2026-09-02",
      startedAt: "2026-09-02T07:00:00",
      finishedAt: "2026-09-02T08:00:00",
      sessionRpe: null,
    });
    expect(records[0].entries.map((e) => [e.exerciseName, e.mode, e.isBodyweight])).toEqual([
      ["Squat", "reps", false],
      ["Bench Press", "reps", false],
    ]);
    expect(records[0].entries[0].muscles).toEqual({ quadriceps: 1, gluteal: 0.5 });
    expect(records[0].entries[1].muscles).toEqual({ chest: 1, triceps: 0.5, deltoids: 0.5 });
    expect(records[0].entries[0].sets.map((s) => [s.kind, s.completed])).toEqual([
      ["warmup", true],
      ["working", true],
    ]);
    expect(records[0].entries[1].sets[0].completed).toBe(false);

    expect(getWorkoutRecords({ from: "2026-08-01", to: "2026-09-30" }).map((r) => r.date)).toEqual([
      "2026-08-31",
      "2026-09-02",
      "2026-09-04",
    ]);
    expect(() => getWorkoutRecords({ from: "nope", to: "2026-09-30" })).toThrow("calendar date");
  });
});

describe("exercise history table", () => {
  it("pages an exercise's sessions newest first with per-session totals", () => {
    const bench = insertExercise("Bench Press", "pectorals");
    const other = insertExercise("Row", "lats");
    log("2026-09-01", [entry(bench, [set(60, 5, "warmup"), set(100, 5), set(100, 4)])]);
    const latest = log(
      "2026-09-03",
      [entry(other, [set(70, 8)]), entry(bench, [set(102.5, 5), set(102.5, 5)])],
      [[1, 1]],
    );

    const { rows, total } = getExerciseHistory(bench);
    expect(total).toBe(2);
    expect(rows[0]).toMatchObject({
      workoutId: latest,
      workoutName: "Workout 2026-09-03",
      date: "2026-09-03",
      setsCompleted: 1,
      tonnageKg: 512.5,
      topWeightKg: 102.5,
      totalReps: 5,
    });
    expect(rows[0].sets.map((s) => s.completed)).toEqual([true, false]);
    expect(rows[1]).toMatchObject({
      date: "2026-09-01",
      setsCompleted: 3,
      tonnageKg: 900,
      topWeightKg: 100,
      totalReps: 9,
    });
    expect(rows[1].sets).toHaveLength(3);

    const page = getExerciseHistory(bench, { limit: 1, offset: 1 });
    expect(page.rows.map((r) => r.date)).toEqual(["2026-09-01"]);
    expect(page.total).toBe(2);
  });
});
