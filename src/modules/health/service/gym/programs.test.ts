import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/modules/core/db/client";
import { todayIso } from "@/lib/dates";
import { setupTestDb, teardownTestDb } from "@/test/db";
import { gymWorkouts } from "../../db/schema/gym/workouts";
import {
  createProgram,
  deleteProgram,
  endProgram,
  getActiveProgram,
  getProgram,
  listPrograms,
  updateProgram,
} from "./programs";

beforeEach(setupTestDb);
afterEach(teardownTestDb);

const block = {
  name: "Hypertrophy block",
  kind: "block" as const,
  startDate: "2026-09-07",
  weeks: 6,
  setRampPerWeek: 1,
  deloadFinalWeek: true,
  notes: null,
};

describe("programs", () => {
  it("creates an active program and reads it back", () => {
    expect(getActiveProgram()).toBeNull();
    const program = createProgram(block);
    expect(program).toMatchObject({ status: "active", endedAt: null, weeks: 6, setRampPerWeek: 1 });
    expect(getActiveProgram()?.id).toBe(program.id);
    expect(getProgram(program.id).name).toBe("Hypertrophy block");
    expect(() => getProgram(999)).toThrow("doesn't exist");
  });

  it("completes the previous active program when a new one starts", () => {
    const first = createProgram(block);
    const second = createProgram({ ...block, name: "5/3/1", kind: "wendler", weeks: 12 });
    expect(getProgram(first.id)).toMatchObject({ status: "completed", endedAt: todayIso() });
    expect(getActiveProgram()?.id).toBe(second.id);
    expect(listPrograms().map((p) => p.id)).toEqual([second.id, first.id]);
  });

  it("validates weeks, ramp, name and dates", () => {
    expect(() => createProgram({ ...block, weeks: 0 })).toThrow("1 to 52");
    expect(() => createProgram({ ...block, weeks: 53 })).toThrow("1 to 52");
    expect(() => createProgram({ ...block, weeks: 4.5 })).toThrow("1 to 52");
    expect(() => createProgram({ ...block, setRampPerWeek: 4 })).toThrow("0 to 3");
    expect(() => createProgram({ ...block, setRampPerWeek: -1 })).toThrow("0 to 3");
    expect(() => createProgram({ ...block, name: " " })).toThrow("required");
    expect(() => createProgram({ ...block, startDate: "2026-13-01" })).toThrow("calendar date");
    expect(() => createProgram({ ...block, kind: "other" as never })).toThrow("program type");
    // Nothing invalid was half-created, and a failed create doesn't end the active one.
    const ok = createProgram(block);
    expect(() => createProgram({ ...block, weeks: 0 })).toThrow();
    expect(getActiveProgram()?.id).toBe(ok.id);
  });

  it("updates, ends and deletes", () => {
    const program = createProgram(block);
    expect(updateProgram(program.id, { weeks: 8, notes: "  push it " })).toMatchObject({
      weeks: 8,
      notes: "push it",
    });
    expect(() => updateProgram(program.id, { setRampPerWeek: 9 })).toThrow("0 to 3");

    const ended = endProgram(program.id, "completed");
    expect(ended).toMatchObject({ status: "completed", endedAt: todayIso() });
    expect(getActiveProgram()).toBeNull();
    expect(endProgram(program.id, "archived")).toMatchObject({
      status: "archived",
      endedAt: ended.endedAt,
    });

    const workout = getDb()
      .insert(gymWorkouts)
      .values({
        date: "2026-09-08",
        startedAt: "2026-09-08T07:00:00",
        name: "Day 1",
        programId: program.id,
        programWeek: 1,
      })
      .returning()
      .get();
    deleteProgram(program.id);
    expect(() => getProgram(program.id)).toThrow();
    expect(
      getDb()
        .select()
        .from(gymWorkouts)
        .all()
        .find((w) => w.id === workout.id)?.programId,
    ).toBeNull();
    expect(() => deleteProgram(program.id)).toThrow("doesn't exist");
  });
});
