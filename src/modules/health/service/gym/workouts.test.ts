import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/modules/core/db/client";
import { setupTestDb, teardownTestDb } from "@/test/db";
import { gymExercises } from "../../db/schema/gym/exercises";
import type { EntryTarget, PlannedSet } from "../../engine/types";
import type { ExerciseMode } from "../../gym-types";
import {
  addSet,
  addWorkoutEntry,
  completeSet,
  createWorkout,
  deleteSet,
  deleteWorkout,
  discardWorkout,
  finishWorkout,
  getActiveWorkout,
  getWorkout,
  listWorkoutDates,
  listWorkouts,
  removeWorkoutEntry,
  reorderWorkoutEntries,
  uncompleteSet,
  updateSet,
  updateWorkoutEntry,
  updateWorkoutMeta,
  type NewWorkoutEntryInput,
} from "./workouts";

beforeEach(setupTestDb);
afterEach(teardownTestDb);

function insertExercise(name: string, mode: ExerciseMode = "reps", isBodyweight = false) {
  return getDb()
    .insert(gymExercises)
    .values({
      name,
      bodyPart: "chest",
      equipment: "barbell",
      target: "pectorals",
      secondaryMuscles: ["triceps"],
      defaultMode: mode,
      isBodyweight,
      isCustom: true,
    })
    .returning()
    .get().id;
}

const target = (over: Partial<EntryTarget> = {}): EntryTarget => ({
  mode: "reps",
  sets: 3,
  reps: 5,
  repsMin: null,
  weightKg: 100,
  durationSec: null,
  distanceKm: null,
  targetRpe: null,
  ...over,
});

const planned = (
  weightKg: number | null,
  reps: number | null,
  kind: PlannedSet["kind"] = "working",
): PlannedSet => ({
  kind,
  weightKg,
  reps,
  durationSec: null,
  distanceKm: null,
});

function entry(
  exerciseId: number,
  sets: PlannedSet[],
  over: Partial<NewWorkoutEntryInput> = {},
): NewWorkoutEntryInput {
  return {
    exerciseId,
    routineExerciseId: null,
    mode: "reps",
    supersetGroup: null,
    perSide: false,
    isBodyweight: false,
    target: target(),
    restSec: 120,
    progressionPolicy: "linear",
    prescriptionKind: "up",
    prescriptionReason: "Hit every rep last time — +2.5 kg.",
    notes: null,
    sets,
    ...over,
  };
}

function start(date: string, entries: NewWorkoutEntryInput[], time = "18:00:00") {
  return createWorkout({
    date,
    startedAt: `${date}T${time}`,
    routineId: null,
    name: "Push",
    programId: null,
    programWeek: null,
    entries,
  });
}

/** Starts, completes the given set indexes of every entry, and finishes. */
function logFinished(date: string, entries: NewWorkoutEntryInput[], minutes = 60) {
  const workout = start(date, entries);
  for (const e of workout.entries) {
    for (const set of e.sets) completeSet(set.id);
  }
  const end = new Date(2000, 0, 1, 18, minutes);
  const finishedAt = `${date}T${String(end.getHours()).padStart(2, "0")}:${String(end.getMinutes()).padStart(2, "0")}:00`;
  finishWorkout(workout.id, { finishedAt });
  return workout;
}

