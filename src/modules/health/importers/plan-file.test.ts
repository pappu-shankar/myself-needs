import { describe, expect, it } from "vitest";
import { PLAN_FILE_FORMAT, parsePlanFile } from "./plan-file";
import { ImportFormatError } from "./validate";

const exercise = {
  catalogKey: "0025",
  name: "Barbell Bench Press",
  bodyPart: "chest",
  equipment: "barbell",
  target: "pectorals",
  secondaryMuscles: ["triceps"],
  defaultMode: "reps",
  isBodyweight: false,
  isUnilateral: false,
};

const entry = {
  exercise,
  mode: "reps",
  sets: 5,
  reps: 5,
  repsMin: null,
  weightKg: 60,
  durationSec: null,
  distanceKm: null,
  restSec: 180,
  supersetGroup: null,
  perSide: false,
  isBodyweight: false,
  progressionPolicy: "linear",
  incrementKg: 2.5,
  targetRpe: null,
  scheme: "standard",
  notes: null,
};

const valid = () =>
  structuredClone({
    format: PLAN_FILE_FORMAT,
    version: 1,
    exportedAt: "2024-05-01T00:00:00.000Z",
    routines: [{ name: "Push", notes: null, progressionPolicy: "linear", entries: [entry] }],
    week: { "1": 0, "2": null },
  });

const message = (json: unknown) => {
  try {
    parsePlanFile(json);
  } catch (e) {
    expect(e).toBeInstanceOf(ImportFormatError);
    return (e as Error).message;
  }
  return null;
};

describe("parsePlanFile", () => {
  it("accepts a valid file unchanged", () => {
    const plan = parsePlanFile(valid());
    expect(plan.routines[0].entries[0]).toEqual(entry);
    expect(plan.week).toEqual({ "1": 0, "2": null });
  });

  it("fills defaults for a minimal hand-written entry", () => {
    const plan = parsePlanFile({
      ...valid(),
      routines: [{ name: "Mini", entries: [{ exercise: { name: "Curl" } }] }],
      week: {},
    });
    expect(plan.routines[0].progressionPolicy).toBe("linear");
    expect(plan.routines[0].entries[0]).toMatchObject({
      mode: "reps",
      sets: 3,
      scheme: "standard",
      exercise: { bodyPart: "other", catalogKey: null, isBodyweight: false },
    });
  });

  it("gives friendly, path-qualified errors", () => {
    expect(message(null)).toMatch(/expected an object/);
    expect(message({ ...valid(), format: "something-else" })).toMatch(
      /isn't a Personal Life OS plan/,
    );
    expect(message({ ...valid(), version: 2 })).toMatch(/version 2/);
    expect(message({ ...valid(), routines: "nope" })).toMatch(/routines: expected a list/);
    const bad = valid();
    bad.routines[0].entries[0].sets = 0;
    expect(message(bad)).toMatch(/routines\[0\]\.entries\[0\]\.sets: must be between 1 and 50/);
    const badMode = valid();
    (badMode.routines[0].entries[0] as Record<string, unknown>).mode = "swim";
    expect(message(badMode)).toMatch(/entries\[0\]\.mode: expected one of reps, time, cardio/);
    const noName = valid();
    (noName.routines[0].entries[0].exercise as Record<string, unknown>).name = "";
    expect(message(noName)).toMatch(/exercise\.name: must not be empty/);
  });

  it("validates the weekly plan", () => {
    expect(message({ ...valid(), week: { "7": 0 } })).toMatch(/weekdays are 0/);
    expect(message({ ...valid(), week: { "1": 3 } })).toMatch(/week\.1/);
    expect(message({ ...valid(), week: { "1": "x" } })).toMatch(/expected a number/);
  });

  it("caps sizes", () => {
    const many = valid();
    many.routines = Array.from({ length: 201 }, () => many.routines[0]);
    expect(message(many)).toMatch(/too many items/);
  });
});
