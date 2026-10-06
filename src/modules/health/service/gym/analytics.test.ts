import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/modules/core/db/client";
import { addDays, todayIso } from "@/lib/dates";
import { setupTestDb, teardownTestDb } from "@/test/db";
import { gymExercises } from "../../db/schema/gym/exercises";
import { ensureExerciseCatalog } from "./catalog";
import { addRoutineEntry, createRoutine } from "./routines";
import { setScheduleOverride } from "./schedule";
import { updateGymSettings } from "./settings";
import { completeSet, finishWorkout, getWorkout } from "./workouts";
import { logBodyweight } from "./vitals";
import { upsertReadinessCheckin } from "./readiness";
import { startWorkout } from "./session-plan";
import {
  getBodyOverview,
  getExerciseOverview,
  getGymStats,
  getReadiness,
  getRecentRecords,
  getWorkoutSummary,
} from "./analytics";
import { getGymInsights } from "./insights/engine";
import { buildGymSnapshot } from "./insights/snapshot";
import { getGymOverview } from "./overview";

beforeEach(setupTestDb);
afterEach(teardownTestDb);

const today = todayIso();

function exerciseId(name: string): number {
  ensureExerciseCatalog();
  const row = getDb().select().from(gymExercises).where(eq(gymExercises.name, name)).get();
  if (!row) throw new Error(`no catalog exercise ${name}`);
  return row.id;
}

/** A finished bench session `daysAgo` days back at `weightKg` × 5 × 3. */
function benchSession(routineId: number, daysAgo: number, weightKg: number) {
  const workout = startWorkout({ routineId, date: addDays(today, -daysAgo) });
  for (const set of workout.entries[0].sets) completeSet(set.id, { weightKg, reps: 5 });
  finishWorkout(workout.id);
  return workout.id;
}

function benchRoutine() {
  const routine = createRoutine({ name: "Push", progressionPolicy: "linear" });
  addRoutineEntry(routine.id, exerciseId("Barbell Bench Press"), {
    sets: 3,
    reps: 5,
    weightKg: 80,
  });
  return routine;
}

