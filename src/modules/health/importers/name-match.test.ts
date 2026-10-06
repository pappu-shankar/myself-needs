import { describe, expect, it } from "vitest";
import catalog from "../data/exercise-catalog.json";
import {
  exerciseTokens,
  guessExerciseTraits,
  matchExercise,
  normalizeExerciseName,
  type MatchCandidate,
} from "./name-match";

const CANDIDATES: MatchCandidate[] = catalog.exercises.map((e, i) => ({
  id: i + 1,
  name: e.name,
  equipment: e.equipment,
}));
const nameOf = (id: number | undefined) => CANDIDATES.find((c) => c.id === id)?.name ?? null;
const resolve = (name: string) => nameOf(matchExercise(name, CANDIDATES)?.id);

describe("normalizeExerciseName", () => {
  it("ignores word order, punctuation, case and equipment position", () => {
    expect(normalizeExerciseName("Bench Press (Barbell)")).toBe(
      normalizeExerciseName("Barbell Bench Press"),
    );
    expect(normalizeExerciseName("Pull-Ups")).toBe(normalizeExerciseName("pull up"));
    expect(exerciseTokens("DB Curl")).toEqual(["dumbbell", "curl"]);
  });
});

describe("matchExercise", () => {
  const table: Array<[string, string | null]> = [
    ["Bench Press (Barbell)", "Barbell Bench Press"],
    ["Barbell Bench Press", "Barbell Bench Press"],
    ["Flat Barbell Bench Press", "Barbell Bench Press"],
    ["Bench Press", "Barbell Bench Press"],
    ["Squat (Barbell)", "Barbell Full Squat"],
    ["Squat", "Barbell Full Squat"],
    ["Back Squat", "Barbell Full Squat"],
    ["Squat (Dumbbell)", "Dumbbell Squat"],
    ["Deadlift (Barbell)", "Barbell Deadlift"],
    ["Romanian Deadlift (Dumbbell)", "Dumbbell Romanian Deadlift"],
    ["Romanian Deadlift (Barbell)", "Barbell Romanian Deadlift"],
    ["RDL", "Barbell Romanian Deadlift"],
    ["Pull Up", "Pull-Up"],
    ["Pull Ups", "Pull-Up"],
    ["Pull Up (Assisted)", "Assisted Pull-Up"],
    ["Pull Up (Weighted)", "Weighted Pull-Up"],
    ["Lat Pulldown (Cable)", "Cable Lat Pulldown Full Range Of Motion"],
    ["Lat Pulldown", "Cable Lat Pulldown Full Range Of Motion"],
    ["Overhead Press (Barbell)", "Barbell Seated Overhead Press"],
    ["OHP", "Barbell Seated Overhead Press"],
    ["Incline Bench Press (Dumbbell)", "Dumbbell Incline Bench Press"],
    ["Lateral Raise (Dumbbell)", "Dumbbell Lateral Raise"],
    ["Leg Press (Machine)", "Sled 45в° Leg Press"],
    ["Hammer Curl (Dumbbell)", "Dumbbell Hammer Curl"],
    ["Bent Over Row (Barbell)", "Barbell Bent Over Row"],
    // Too ambiguous or unknown: never guess.
    ["Curl (Dumbbell)", "Dumbbell Biceps Curl"],
    ["Press (Dumbbell)", null],
    ["Zercher Hip Flexor Mashup", null],
    ["Made Up Exercise 9000", null],
    ["", null],
  ];
  it.each(table)("%s -> %s", (input, expected) => {
    expect(resolve(input)).toBe(expected);
  });

  it("reports full confidence for an exact name and less for aliases", () => {
    expect(matchExercise("Barbell Bench Press", CANDIDATES)?.confidence).toBe(1);
    expect(matchExercise("Bench Press", CANDIDATES)?.confidence).toBeLessThan(1);
  });

  it("matches custom exercises by exact name", () => {
    const list = [...CANDIDATES, { id: 99999, name: "Zottman Hold Thing", equipment: "other" }];
    expect(matchExercise("zottman hold thing", list)?.id).toBe(99999);
  });
});

describe("guessExerciseTraits", () => {
  it("guesses body part and equipment from the name", () => {
    expect(guessExerciseTraits("Cable Face Pull")).toMatchObject({
      bodyPart: "shoulders",
      equipment: "cable",
    });
    expect(guessExerciseTraits("Running")).toMatchObject({
      bodyPart: "cardio",
      equipment: "other",
    });
    expect(guessExerciseTraits("Zzz")).toEqual({
      bodyPart: "other",
      equipment: "other",
      target: "other",
    });
  });
});
