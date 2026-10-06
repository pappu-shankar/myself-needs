import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/modules/core/db/client";
import { setupTestDb, teardownTestDb } from "@/test/db";
import { gymWorkouts } from "../../db/schema/gym/workouts";
import { createCustomExercise, removeCustomExercise, type CustomExerciseInput } from "./exercises";
import {
  addRoutineEntry,
  archiveRoutine,
  createRoutine,
  deleteRoutine,
  duplicateRoutine,
  effectivePolicy,
  getRoutine,
  linkSuperset,
  listRoutines,
  normalizeSupersetGroups,
  removeRoutineEntry,
  reorderRoutineEntries,
  restoreRoutine,
  unlinkSuperset,
  updateRoutine,
  updateRoutineEntry,
} from "./routines";

beforeEach(setupTestDb);
afterEach(teardownTestDb);

function exercise(name: string, extra: Partial<CustomExerciseInput> = {}) {
  return createCustomExercise({ name, bodyPart: "chest", ...extra }).id;
}

/** A routine with `n` reps-mode entries; returns ids in order. */
function routineWith(n: number) {
  const routine = createRoutine({ name: "Test" });
  const entries = Array.from(
    { length: n },
    (_, i) => addRoutineEntry(routine.id, exercise(`Ex ${i}`)).id,
  );
  return { routineId: routine.id, entries };
}

const layout = (routineId: number) =>
  getRoutine(routineId).entries.map((e) => [e.id, e.position, e.supersetGroup]);
const groups = (routineId: number) => getRoutine(routineId).entries.map((e) => e.supersetGroup);

describe("routines", () => {
  it("creates, lists with a preview, updates, archives and restores", () => {
    const routine = createRoutine({ name: " Push  day ", notes: "  " });
    expect(routine).toMatchObject({ name: "Push day", notes: null, progressionPolicy: "linear" });
    addRoutineEntry(routine.id, exercise("Press"));
    addRoutineEntry(routine.id, exercise("Fly"));

    expect(listRoutines()).toEqual([
      expect.objectContaining({ id: routine.id, entryCount: 2, exerciseNames: ["Press", "Fly"] }),
    ]);

    expect(updateRoutine(routine.id, { progressionPolicy: "double", name: "Push" })).toMatchObject({
      name: "Push",
      progressionPolicy: "double",
    });

    archiveRoutine(routine.id);
    expect(listRoutines()).toEqual([]);
    expect(listRoutines({ includeArchived: true })).toHaveLength(1);
    restoreRoutine(routine.id);
    expect(listRoutines()).toHaveLength(1);
  });

  it("rejects a blank name and a missing routine", () => {
    expect(() => createRoutine({ name: "   " })).toThrow("required");
    expect(() => getRoutine(999)).toThrow("doesn't exist");
    expect(() => updateRoutine(999, { name: "x" })).toThrow("doesn't exist");
  });

  it("duplicates a routine with its entries and a distinct name", () => {
    const { routineId, entries } = routineWith(3);
    linkSuperset(entries[0]);
    const copy = duplicateRoutine(routineId);
    expect(copy.name).toBe("Test (copy)");
    expect(duplicateRoutine(routineId).name).toBe("Test (copy) (2)");
    const copied = getRoutine(copy.id);
    expect(copied.entries.map((e) => e.exercise.name)).toEqual(["Ex 0", "Ex 1", "Ex 2"]);
    expect(copied.entries.map((e) => e.supersetGroup)).toEqual([1, 1, null]);
    expect(copied.entries.every((e) => !entries.includes(e.id))).toBe(true);
  });

  it("deletes a routine; workouts keep their snapshot name", () => {
    const { routineId } = routineWith(1);
    const workout = getDb()
      .insert(gymWorkouts)
      .values({ date: "2026-10-01", startedAt: "2026-10-01T07:00:00", name: "Test", routineId })
      .returning()
      .get();
    deleteRoutine(routineId);
    expect(() => getRoutine(routineId)).toThrow();
    const after = getDb()
      .select()
      .from(gymWorkouts)
      .all()
      .find((w) => w.id === workout.id);
    expect(after).toMatchObject({ name: "Test", routineId: null });
  });
});