describe("gym analytics", () => {
  it("works on an empty vault", () => {
    const stats = getGymStats("month", today);
    expect(stats.totals).toEqual({ sessions: 0, minutes: 0, sets: 0, tonnageKg: 0 });
    expect(stats.heatmap.length % 7).toBe(0);
    expect(stats.muscles.worked).toEqual([]);
    expect(getReadiness(today).score).toBeNull();
    expect(getGymInsights(today)).toEqual([]);
    expect(getGymOverview(today)).toMatchObject({
      active: null,
      preview: null,
      sessionsThisWeek: 0,
    });
  });

  it("aggregates totals, muscles and tonnage for a range", () => {
    const routine = benchRoutine();
    benchSession(routine.id, 3, 80);
    benchSession(routine.id, 1, 82.5);
    const stats = getGymStats("month", today);
    expect(stats.totals.sessions).toBe(2);
    expect(stats.totals.sets).toBe(6);
    expect(stats.totals.tonnageKg).toBe(Math.round(80 * 15 + 82.5 * 15));
    expect(stats.muscles.worked[0]).toBe("chest");
    expect(stats.muscles.load.chest).toBe(6);
    expect(stats.volume.find((v) => v.muscle === "chest")?.hardSets).toBe(6);
  });

  it("summarizes a workout with the PRs it set against earlier sessions", () => {
    const routine = benchRoutine();
    const first = benchSession(routine.id, 3, 80);
    const second = benchSession(routine.id, 1, 85);
    expect(getWorkoutSummary(first).entries[0]).toMatchObject({ firstTime: true, records: [] });
    const summary = getWorkoutSummary(second);
    expect(summary.entries[0].firstTime).toBe(false);
    expect(summary.entries[0].records.map((r) => r.type)).toEqual(
      expect.arrayContaining(["heaviest", "e1rm"]),
    );
    expect(summary.recordCount).toBeGreaterThan(0);
    expect(summary.setsCompleted).toBe(3);
    expect(summary.muscles.worked).toContain("chest");
    expect(getRecentRecords(today, 7).some((r) => r.exerciseName === "Barbell Bench Press")).toBe(
      true,
    );
  });

  it("builds an exercise overview with records, e1RM curve and rep maxes", () => {
    const routine = benchRoutine();
    benchSession(routine.id, 2, 100);
    const overview = getExerciseOverview(exerciseId("Barbell Bench Press"), { today });
    expect(overview.sessionCount).toBe(1);
    expect(overview.bestRecentE1rm?.e1rmKg).toBeCloseTo(116.7, 1); // Epley: 100 × (1 + 5/30)
    expect(overview.repMaxes[0]).toMatchObject({ reps: 1 });
    expect(overview.history.total).toBe(1);
    expect(overview.muscles.chest).toBe(1);
  });

  it("rates strength and body composition from settings, weigh-ins and tape", () => {
    updateGymSettings({ sex: "male", heightCm: 180 });
    logBodyweight(today, 80);
    const routine = benchRoutine();
    benchSession(routine.id, 2, 100);
    const body = getBodyOverview(today);
    const bench = body.strength.standards?.find((s) => s.lift === "bench");
    expect(bench?.e1rmKg).toBeCloseTo(116.7, 1);
    expect(bench?.level).toBe("intermediate"); // 1.46 × bodyweight
    expect(body.strength.dots).toBeNull(); // no squat/deadlift yet
    expect(body.composition.bmi).toBeCloseTo(24.7, 1);
  });

  it("scores readiness from the check-in, sleep and load", () => {
    upsertReadinessCheckin(today, {
      sleepQuality: 5,
      energy: 5,
      soreness: 1,
      stress: 1,
      motivation: 5,
    });
    const readiness = getReadiness(today);
    expect(readiness.score).toBeGreaterThanOrEqual(80);
    expect(readiness.band).toBe("push");
  });

  it("builds a coherent insights snapshot from real data", () => {
    const routine = benchRoutine();
    benchSession(routine.id, 1, 80);
    setScheduleOverride(addDays(today, -1), routine.id);
    setScheduleOverride(today, routine.id);
    const snapshot = buildGymSnapshot(today);
    expect(snapshot.loggedToday).toBe(false);
    expect(snapshot.missedYesterday).toBeNull(); // yesterday's session was logged
    expect(snapshot.plannedToday).toMatchObject({ routineName: "Push" });
    expect(snapshot.trainedRecently).toContain("chest");
    expect(() => getGymInsights(today)).not.toThrow();
  });

  it("keeps the active workout out of history-based numbers until it's finished", () => {
    const routine = benchRoutine();
    const open = startWorkout({ routineId: routine.id });
    completeSet(getWorkout(open.id).entries[0].sets[0].id, { weightKg: 80, reps: 5 });
    expect(getGymStats("week", today).totals.sessions).toBe(0);
    expect(getGymOverview(today).active).toMatchObject({ id: open.id, setsDone: 1, setsTotal: 3 });
  });
});

describe("hard-sets muscle map", () => {
  it("counts only sets rated within 3 reps of failure", () => {
    const routine = benchRoutine();
    const workout = startWorkout({ routineId: routine.id, date: addDays(today, -1) });
    const [a, b, c] = workout.entries[0].sets;
    completeSet(a.id, { weightKg: 80, reps: 5, rir: 1 });
    completeSet(b.id, { weightKg: 80, reps: 5, rpe: 6 });
    completeSet(c.id, { weightKg: 80, reps: 5 });
    finishWorkout(workout.id);
    const stats = getGymStats("week", today);
    expect(stats.muscles.load.chest).toBe(3);
    expect(stats.hardMuscles.load.chest).toBe(1);
  });
});
