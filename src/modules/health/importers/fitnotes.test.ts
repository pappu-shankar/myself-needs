import { describe, expect, it } from "vitest";
import { parseFitNotes } from "./fitnotes";

describe("parseFitNotes (Android)", () => {
  const FILE = [
    "Date,Exercise,Category,Weight,Weight Unit,Reps,Distance,Distance Unit,Time,Comment",
    '2024-04-02,Flat Barbell Bench Press,Chest,185,lbs,5,,,,"Top set, easy"',
    "2024-04-02,Flat Barbell Bench Press,Chest,60,kg,8,,,,",
    "2024-04-02,Treadmill,Cardio,,,,5.0,km,00:30:00,",
    "2024-04-02,Plank,Abs,,,,,,00:01:30,",
    "2024-04-04,Squat,Legs,100,kg,5,,,,",
  ].join("\n");
  const result = parseFitNotes(FILE);

  it("makes one workout per day starting at midday", () => {
    expect(result.source).toBe("fitnotes");
    expect(result.workouts.map((w) => w.ref)).toEqual([
      "fitnotes:2024-04-02T12:00:00:FitNotes workout",
      "fitnotes:2024-04-04T12:00:00:FitNotes workout",
    ]);
    expect(result.warnings).toEqual([]);
  });

  it("converts units per row", () => {
    const bench = result.workouts[0].exercises[0];
    expect(bench.sets[0].weightKg).toBeCloseTo(83.91, 2);
    expect(bench.sets[1].weightKg).toBe(60);
    expect(bench.notes).toBe("Top set, easy");
  });

  it("reads per-set time and distance", () => {
    const [, treadmill, plank] = result.workouts[0].exercises;
    expect(treadmill.sets[0]).toMatchObject({ distanceKm: 5, durationSec: 1800 });
    expect(plank.sets[0]).toMatchObject({ durationSec: 90, reps: null });
  });
});

describe("parseFitNotes (iOS)", () => {
  it("reads separate kg / lbs columns and miles", () => {
    const result = parseFitNotes(
      [
        "Date,Exercise,Category,Weight (kg),Weight (lbs),Reps,Distance,Distance Unit,Time,Notes,Kind",
        "2024-04-02,Deadlift,Back,100,220.5,3,,,,,weight",
        "2024-04-02,Deadlift,Back,,225,3,,,,,weight",
        "2024-04-02,Run,Cardio,,,,3,mi,00:27:00,,distance",
      ].join("\n"),
    );
    const [deadlift, run] = result.workouts[0].exercises;
    expect(deadlift.sets[0].weightKg).toBe(100);
    expect(deadlift.sets[1].weightKg).toBeCloseTo(102.06, 2);
    expect(run.sets[0].distanceKm).toBeCloseTo(4.828, 3);
    expect(run.sets[0].durationSec).toBe(1620);
  });

  it("handles a semicolon CSV with decimal commas", () => {
    const result = parseFitNotes(
      "Date;Exercise;Category;Weight;Weight Unit;Reps\n02.04.2024;Squat;Legs;102,5;kg;5\n",
    );
    expect(result.workouts[0].date).toBe("2024-04-02");
    expect(result.workouts[0].exercises[0].sets[0].weightKg).toBe(102.5);
  });
});