describe("routine entries", () => {
  it("defaults from the exercise and its mode", () => {
    const routine = createRoutine({ name: "Mixed" });
    const reps = addRoutineEntry(
      routine.id,
      exercise("Lunge", { isUnilateral: true, isBodyweight: true }),
    );
    expect(reps).toMatchObject({
      mode: "reps",
      sets: 3,
      reps: 10,
      perSide: true,
      isBodyweight: true,
      position: 0,
    });
    const hold = addRoutineEntry(routine.id, exercise("Hold", { defaultMode: "time" }));
    expect(hold).toMatchObject({ mode: "time", sets: 3, reps: null, durationSec: 45, position: 1 });
    const bike = addRoutineEntry(routine.id, exercise("Bike", { bodyPart: "cardio" }));
    expect(bike).toMatchObject({ mode: "cardio", sets: 1, durationSec: 1200, distanceKm: null });
    const custom = addRoutineEntry(routine.id, exercise("Press"), {
      sets: 5,
      reps: 5,
      weightKg: 60,
    });
    expect(custom).toMatchObject({ sets: 5, reps: 5, weightKg: 60 });
  });

  it("refuses archived or missing exercises and missing routines", () => {
    const routine = createRoutine({ name: "R" });
    expect(() => addRoutineEntry(routine.id, 999_999)).toThrow("doesn't exist");
    expect(() => addRoutineEntry(999, exercise("A"))).toThrow("routine");
    const old = exercise("Old");
    addRoutineEntry(routine.id, old);
    expect(removeCustomExercise(old).outcome).toBe("archived");
    expect(() => addRoutineEntry(routine.id, old)).toThrow("archived");
  });

  it("reports the effective policy per entry", () => {
    expect(effectivePolicy(null, "linear", "reps")).toBe("linear");
    expect(effectivePolicy(null, "linear", "time")).toBe("time");
    expect(effectivePolicy(null, "off", "time")).toBe("off");
    expect(effectivePolicy(null, "greyskull", "cardio")).toBe("off");
    expect(effectivePolicy("double", "linear", "reps")).toBe("double");

    const routine = createRoutine({ name: "R", progressionPolicy: "double" });
    addRoutineEntry(routine.id, exercise("Hold", { defaultMode: "time" }));
    expect(getRoutine(routine.id).entries[0].effectivePolicy).toBe("time");
  });

  it("validates every entry rule", () => {
    const routine = createRoutine({ name: "R" });
    const id = addRoutineEntry(routine.id, exercise("Press")).id;
    const bad: Array<[Parameters<typeof updateRoutineEntry>[1], string]> = [
      [{ sets: 0 }, "Sets"],
      [{ sets: 21 }, "Sets"],
      [{ sets: 2.5 }, "Sets"],
      [{ reps: 0 }, "Reps"],
      [{ reps: 101 }, "Reps"],
      [{ reps: null }, "rep target"],
      [{ repsMin: 12, reps: 10 }, "can't be above"],
      [{ repsMin: 8, reps: null }, "top of the rep range"],
      [{ weightKg: -1 }, "negative"],
      [{ incrementKg: -2.5 }, "weight step"],
      [{ targetRpe: 4.5 }, "RPE"],
      [{ targetRpe: 10.5 }, "RPE"],
      [{ restSec: 901 }, "Rest"],
      [{ progressionPolicy: "time" }, "doesn't apply"],
      [{ mode: "time", scheme: "wendler_main" }, "5/3/1"],
      [{ mode: "cardio", durationSec: null }, "duration or a distance"],
      [{ notes: "x".repeat(501) }, "Notes"],
    ];
    for (const [patch, message] of bad) {
      expect(() => updateRoutineEntry(id, patch), JSON.stringify(patch)).toThrow(message);
    }
    expect(
      updateRoutineEntry(id, { repsMin: 8, reps: 12, targetRpe: 8, weightKg: 0 }),
    ).toMatchObject({
      repsMin: 8,
      reps: 12,
      targetRpe: 8,
      weightKg: 0,
    });
    expect(
      updateRoutineEntry(id, { scheme: "wendler_main", progressionPolicy: "greyskull" }),
    ).toMatchObject({
      scheme: "wendler_main",
      progressionPolicy: "greyskull",
    });
    expect(() => updateRoutineEntry(999_999, { sets: 3 })).toThrow("isn't in the routine");
  });

  it("resets carried-over values a new mode can't use", () => {
    const routine = createRoutine({ name: "R" });
    const id = addRoutineEntry(routine.id, exercise("Press"), {
      progressionPolicy: "double",
      scheme: "wendler_bbb",
    }).id;
    const asHold = updateRoutineEntry(id, { mode: "time" });
    expect(asHold).toMatchObject({
      mode: "time",
      progressionPolicy: null,
      scheme: "standard",
      durationSec: 45,
    });
    const asCardio = updateRoutineEntry(id, { mode: "cardio" });
    expect(asCardio).toMatchObject({ mode: "cardio", durationSec: 45 });
    expect(() => updateRoutineEntry(id, { mode: "reps", reps: null })).toThrow("rep target");
    expect(updateRoutineEntry(id, { mode: "reps" })).toMatchObject({ mode: "reps", reps: 10 });
  });
});

