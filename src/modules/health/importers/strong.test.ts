import { describe, expect, it } from "vitest";
import { parseStrong } from "./strong";

const HEADER =
  "Date,Workout Name,Duration,Exercise Name,Set Order,Weight,Reps,Distance,Seconds,Notes,Workout Notes,RPE";

const FILE = [
  HEADER,
  '2024-05-01 07:30:00,Push Day,1h 5m,Bench Press (Barbell),W,40,10,0,0,,"Felt good, strong",',
  '2024-05-01 07:30:00,Push Day,1h 5m,Bench Press (Barbell),1,60,8,0,0,"Paused, slow","Felt good, strong",8',
  "2024-05-01 07:30:00,Push Day,1h 5m,Bench Press (Barbell),2,60,7,0,0,,,9.5",
  "2024-05-01 07:30:00,Push Day,1h 5m,Plank,1,0,0,0,60,,,",
  "2024-05-01 07:30:00,Push Day,1h 5m,Bench Press (Barbell),Rest Timer,0,0,0,90,,,",
  "2024-05-03 18:00:00,Run,45m,Running,1,0,0,5000,1500,,,",
  "2024-05-03 18:00:00,Run,45m,Squat (Barbell),D,100,5,0,0,,,",
].join("\n");

describe("parseStrong", () => {
  const result = parseStrong(FILE);

  it("groups sets into workouts and exercises", () => {
    expect(result.source).toBe("strong");
    expect(result.workouts).toHaveLength(2);
    const [push, run] = result.workouts;
    expect(push).toMatchObject({
      ref: "strong:2024-05-01T07:30:00:Push Day",
      date: "2024-05-01",
      startedAt: "2024-05-01T07:30:00",
      finishedAt: "2024-05-01T08:35:00",
      name: "Push Day",
      notes: "Felt good, strong",
    });
    expect(push.exercises.map((e) => e.name)).toEqual(["Bench Press (Barbell)", "Plank"]);
    expect(run.exercises.map((e) => e.name)).toEqual(["Running", "Squat (Barbell)"]);
  });

  it("maps set kinds, RPE, notes and timed rows", () => {
    const bench = result.workouts[0].exercises[0];
    expect(bench.notes).toBe("Paused, slow");
    expect(bench.sets.map((s) => s.kind)).toEqual(["warmup", "working", "working"]);
    expect(bench.sets.map((s) => s.rpe)).toEqual([null, 8, 9.5]);
    expect(bench.sets[1]).toMatchObject({ weightKg: 60, reps: 8, rir: null });
    const plank = result.workouts[0].exercises[1].sets[0];
    expect(plank).toMatchObject({ weightKg: null, reps: null, durationSec: 60 });
  });

  it("keeps cardio distance and drop sets", () => {
    const [running, squat] = result.workouts[1].exercises;
    expect(running.sets[0]).toMatchObject({ distanceKm: 5000, durationSec: 1500 });
    expect(squat.sets[0].kind).toBe("drop");
  });

  it("reports rest-timer rows instead of dropping them silently", () => {
    expect(result.warnings.some((w) => /rest-timer/.test(w))).toBe(true);
  });

  it("converts pounds to kilograms", () => {
    const lb = parseStrong(
      [HEADER, "2024-05-01 07:30:00,Legs,45m,Squat,1,225,5,0,0,,,"].join("\n"),
      { weightUnit: "lb" },
    );
    expect(lb.workouts[0].exercises[0].sets[0].weightKg).toBeCloseTo(102.06, 2);
  });

  it("warns about unusable rows", () => {
    const bad = parseStrong(
      [
        HEADER,
        "not a date,Legs,45m,Squat,1,100,5,0,0,,,",
        "2024-05-01 07:30:00,Legs,,Squat,1,0,0,0,0,,,",
      ].join("\n"),
    );
    expect(bad.workouts).toHaveLength(0);
    expect(bad.warnings.join(" ")).toMatch(/couldn't read the date/);
    expect(bad.warnings.join(" ")).toMatch(/empty set/);
  });
});
