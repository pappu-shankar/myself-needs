import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/modules/core/db/client";
import { setupTestDb, teardownTestDb } from "@/test/db";
import { gymExercises } from "../../db/schema/gym/exercises";
import { gymRoutineExercises, gymRoutines } from "../../db/schema/gym/routines";
import { gymWeekSchedule } from "../../db/schema/gym/schedule";
import { gymWorkoutExercises, gymWorkoutSets, gymWorkouts } from "../../db/schema/gym/workouts";
import { healthMetrics } from "../../db/schema/metrics";
import { parseBackup } from "../../importers/backup";
import { parseHevy } from "../../importers/hevy";
import { parsePlanFile } from "../../importers/plan-file";
import { parseStrong } from "../../importers/strong";
import type { ImportedWorkout } from "../../importers/types";
import { ensureExerciseCatalog } from "./catalog";
import {
  exportBackup,
  exportPlanFile,
  importBackup,
  importPlanFile,
  importWeighIns,
  importWorkouts,
} from "./import";

beforeEach(setupTestDb);
afterEach(teardownTestDb);

const STRONG = [
  "Date,Workout Name,Duration,Exercise Name,Set Order,Weight,Reps,Distance,Seconds,Notes,Workout Notes,RPE",
  "2024-05-01 07:30:00,Push Day,1h 5m,Bench Press (Barbell),W,40,10,0,0,,,",
  "2024-05-01 07:30:00,Push Day,1h 5m,Bench Press (Barbell),1,60,8,0,0,,,8",
  "2024-05-01 07:30:00,Push Day,1h 5m,Plank,1,0,0,0,60,,,",
  "2024-05-01 07:30:00,Push Day,1h 5m,Zercher Gorilla Carry Thing,1,50,10,0,0,,,",
  "2024-05-03 18:00:00,Run,45m,Treadmill Hill Intervals,1,0,0,5,1500,,,",
].join("\n");

const workouts = () => parseStrong(STRONG).workouts;

