import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setupTestDb, teardownTestDb } from "@/test/db";
import { archiveRoutine, createRoutine, deleteRoutine } from "./routines";
import {
  clearScheduleOverride,
  clearWeekSchedule,
  getPlannedRoutineForDate,
  getWeekPlan,
  getWeekSchedule,
  listScheduleOverrides,
  setScheduleOverride,
  setWeekdayRoutine,
  startOfTrainingWeek,
} from "./schedule";

beforeEach(setupTestDb);
afterEach(teardownTestDb);

// 2026-10-05 is a Monday.
const MON = "2026-10-05";
const WED = "2026-10-07";
const SUN = "2026-10-11";

describe("weekly plan", () => {
  it("returns all seven weekdays and assigns or clears one", () => {
    const push = createRoutine({ name: "Push" });
    expect(getWeekSchedule()).toHaveLength(7);
    setWeekdayRoutine(1, push.id);
    const monday = getWeekSchedule()[1];
    expect(monday).toMatchObject({
      weekday: 1,
      label: "Monday",
      routineId: push.id,
      routineName: "Push",
    });
    setWeekdayRoutine(1, null);
    expect(getWeekSchedule()[1].routineId).toBeNull();
    setWeekdayRoutine(2, push.id);
    clearWeekSchedule();
    expect(getWeekSchedule().every((d) => d.routineId === null)).toBe(true);
  });

  it("refuses bad weekdays and archived or missing routines", () => {
    const push = createRoutine({ name: "Push" });
    expect(() => setWeekdayRoutine(7, push.id)).toThrow("day of the week");
    expect(() => setWeekdayRoutine(-1, null)).toThrow("day of the week");
    expect(() => setWeekdayRoutine(1, 999)).toThrow("doesn't exist");
    archiveRoutine(push.id);
    expect(() => setWeekdayRoutine(1, push.id)).toThrow("archived");
  });
});

describe("planned routine for a date", () => {
  it("follows the week, then lets an override win, including a rest day", () => {
    const push = createRoutine({ name: "Push" });
    const legs = createRoutine({ name: "Legs" });
    setWeekdayRoutine(1, push.id);

    expect(getPlannedRoutineForDate(MON)).toMatchObject({
      routineId: push.id,
      routineName: "Push",
      source: "week",
      isRestOverride: false,
      weekday: 1,
    });
    expect(getPlannedRoutineForDate(WED)).toMatchObject({ routineId: null, source: "none" });

    setScheduleOverride(MON, legs.id, " moved from Sat ");
    expect(getPlannedRoutineForDate(MON)).toMatchObject({
      routineId: legs.id,
      source: "override",
      note: "moved from Sat",
    });

    setScheduleOverride(MON, null);
    expect(getPlannedRoutineForDate(MON)).toMatchObject({
      routineId: null,
      source: "override",
      isRestOverride: true,
    });

    clearScheduleOverride(MON);
    expect(getPlannedRoutineForDate(MON).source).toBe("week");
  });

  it("treats archived routines as none — an archived override falls back to the week", () => {
    const push = createRoutine({ name: "Push" });
    const legs = createRoutine({ name: "Legs" });
    setWeekdayRoutine(1, push.id);
    setScheduleOverride(MON, legs.id);
    archiveRoutine(legs.id);
    expect(getPlannedRoutineForDate(MON)).toMatchObject({ routineId: push.id, source: "week" });
    archiveRoutine(push.id);
    expect(getPlannedRoutineForDate(MON)).toMatchObject({ routineId: null, source: "none" });
    expect(getWeekSchedule()[1]).toMatchObject({ routineId: push.id, routineArchived: true });
  });

  it("drops a deleted routine from the week", () => {
    const push = createRoutine({ name: "Push" });
    setWeekdayRoutine(1, push.id);
    deleteRoutine(push.id);
    expect(getWeekSchedule()[1].routineId).toBeNull();
    expect(getPlannedRoutineForDate(MON).source).toBe("none");
  });

  it("validates dates", () => {
    expect(() => getPlannedRoutineForDate("2026-02-30")).toThrow("calendar date");
    expect(() => setScheduleOverride("nope", null)).toThrow("calendar date");
    expect(() => setScheduleOverride(MON, null, "x".repeat(201))).toThrow("200");
  });
});

describe("week plan and overrides list", () => {
  it("builds Monday to Sunday for any date in the week", () => {
    const push = createRoutine({ name: "Push" });
    const pull = createRoutine({ name: "Pull" });
    setWeekdayRoutine(1, push.id);
    setWeekdayRoutine(0, pull.id); // Sunday — the last day of a Monday-first week
    setScheduleOverride(WED, pull.id);

    expect(startOfTrainingWeek(SUN)).toBe(MON);
    expect(startOfTrainingWeek(MON)).toBe(MON);
    const plan = getWeekPlan(WED);
    expect(plan.map((d) => d.date)).toEqual([
      MON,
      "2026-10-06",
      WED,
      "2026-10-08",
      "2026-10-09",
      "2026-10-10",
      SUN,
    ]);
    expect(plan.map((d) => d.source)).toEqual([
      "week",
      "none",
      "override",
      "none",
      "none",
      "none",
      "week",
    ]);
    expect(plan[6]).toMatchObject({ weekday: 0, routineId: pull.id });
    expect(getWeekPlan(SUN).map((d) => d.date)).toEqual(plan.map((d) => d.date));
  });

  it("lists overrides in a bounded range", () => {
    const push = createRoutine({ name: "Push" });
    setScheduleOverride(WED, push.id);
    setScheduleOverride(MON, null, "sick");
    setScheduleOverride("2026-11-01", push.id);
    expect(listScheduleOverrides(MON, SUN)).toEqual([
      { date: MON, routineId: null, routineName: null, routineArchived: false, note: "sick" },
      { date: WED, routineId: push.id, routineName: "Push", routineArchived: false, note: null },
    ]);
    expect(() => listScheduleOverrides(SUN, MON)).toThrow("before the start");
    expect(() => listScheduleOverrides("2026-01-01", "2027-12-31")).toThrow("at most");
  });
});
