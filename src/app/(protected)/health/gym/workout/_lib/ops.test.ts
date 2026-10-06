import { describe, expect, it } from "vitest";
import type { WorkoutDetailEntry, WorkoutSet } from "@/modules/health";
import { applyOp } from "./ops";

function set(id: number, patch: Partial<WorkoutSet> = {}): WorkoutSet {
  return {
    id,
    workoutExerciseId: 1,
    position: id,
    kind: "working",
    weightKg: 80,
    reps: 5,
    durationSec: null,
    distanceKm: null,
    rir: null,
    rpe: null,
    completed: false,
    completedAt: null,
    trackedBy: "manual",
    romScore: null,
    ...patch,
  };
}

function entry(id: number, sets: WorkoutSet[]): WorkoutDetailEntry {
  return {
    id,
    exerciseId: id * 10,
    routineExerciseId: null,
    position: id,
    mode: "reps",
    supersetGroup: null,
    perSide: false,
    isBodyweight: false,
    target: null,
    restSec: null,
    progressionPolicy: null,
    prescriptionKind: null,
    prescriptionReason: null,
    notes: null,
    exercise: {
      id: id * 10,
      name: `exercise ${id}`,
      bodyPart: "chest",
      equipment: "barbell",
      target: "pectorals",
      secondaryMuscles: [],
      isBodyweight: false,
      isUnilateral: false,
      notes: null,
    },
    sets,
  };
}

const entries = [entry(1, [set(11), set(12)]), entry(2, [set(21)])];

describe("optimistic workout changes", () => {
  it("patches one set and leaves everything else as it was", () => {
    const next = applyOp(entries, {
      type: "patch",
      setId: 12,
      patch: { completed: true, reps: 6 },
    });
    expect(next[0].sets[1]).toMatchObject({ id: 12, completed: true, reps: 6, weightKg: 80 });
    expect(next[0].sets[0]).toBe(entries[0].sets[0]);
    expect(next[1]).toBe(entries[1]);
  });

  it("removes a set or an entry", () => {
    expect(applyOp(entries, { type: "remove-set", setId: 11 })[0].sets.map((s) => s.id)).toEqual([
      12,
    ]);
    expect(applyOp(entries, { type: "remove-entry", entryId: 1 }).map((e) => e.id)).toEqual([2]);
  });

  it("reorders entries, ignoring an order that doesn't cover them all", () => {
    expect(applyOp(entries, { type: "order", entryIds: [2, 1] }).map((e) => e.id)).toEqual([2, 1]);
    expect(applyOp(entries, { type: "order", entryIds: [2] })).toBe(entries);
  });

  it("ignores unknown ids", () => {
    expect(applyOp(entries, { type: "patch", setId: 999, patch: { reps: 1 } })).toEqual(entries);
  });
});