describe("order and supersets", () => {
  it("normalizes superset runs", () => {
    expect(normalizeSupersetGroups([5, 5, null, 5, 7, 7, 7, 2])).toEqual([
      1,
      1,
      null,
      null,
      2,
      2,
      2,
      null,
    ]);
    expect(normalizeSupersetGroups([3])).toEqual([null]);
    expect(normalizeSupersetGroups([])).toEqual([]);
  });

  it("reorders by permutation and drops supersets that lose their partner", () => {
    const {
      routineId,
      entries: [a, b, c, d],
    } = routineWith(4);
    linkSuperset(a);
    expect(groups(routineId)).toEqual([1, 1, null, null]);

    reorderRoutineEntries(routineId, [b, c, d, a]);
    expect(layout(routineId)).toEqual([
      [b, 0, null],
      [c, 1, null],
      [d, 2, null],
      [a, 3, null],
    ]);

    expect(() => reorderRoutineEntries(routineId, [a, b, c])).toThrow("reload");
    expect(() => reorderRoutineEntries(routineId, [a, b, c, c])).toThrow("reload");
    expect(() => reorderRoutineEntries(routineId, [a, b, c, 999])).toThrow("reload");
  });

  it("keeps a superset that stays adjacent through a reorder", () => {
    const {
      routineId,
      entries: [a, b, c],
    } = routineWith(3);
    linkSuperset(b);
    reorderRoutineEntries(routineId, [b, c, a]);
    expect(groups(routineId)).toEqual([1, 1, null]);
  });

  it("links with the next entry, grows and merges supersets", () => {
    const {
      routineId,
      entries: [a, b, c, d],
    } = routineWith(4);
    expect(() => linkSuperset(d)).toThrow("last exercise");

    linkSuperset(c);
    expect(groups(routineId)).toEqual([null, null, 1, 1]);
    linkSuperset(a);
    expect(groups(routineId)).toEqual([1, 1, 2, 2]);
    linkSuperset(b); // merges the two pairs into one giant set
    expect(groups(routineId)).toEqual([1, 1, 1, 1]);
    linkSuperset(b); // already linked — no-op
    expect(groups(routineId)).toEqual([1, 1, 1, 1]);
  });

  it("unlinks an entry; a partner left alone is ungrouped and a middle unlink splits the run", () => {
    const {
      routineId,
      entries: [a, b, c, d, e],
    } = routineWith(5);
    linkSuperset(a);
    linkSuperset(b);
    linkSuperset(c);
    linkSuperset(d);
    expect(groups(routineId)).toEqual([1, 1, 1, 1, 1]);

    unlinkSuperset(c);
    expect(groups(routineId)).toEqual([1, 1, null, 2, 2]);
    unlinkSuperset(a);
    expect(groups(routineId)).toEqual([null, null, null, 1, 1]);
    unlinkSuperset(a); // not grouped — no-op
    unlinkSuperset(e);
    expect(groups(routineId)).toEqual([null, null, null, null, null]);
  });

  it("removing an entry renumbers positions and cleans up its superset", () => {
    const {
      routineId,
      entries: [a, b, c],
    } = routineWith(3);
    linkSuperset(a);
    removeRoutineEntry(b);
    expect(layout(routineId)).toEqual([
      [a, 0, null],
      [c, 1, null],
    ]);
    expect(addRoutineEntry(routineId, exercise("Late")).position).toBe(2);
    expect(() => removeRoutineEntry(b)).toThrow();
  });
});
