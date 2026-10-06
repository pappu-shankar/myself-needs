import { describe, expect, it } from "vitest";
import catalog from "../data/exercise-catalog.json";
import {
  muscleLevels,
  muscleLoad,
  muscleOf,
  musclesOf,
  primaryMuscleOf,
  rankMuscles,
} from "./muscles";

describe("musclesOf", () => {
  it("maps dataset vocabulary onto body-map muscles, primary 1 and secondary 0.5", () => {
    expect(
      musclesOf({
        target: "pectorals",
        secondaryMuscles: ["triceps", "shoulders"],
        bodyPart: "chest",
      }),
    ).toEqual({ chest: 1, triceps: 0.5, deltoids: 0.5 });
  });

  it("keeps the higher weight when a muscle is both primary and secondary", () => {
    expect(
      musclesOf({ target: "lats", secondaryMuscles: ["rhomboids", "biceps"], bodyPart: "back" }),
    ).toEqual({ "upper-back": 1, biceps: 0.5 });
  });

  it("drops undrawable muscles and falls back to the body part when nothing is left", () => {
    expect(
      musclesOf({
        target: "cardiovascular system",
        secondaryMuscles: ["feet"],
        bodyPart: "upper legs",
      }),
    ).toEqual({ quadriceps: 0.4, hamstring: 0.35, gluteal: 0.25 });
  });

  it("recognises every muscle term used anywhere in the bundled catalog", () => {
    const deliberatelyUndrawable = new Set([
      "cardiovascular system",
      "ankles",
      "ankle stabilizers",
      "feet",
      "hands",
      "sternocleidomastoid",
    ]);
    const unknown = new Set<string>();
    for (const e of catalog.exercises) {
      for (const name of [e.target, ...e.secondary]) {
        if (!deliberatelyUndrawable.has(name.toLowerCase()) && muscleOf(name) === null) {
          unknown.add(name);
        }
      }
    }
    expect([...unknown]).toEqual([]);
  });
});

describe("primaryMuscleOf", () => {
  it("uses the target, else the heaviest body-part muscle", () => {
    expect(primaryMuscleOf({ target: "quads", bodyPart: "upper legs" })).toBe("quadriceps");
    expect(primaryMuscleOf({ target: "something", bodyPart: "upper legs" })).toBe("quadriceps");
    expect(primaryMuscleOf({ target: "something", bodyPart: "cardio" })).toBeNull();
  });
});

describe("muscleLoad / muscleLevels / rankMuscles", () => {
  const load = muscleLoad([
    { muscles: { chest: 1, triceps: 0.5 }, sets: 4 },
    { muscles: { triceps: 1 }, sets: 2 },
  ]);

  it("sums set counts weighted by muscle share", () => {
    expect(load).toEqual({ chest: 4, triceps: 4 });
  });

  it("shades relative to the hardest-worked muscle", () => {
    const levels = muscleLevels({ chest: 8, biceps: 2 });
    expect(levels.chest).toBe(4);
    expect(levels.biceps).toBe(1);
    expect(levels.calves).toBe(0);
  });

  it("ranks worked muscles first and lists the missed ones in body order", () => {
    const { worked, missed } = rankMuscles({ biceps: 1, chest: 3 });
    expect(worked).toEqual(["chest", "biceps"]);
    expect(missed[0]).toBe("trapezius");
    expect(missed).not.toContain("chest");
  });
});
