import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/modules/core/db/client";
import { addDays, todayIso } from "@/lib/dates";
import { setupTestDb, teardownTestDb } from "@/test/db";
import { gymExercises } from "../../db/schema/gym/exercises";
import { ensureExerciseCatalog } from "./catalog";
import { addRoutineEntry, createRoutine } from "./routines";
import { createProgram } from "./programs";
import { setTrainingMax } from "./training-maxes";
import { completeSet, finishWorkout, getWorkout } from "./workouts";
import { getLatestBodyweight } from "./vitals";
import { addWarmupSets, buildSessionPlan, startWorkout } from "./session-plan";

beforeEach(setupTestDb);
afterEach(teardownTestDb);

function exerciseId(name: string): number {
  ensureExerciseCatalog();
  const row = getDb().select().from(gymExercises).where(eq(gymExercises.name, name)).get();
  if (!row) throw new Error(`no catalog exercise ${name}`);
  return row.id;
}

/** Logs every planned working set exactly as prescribed, then finishes. */
function doEverySet(workoutId: number, override: { reps?: number } = {}) {
  for (const entry of getWorkout(workoutId).entries) {
    for (const set of entry.sets) {
      completeSet(set.id, { weightKg: set.weightKg, reps: override.reps ?? set.reps });
    }
  }
  finishWorkout(workoutId);
}

function benchRoutine(entry: Parameters<typeof addRoutineEntry>[2] = {}) {
  const routine = createRoutine({ name: "Push", progressionPolicy: "linear" });
  addRoutineEntry(routine.id, exerciseId("Barbell Bench Press"), {
    sets: 3,
    reps: 5,
    weightKg: 60,
    ...entry,
  });
  return routine;
}

const today = todayIso();

describe("session plans", () => {
  it("prescribes the plan first, then progresses after a fully completed session", () => {
    const routine = benchRoutine();
    const first = buildSessionPlan(routine.id, addDays(today, -2));
    expect(first.entries[0].prescription.kind).toBe("first");
    expect(first.entries[0].sets.map((s) => s.weightKg)).toEqual([60, 60, 60]);

    const workout = startWorkout({ routineId: routine.id, date: addDays(today, -2) });
    expect(workout.entries[0].target).toMatchObject({ reps: 5, weightKg: 60, sets: 3 });
    doEverySet(workout.id);

    const next = buildSessionPlan(routine.id, today);
    expect(next.entries[0].prescription.kind).toBe("up");
    expect(next.entries[0].sets.map((s) => s.weightKg)).toEqual([62.5, 62.5, 62.5]);
  });

  it("holds the weight after missed reps", () => {
    const routine = benchRoutine();
    const workout = startWorkout({ routineId: routine.id, date: addDays(today, -2) });
    doEverySet(workout.id, { reps: 3 });
    const next = buildSessionPlan(routine.id, today);
    expect(next.entries[0].prescription.kind).toBe("hold");
    expect(next.entries[0].sets[0].weightKg).toBe(60);
  });

  it("applies a training block's deload week on top of progression", () => {
    const routine = benchRoutine({ sets: 4 });
    createProgram({
      name: "Block 1",
      kind: "block",
      startDate: addDays(today, -21),
      weeks: 4,
      setRampPerWeek: 0,
      deloadFinalWeek: true,
    });
    const plan = buildSessionPlan(routine.id, today);
    expect(plan.program?.modifiers?.isDeload).toBe(true);
    const working = plan.entries[0].sets.filter((s) => s.kind !== "warmup");
    expect(working).toHaveLength(2);
    expect(working[0].weightKg).toBe(55); // 60 × 0.9 = 54 → nearest 2.5 step
    expect(plan.entries[0].prescription.reason).toMatch(/deload/i);
  });

  it("loads 5/3/1 entries from the training max when a 5/3/1 program is active", () => {
    const routine = benchRoutine({ scheme: "wendler_main" });
    createProgram({ name: "531", kind: "wendler", startDate: today, weeks: 16 });
    setTrainingMax({
      exerciseId: exerciseId("Barbell Bench Press"),
      trainingMaxKg: 100,
      effectiveFrom: today,
    });
    const entry = buildSessionPlan(routine.id, today).entries[0];
    expect(entry.prescription.kind).toBe("program");
    expect(entry.sets.map((s) => [s.weightKg, s.reps, s.kind])).toEqual([
      [65, 5, "working"],
      [75, 5, "working"],
      [85, 5, "amrap"],
    ]);
    expect(entry.target).toMatchObject({ reps: 5, weightKg: 85, sets: 3 });
  });

  it("falls back to normal targets for a 5/3/1 entry without a training max", () => {
    const routine = benchRoutine({ scheme: "wendler_main" });
    createProgram({ name: "531", kind: "wendler", startDate: today, weeks: 16 });
    const entry = buildSessionPlan(routine.id, today).entries[0];
    expect(entry.prescription.reason).toMatch(/Set a training max/);
    expect(entry.sets[0].weightKg).toBe(60);
  });

  it("autoregulates the load from recent performance when a target RPE is set", () => {
    const routine = benchRoutine({ targetRpe: 8, sets: 3, reps: 5 });
    const workout = startWorkout({ routineId: routine.id, date: addDays(today, -3) });
    doEverySet(workout.id);
    const entry = buildSessionPlan(routine.id, today).entries[0];
    expect(entry.prescription.kind).toBe("autoreg");
    expect(entry.sets[0].weightKg).toBeGreaterThan(0);
    expect(entry.target.targetRpe).toBe(8);
  });
});

describe("startWorkout", () => {
  it("opens an empty quick workout and logs the weigh-in", () => {
    const workout = startWorkout({ bodyweightKg: 81.4 });
    expect(workout).toMatchObject({ name: "Quick workout", routineId: null, finishedAt: null });
    expect(workout.entries).toEqual([]);
    expect(getLatestBodyweight()).toMatchObject({ date: today, weightKg: 81.4 });
  });

  it("refuses a second session without logging its weigh-in", () => {
    startWorkout();
    expect(() => startWorkout({ bodyweightKg: 90 })).toThrow(/in progress/);
    expect(getLatestBodyweight()).toBeNull();
  });
});

describe("addWarmupSets", () => {
  it("ramps up to the first working set, before it, once", () => {
    const routine = benchRoutine({ weightKg: 100 });
    const workout = startWorkout({ routineId: routine.id });
    const entry = workout.entries[0];
    const added = addWarmupSets(entry.id);
    expect(added).toBeGreaterThan(0);
    const sets = getWorkout(workout.id).entries[0].sets;
    expect(sets.slice(0, added).every((s) => s.kind === "warmup")).toBe(true);
    expect(sets.slice(added).every((s) => s.kind !== "warmup")).toBe(true);
    expect(sets.map((s) => s.position)).toEqual(sets.map((_, i) => i));
    expect(() => addWarmupSets(entry.id)).toThrow(/already/);
  });
});