describe("importWorkouts", () => {
  it("imports history, matching names to the catalog and creating customs for the rest", () => {
    const result = importWorkouts(workouts(), "strong");
    expect(result).toMatchObject({ created: 2, skipped: 0 });
    expect(result.matched).toContainEqual({
      from: "Bench Press (Barbell)",
      to: "Barbell Bench Press",
    });
    expect(result.unmatched).toEqual(
      expect.arrayContaining(["Zercher Gorilla Carry Thing", "Treadmill Hill Intervals"]),
    );
    expect(result.exercisesCreated).toBe(result.unmatched.length);

    const customs = getDb()
      .select()
      .from(gymExercises)
      .where(eq(gymExercises.isCustom, true))
      .all();
    expect(customs.map((c) => c.name).sort()).toEqual(result.unmatched.slice().sort());
    const treadmill = customs.find((c) => c.name === "Treadmill Hill Intervals");
    expect(treadmill).toMatchObject({ bodyPart: "cardio", defaultMode: "cardio" });
    expect(customs.find((c) => c.name === "Zercher Gorilla Carry Thing")?.bodyPart).toBe("other");
  });

  it("stores workouts as finished imports with inferred modes and completed sets", () => {
    importWorkouts(workouts(), "strong");
    const db = getDb();
    const [push, run] = db.select().from(gymWorkouts).orderBy(gymWorkouts.startedAt).all();
    expect(push).toMatchObject({
      source: "import",
      importSource: "strong",
      importRef: "strong:2024-05-01T07:30:00:Push Day",
      finishedAt: "2024-05-01T08:35:00",
      name: "Push Day",
    });
    // No end time and no duration in the file: a minute per set... but Strong gave 45m here.
    expect(run.finishedAt).toBe("2024-05-03T18:45:00");

    const entries = db
      .select()
      .from(gymWorkoutExercises)
      .where(eq(gymWorkoutExercises.workoutId, push.id))
      .orderBy(gymWorkoutExercises.position)
      .all();
    expect(entries.map((e) => e.mode)).toEqual(["reps", "time", "reps"]);
    expect(entries.every((e) => e.targetSets === null && e.targetWeightKg === null)).toBe(true);
    const sets = db
      .select()
      .from(gymWorkoutSets)
      .where(eq(gymWorkoutSets.workoutExerciseId, entries[0].id))
      .orderBy(gymWorkoutSets.position)
      .all();
    expect(sets.map((s) => [s.kind, s.weightKg, s.reps, s.rpe, s.completed])).toEqual([
      ["warmup", 40, 10, null, true],
      ["working", 60, 8, 8, true],
    ]);
    const runEntry = db
      .select()
      .from(gymWorkoutExercises)
      .where(eq(gymWorkoutExercises.workoutId, run.id))
      .get();
    expect(runEntry?.mode).toBe("cardio");
  });

  it("falls back to a minute per set when the file has no end time", () => {
    const w: ImportedWorkout = {
      ref: "x:1",
      date: "2024-05-01",
      startedAt: "2024-05-01T07:30:00",
      finishedAt: null,
      name: "",
      notes: null,
      exercises: [
        {
          name: "Deadlift",
          notes: null,
          sets: Array.from({ length: 3 }, () => ({
            kind: "working" as const,
            weightKg: 100,
            reps: 5,
            durationSec: null,
            distanceKm: null,
            rpe: null,
            rir: null,
          })),
        },
      ],
    };
    importWorkouts([w], "hevy");
    const row = getDb().select().from(gymWorkouts).get();
    expect(row).toMatchObject({ finishedAt: "2024-05-01T07:33:00", name: "Imported workout" });
  });

  it("is idempotent: re-importing the same file skips everything", () => {
    importWorkouts(workouts(), "strong");
    const again = importWorkouts(workouts(), "strong");
    expect(again).toMatchObject({ created: 0, skipped: 2, exercisesCreated: 0, unmatched: [] });
    expect(getDb().select().from(gymWorkouts).all()).toHaveLength(2);
  });

  it("skips a duplicate ref inside one call and reuses custom exercises across calls", () => {
    const [first] = workouts();
    const result = importWorkouts([first, first], "strong");
    expect(result).toMatchObject({ created: 1, skipped: 1 });
    const other = {
      ...first,
      ref: "strong:other",
      startedAt: "2024-06-01T07:30:00",
      date: "2024-06-01",
    };
    const second = importWorkouts([other], "strong");
    expect(second.exercisesCreated).toBe(0);
    expect(second.matched.map((m) => m.from)).toContain("Zercher Gorilla Carry Thing");
  });

  it("imports a Hevy export too", () => {
    const hevy = parseHevy(
      [
        "title,start_time,end_time,exercise_title,set_index,set_type,weight_kg,reps,rpe",
        "Legs,2024-03-12 18:00:00,2024-03-12 19:00:00,Squat (Barbell),0,normal,100,5,8",
      ].join("\n"),
    );
    const result = importWorkouts(hevy.workouts, "hevy");
    expect(result.matched).toEqual([{ from: "Squat (Barbell)", to: "Barbell Full Squat" }]);
  });
});

describe("importWeighIns", () => {
  it("adds weight metrics and skips same-day near-duplicates", () => {
    expect(
      importWeighIns([
        { date: "2024-05-01", weightKg: 80.5 },
        { date: "2024-05-02", weightKg: 80.2 },
      ]),
    ).toEqual({ created: 2, skipped: 0 });
    const result = importWeighIns([
      { date: "2024-05-01", weightKg: 80.52 },
      { date: "2024-05-02", weightKg: 81.5 },
      { date: "2024-05-03", weightKg: 80 },
      { date: "2024-05-03", weightKg: 80.01 },
    ]);
    expect(result).toEqual({ created: 2, skipped: 2 });
    const rows = getDb().select().from(healthMetrics).where(eq(healthMetrics.type, "weight")).all();
    expect(rows).toHaveLength(4);
    expect(rows[0]).toMatchObject({ label: "Weight", unit: "kg" });
  });
});