describe("live workout", () => {
  it("creates, completes sets and finishes a session", () => {
    const bench = insertExercise("Bench Press");
    const plank = insertExercise("Plank", "time", true);

    const created = start("2026-10-01", [
      entry(bench, [planned(60, 5, "warmup"), planned(100, 5), planned(100, 5)]),
      entry(
        plank,
        [{ kind: "working", weightKg: null, reps: null, durationSec: 60, distanceKm: null }],
        {
          mode: "time",
          isBodyweight: true,
          target: target({ mode: "time", sets: 1, reps: null, weightKg: null, durationSec: 60 }),
          progressionPolicy: "time",
          prescriptionKind: "first",
        },
      ),
    ]);

    const active = getActiveWorkout();
    expect(active?.id).toBe(created.id);
    expect(active?.finishedAt).toBeNull();
    expect(active?.entries.map((e) => e.exercise.name)).toEqual(["Bench Press", "Plank"]);
    const [benchEntry, plankEntry] = active!.entries;
    expect(benchEntry).toMatchObject({
      position: 0,
      mode: "reps",
      restSec: 120,
      prescriptionKind: "up",
      prescriptionReason: "Hit every rep last time — +2.5 kg.",
      target: target(),
      exercise: { name: "Bench Press", bodyPart: "chest", secondaryMuscles: ["triceps"] },
    });
    expect(benchEntry.sets.map((s) => [s.kind, s.weightKg, s.reps, s.completed])).toEqual([
      ["warmup", 60, 5, false],
      ["working", 100, 5, false],
      ["working", 100, 5, false],
    ]);
    expect(plankEntry.target).toMatchObject({ mode: "time", durationSec: 60 });

    const done = completeSet(benchEntry.sets[1].id, { reps: 4, rpe: 9 });
    expect(done).toMatchObject({ completed: true, reps: 4, rpe: 9, weightKg: 100 });
    expect(done.completedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);

    const finished = finishWorkout(created.id, {
      sessionRpe: 8,
      notes: "  felt strong  ",
      finishedAt: "2026-10-01T19:05:00",
    });
    expect(finished).toMatchObject({
      finishedAt: "2026-10-01T19:05:00",
      sessionRpe: 8,
      notes: "felt strong",
    });
    expect(getActiveWorkout()).toBeNull();
    // Uncompleted sets stay, marked as not done.
    expect(getWorkout(created.id).entries[0].sets.filter((s) => !s.completed)).toHaveLength(2);
  });

  it("allows only one workout in progress", () => {
    const bench = insertExercise("Bench Press");
    const first = start("2026-10-01", [entry(bench, [planned(100, 5)])]);

    expect(() => start("2026-10-01", [])).toThrow(
      "Finish or discard the workout in progress first.",
    );

    discardWorkout(first.id);
    expect(() => getWorkout(first.id)).toThrow("no longer exists");
    const second = start("2026-10-01", []);
    expect(getActiveWorkout()?.id).toBe(second.id);
  });

  it("refuses to finish without a completed set, twice, or with a bad RPE", () => {
    const bench = insertExercise("Bench Press");
    const workout = start("2026-10-01", [entry(bench, [planned(100, 5)])]);

    expect(() => finishWorkout(workout.id)).toThrow("discard");
    completeSet(workout.entries[0].sets[0].id);
    expect(() => finishWorkout(workout.id, { sessionRpe: 11 })).toThrow("Session RPE");
    expect(() => finishWorkout(workout.id, { finishedAt: "2026-10-01T17:00:00" })).toThrow(
      "before it started",
    );
    finishWorkout(workout.id, { finishedAt: "2026-10-01T19:00:00" });
    expect(() => finishWorkout(workout.id)).toThrow("already finished");
    expect(() => discardWorkout(workout.id)).toThrow("delete it from history");
  });

  it("adds exercises and sets, copying the last set's values but not its completion", () => {
    const bench = insertExercise("Bench Press");
    const plank = insertExercise("Plank", "time", true);
    const workout = start("2026-10-01", [entry(bench, [planned(100, 5)])]);

    const added = addWorkoutEntry(workout.id, plank);
    expect(added).toMatchObject({ position: 1, mode: "time", isBodyweight: true });
    const plankEntry = getWorkout(workout.id).entries[1];
    expect(plankEntry.target).toBeNull();
    expect(plankEntry.sets).toMatchObject([
      { kind: "working", durationSec: null, completed: false },
    ]);

    const firstSet = getWorkout(workout.id).entries[0].sets[0];
    completeSet(firstSet.id, { reps: 5, rir: 2 });
    const copy = addSet(workout.entries[0].id);
    expect(copy).toMatchObject({
      position: 1,
      weightKg: 100,
      reps: 5,
      rir: null,
      completed: false,
      completedAt: null,
    });
    const heavier = addSet(workout.entries[0].id, { weightKg: 102.5 });
    expect(heavier).toMatchObject({ position: 2, weightKg: 102.5, reps: 5 });

    expect(() => updateSet(copy.id, { reps: 1001 })).toThrow("Reps");
    expect(() => updateSet(copy.id, { reps: 2.5 })).toThrow("whole number");
    expect(() => updateSet(copy.id, { weightKg: -1 })).toThrow("negative");
    expect(() => updateSet(copy.id, { rpe: 0 })).toThrow("RPE");
    expect(() => updateSet(copy.id, { rir: 11 })).toThrow("RIR");
    expect(updateSet(copy.id, { kind: "drop", weightKg: 80, reps: null })).toMatchObject({
      kind: "drop",
      weightKg: 80,
      reps: null,
    });

    expect(uncompleteSet(firstSet.id)).toMatchObject({ completed: false, completedAt: null });
    deleteSet(heavier.id);
    expect(getWorkout(workout.id).entries[0].sets.map((s) => s.id)).toEqual([firstSet.id, copy.id]);
  });

  it("reorders, edits and removes entries", () => {
    const bench = insertExercise("Bench Press");
    const press = insertExercise("Overhead Press");
    const workout = start("2026-10-01", [
      entry(bench, [planned(100, 5)]),
      entry(press, [planned(50, 5), planned(50, 5)]),
    ]);
    const [a, b] = workout.entries.map((e) => e.id);

    reorderWorkoutEntries(workout.id, [b, a]);
    expect(getWorkout(workout.id).entries.map((e) => e.id)).toEqual([b, a]);
    expect(() => reorderWorkoutEntries(workout.id, [b])).toThrow("reload");
    expect(() => reorderWorkoutEntries(workout.id, [b, b])).toThrow("reload");

    expect(
      updateWorkoutEntry(a, { notes: " pause reps ", restSec: 180, supersetGroup: 1 }),
    ).toMatchObject({
      notes: "pause reps",
      restSec: 180,
      supersetGroup: 1,
    });
    expect(() => updateWorkoutEntry(a, { restSec: -5 })).toThrow("negative");

    removeWorkoutEntry(b);
    expect(getWorkout(workout.id).entries.map((e) => e.id)).toEqual([a]);
    expect(() => removeWorkoutEntry(b)).toThrow("no longer in the workout");
  });
});