function seedRoutine() {
  ensureExerciseCatalog();
  const db = getDb();
  const bench = db
    .select()
    .from(gymExercises)
    .where(eq(gymExercises.name, "Barbell Bench Press"))
    .get()!;
  const custom = db
    .insert(gymExercises)
    .values({
      name: "My Sled Drag",
      bodyPart: "upper legs",
      equipment: "other",
      target: "quads",
      isCustom: true,
    })
    .returning()
    .get();
  const routine = db
    .insert(gymRoutines)
    .values({ name: "Push Day", progressionPolicy: "double" })
    .returning()
    .get();
  db.insert(gymRoutineExercises)
    .values([
      {
        routineId: routine.id,
        exerciseId: bench.id,
        position: 0,
        sets: 5,
        reps: 5,
        weightKg: 60,
        restSec: 180,
        incrementKg: 2.5,
      },
      {
        routineId: routine.id,
        exerciseId: custom.id,
        position: 1,
        mode: "time",
        sets: 3,
        durationSec: 45,
        notes: "slow",
      },
    ])
    .run();
  db.insert(gymWeekSchedule).values({ weekday: 1, routineId: routine.id }).run();
  const archived = db
    .insert(gymRoutines)
    .values({ name: "Old", archivedAt: "2024-01-01" })
    .returning()
    .get();
  return { routine, archived };
}

describe("plan files", () => {
  it("exports non-archived routines with the weekly schedule", () => {
    seedRoutine();
    const plan = exportPlanFile();
    expect(plan.routines.map((r) => r.name)).toEqual(["Push Day"]);
    expect(plan.week).toEqual({
      "0": null,
      "1": 0,
      "2": null,
      "3": null,
      "4": null,
      "5": null,
      "6": null,
    });
    expect(plan.routines[0].entries[0].exercise).toMatchObject({
      name: "Barbell Bench Press",
      catalogKey: expect.any(String),
    });
    expect(parsePlanFile(JSON.parse(JSON.stringify(plan)))).toEqual(plan);
  });

  it("filters by routine id", () => {
    const { routine } = seedRoutine();
    expect(exportPlanFile([routine.id + 100]).routines).toEqual([]);
    expect(exportPlanFile([routine.id]).routines).toHaveLength(1);
  });

  it("round-trips: re-importing into the same vault adds an (imported) copy and leaves the week alone", () => {
    seedRoutine();
    const plan = exportPlanFile();
    const result = importPlanFile(plan);
    expect(result).toEqual({ routinesCreated: 1, exercisesCreated: 0 });
    const names = getDb()
      .select()
      .from(gymRoutines)
      .all()
      .map((r) => r.name);
    expect(names).toContain("Push Day (imported)");
    expect(getDb().select().from(gymWeekSchedule).all()).toHaveLength(1);
    importPlanFile(plan);
    expect(
      getDb()
        .select()
        .from(gymRoutines)
        .all()
        .map((r) => r.name),
    ).toContain("Push Day (imported 2)");
  });

  it("round-trips into an empty vault: catalog by key, customs created, week applied", () => {
    seedRoutine();
    const plan = JSON.parse(JSON.stringify(exportPlanFile()));
    teardownTestDb();
    setupTestDb();
    const result = importPlanFile(parsePlanFile(plan));
    expect(result).toEqual({ routinesCreated: 1, exercisesCreated: 1 });
    const db = getDb();
    const routine = db.select().from(gymRoutines).get()!;
    expect(routine.name).toBe("Push Day");
    const entries = db
      .select()
      .from(gymRoutineExercises)
      .where(eq(gymRoutineExercises.routineId, routine.id))
      .orderBy(gymRoutineExercises.position)
      .all();
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({
      sets: 5,
      reps: 5,
      weightKg: 60,
      restSec: 180,
      incrementKg: 2.5,
    });
    expect(entries[1]).toMatchObject({ mode: "time", durationSec: 45, notes: "slow" });
    expect(db.select().from(gymWeekSchedule).get()).toMatchObject({
      weekday: 1,
      routineId: routine.id,
    });
    // Same plan again: custom exercise reused by name, not duplicated.
    expect(importPlanFile(plan).exercisesCreated).toBe(0);
  });

  it("applies the week only to empty weekdays", () => {
    const { routine } = seedRoutine();
    const plan = exportPlanFile();
    plan.week = { ...plan.week, "1": 0, "3": 0 };
    importPlanFile(plan);
    const rows = getDb().select().from(gymWeekSchedule).orderBy(gymWeekSchedule.weekday).all();
    expect(rows).toHaveLength(2);
    expect(rows[0].routineId).toBe(routine.id);
    expect(rows[1].weekday).toBe(3);
    expect(rows[1].routineId).not.toBe(routine.id);
  });
});