describe("workout history", () => {
  it("lists finished workouts newest first with SQL totals", () => {
    const bench = insertExercise("Bench Press");
    const press = insertExercise("Overhead Press");
    logFinished(
      "2026-09-01",
      [entry(bench, [planned(60, 5, "warmup"), planned(100, 5), planned(100, 3)])],
      45,
    );
    const second = start("2026-09-03", [
      entry(bench, [planned(100, 5), planned(100, 5)]),
      entry(press, [planned(50, 8)]),
      entry(bench, [planned(80, 10)]),
    ]);
    completeSet(second.entries[0].sets[0].id);
    completeSet(second.entries[1].sets[0].id);
    // second.entries[0].sets[1] and the back-off entry stay uncompleted
    finishWorkout(second.id, { finishedAt: "2026-09-03T19:30:00" });
    start("2026-09-05", [entry(bench, [planned(100, 5)])]); // in progress — not history

    const { rows, total } = listWorkouts();
    expect(total).toBe(2);
    expect(rows.map((r) => r.date)).toEqual(["2026-09-03", "2026-09-01"]);
    expect(rows[0]).toMatchObject({
      setsCompleted: 2,
      tonnageKg: 500 + 400,
      durationMin: 90,
      exerciseCount: 2,
    });
    // Warm-up excluded from tonnage, counted as a completed set.
    expect(rows[1]).toMatchObject({
      setsCompleted: 3,
      tonnageKg: 800,
      durationMin: 45,
      exerciseCount: 1,
    });

    const page = listWorkouts({ limit: 1, offset: 1 });
    expect(page.rows.map((r) => r.date)).toEqual(["2026-09-01"]);
    expect(page.total).toBe(2);
    expect(listWorkouts({ from: "2026-09-02" }).rows.map((r) => r.date)).toEqual(["2026-09-03"]);
    expect(listWorkouts({ to: "2026-09-02" }).total).toBe(1);

    expect(listWorkoutDates("2026-09-01", "2026-09-30")).toEqual(["2026-09-01", "2026-09-03"]);
  });

  it("edits a finished workout's details, moving its times with its date", () => {
    const bench = insertExercise("Bench Press");
    const workout = logFinished("2026-09-01", [entry(bench, [planned(100, 5)])], 50);

    const moved = updateWorkoutMeta(workout.id, {
      name: " Push A ",
      date: "2026-08-30",
      notes: null,
      sessionRpe: 7.5,
    });
    expect(moved).toMatchObject({
      name: "Push A",
      date: "2026-08-30",
      startedAt: "2026-08-30T18:00:00",
      finishedAt: "2026-08-30T18:50:00",
      sessionRpe: 7.5,
    });
    expect(() => updateWorkoutMeta(workout.id, { name: "  " })).toThrow("name is required");
    expect(() => updateWorkoutMeta(workout.id, { date: "2026-02-30" })).toThrow("calendar date");

    // History edits to sets are allowed.
    const setId = getWorkout(workout.id).entries[0].sets[0].id;
    expect(updateSet(setId, { reps: 6 }).reps).toBe(6);

    deleteWorkout(workout.id);
    expect(listWorkouts().total).toBe(0);
  });
});

describe("weight carry-forward", () => {
  it("fills later empty weights of the same kind when a set is completed", () => {
    const exerciseId = insertExercise("Bench");
    const workout = start("2026-10-01", [
      entry(exerciseId, [
        planned(null, 5, "warmup"),
        planned(null, 5),
        planned(null, 5),
        planned(70, 5),
      ]),
    ]);
    const [, first, second] = workout.entries[0].sets;
    completeSet(first.id, { weightKg: 60, reps: 5 });
    const sets = getWorkout(workout.id).entries[0].sets;
    // The warm-up above is a different kind and the 70 kg set already had a weight.
    expect(sets.map((s) => s.weightKg)).toEqual([null, 60, 60, 70]);
    expect(sets.find((s) => s.id === second.id)?.completed).toBe(false);
  });
});