describe("backup", () => {
  it("round-trips through JSON and re-imports idempotently", () => {
    seedRoutine();
    importWorkouts(workouts(), "strong");
    importWeighIns([{ date: "2024-05-01", weightKg: 80.5 }]);
    const backup = exportBackup();
    expect(backup.workouts).toHaveLength(2);
    expect(backup.workouts[0].ref).toBe("strong:2024-05-01T07:30:00:Push Day");
    expect(backup.customExercises.map((c) => c.name)).toContain("My Sled Drag");
    const parsed = parseBackup(JSON.parse(JSON.stringify(backup)));

    // Same vault: everything is already there.
    const again = importBackup(parsed);
    expect(again.workouts).toMatchObject({ created: 0, skipped: 2 });
    expect(again.weighIns).toEqual({ created: 0, skipped: 1 });
    expect(again).toMatchObject({ routinesCreated: 0, routinesSkipped: 1, exercisesCreated: 0 });

    // Fresh vault: restored once, then idempotent.
    teardownTestDb();
    setupTestDb();
    const restored = importBackup(parsed);
    expect(restored.workouts.created).toBe(2);
    expect(restored).toMatchObject({ routinesCreated: 1, weighIns: { created: 1, skipped: 0 } });
    const second = importBackup(parsed);
    expect(second.workouts.created).toBe(0);
    expect(second).toMatchObject({ routinesCreated: 0, exercisesCreated: 0 });
    expect(getDb().select().from(gymRoutines).all()).toHaveLength(1);
    expect(getDb().select().from(gymWorkouts).all()).toHaveLength(2);
  });

  it("carries measurements, readiness and settings", () => {
    const backup = exportBackup();
    backup.measurements = [{ date: "2024-05-01", site: "waist", value: 82, note: null }];
    backup.readiness = [
      {
        date: "2024-05-01",
        sleepQuality: 4,
        energy: 3,
        soreness: 2,
        stress: 2,
        motivation: 5,
        note: "ok",
      },
    ];
    backup.settings = {
      sex: "male",
      heightCm: 180,
      goalWeightKg: 78,
      effortScale: "rpe",
      defaultRestSec: 120,
      e1rmFormula: "brzycki",
      barWeightKg: 15,
      platesKg: [20, 10, 5],
      ownedEquipment: ["barbell"],
      weeklySessionGoal: 4,
      sleepTargetHours: 7.5,
      askBodyweightOnStart: false,
      keepAwake: true,
      restSound: false,
      restNotifications: true,
    };
    const first = importBackup(backup);
    expect(first).toMatchObject({
      measurementsCreated: 1,
      readinessCreated: 1,
      settingsApplied: true,
    });
    const second = importBackup(backup);
    expect(second).toMatchObject({
      measurementsCreated: 0,
      readinessCreated: 0,
      settingsApplied: false,
    });
    const exported = exportBackup();
    expect(exported.settings).toMatchObject({
      goalWeightKg: 78,
      e1rmFormula: "brzycki",
      platesKg: [20, 10, 5],
    });
    expect(exported.measurements).toHaveLength(1);
    expect(exported.readiness[0].note).toBe("ok");
  });
});
