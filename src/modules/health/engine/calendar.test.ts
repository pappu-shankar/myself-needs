import { describe, expect, it } from "vitest";
import {
  activityHeatmap,
  longestStreakWeeks,
  sessionsInWeek,
  streakWeeks,
  weekStartOf,
  workoutMinutes,
} from "./calendar";
import type { SetRecord, WorkoutRecord } from "./types";

const set = (over: Partial<SetRecord> = {}): SetRecord => ({
  kind: "working",
  weightKg: 100,
  reps: 5,
  durationSec: null,
  distanceKm: null,
  rir: null,
  rpe: null,
  completed: true,
  ...over,
});

const workout = (
  date: string,
  times: [string, string | null] = ["10:00:00", "11:00:00"],
  sets: SetRecord[] = [set()],
): WorkoutRecord => ({
  id: 1,
  date,
  startedAt: `${date}T${times[0]}`,
  finishedAt: times[1] === null ? null : `${date}T${times[1]}`,
  sessionRpe: null,
  entries: [
    { exerciseId: 1, exerciseName: "Squat", mode: "reps", isBodyweight: false, muscles: {}, sets },
  ],
});

describe("weekStartOf", () => {
  it("returns the Monday of the week (Mon–Sun weeks)", () => {
    expect(weekStartOf("2026-09-28")).toBe("2026-09-28"); // Monday
    expect(weekStartOf("2026-10-01")).toBe("2026-09-28"); // Thursday
    expect(weekStartOf("2026-10-04")).toBe("2026-09-28"); // Sunday belongs to the week before
  });

  it("crosses month and year boundaries", () => {
    expect(weekStartOf("2026-01-01")).toBe("2025-12-29");
    expect(weekStartOf("2024-03-03")).toBe("2024-02-26"); // leap February
  });
});

describe("workoutMinutes", () => {
  it("uses finishedAt − startedAt, rounded to whole minutes", () => {
    expect(workoutMinutes(workout("2026-10-01", ["10:00:00", "11:05:30"]))).toBe(66);
    expect(workoutMinutes(workout("2026-10-01", ["10:00", "10:45"]))).toBe(45);
  });

  it("handles a session that runs past midnight", () => {
    const w = workout("2026-10-01");
    w.startedAt = "2026-10-01T23:30:00";
    w.finishedAt = "2026-10-02T00:45:00";
    expect(workoutMinutes(w)).toBe(75);
  });

  it("falls back to 2.5 min per completed set when unfinished", () => {
    const sets = [set(), set(), set({ kind: "warmup" }), set({ completed: false })];
    expect(workoutMinutes(workout("2026-10-01", ["10:00:00", null], sets))).toBe(8); // 3 × 2.5 = 7.5
  });

  it("falls back when the span is non-positive, implausibly long or unparseable", () => {
    const sets = [set(), set()];
    expect(workoutMinutes(workout("2026-10-01", ["11:00:00", "10:00:00"], sets))).toBe(5);
    const forgotten = workout("2026-10-01", ["10:00:00", null], sets);
    forgotten.finishedAt = "2026-10-02T09:00:00"; // left open overnight
    expect(workoutMinutes(forgotten)).toBe(5);
    const garbage = workout("2026-10-01", ["10:00:00", "11:00:00"], sets);
    garbage.startedAt = "yesterday";
    expect(workoutMinutes(garbage)).toBe(5);
  });

  it("is 0 for an empty unfinished workout", () => {
    expect(workoutMinutes(workout("2026-10-01", ["10:00:00", null], []))).toBe(0);
  });
});

describe("activityHeatmap", () => {
  it("covers whole Monday–Sunday weeks ending with endDate's week", () => {
    const days = activityHeatmap([], "2026-10-01");
    expect(days).toHaveLength(53 * 7);
    expect(days[0].date).toBe(weekStartOf(days[0].date));
    expect(days.at(-1)?.date).toBe("2026-10-04"); // the Sunday after endDate (Thursday)
    expect(days.every((d) => d.level === 0 && d.minutes === 0 && d.sessions === 0)).toBe(true);
  });

  it("sums minutes and sessions per day and buckets them into levels", () => {
    const days = activityHeatmap(
      [
        workout("2026-09-28", ["10:00", "10:20"]), // 20 min → 1
        workout("2026-09-29", ["10:00", "10:45"]), // 45 → 2
        workout("2026-09-30", ["10:00", "11:00"]), // 60 → 3
        workout("2026-10-01", ["10:00", "10:50"]), // 50 + 40 = 90 → 4
        workout("2026-10-01", ["18:00", "18:40"]),
        workout("2025-01-01"), // outside the window, ignored
      ],
      "2026-10-01",
      2,
    );
    expect(days).toHaveLength(14);
    expect(days[0].date).toBe("2026-09-21");
    const byDate = Object.fromEntries(days.map((d) => [d.date, d]));
    expect(byDate["2026-09-28"]).toMatchObject({ minutes: 20, sessions: 1, level: 1 });
    expect(byDate["2026-09-29"].level).toBe(2);
    expect(byDate["2026-09-30"].level).toBe(3);
    expect(byDate["2026-10-01"]).toEqual({
      date: "2026-10-01",
      minutes: 90,
      sessions: 2,
      level: 4,
    });
    expect(byDate["2026-10-02"].level).toBe(0);
  });

  it("marks a logged session with no minutes as level 1, not empty", () => {
    const [day] = activityHeatmap([workout("2026-09-28", ["10:00", null], [])], "2026-09-28", 1);
    expect(day).toMatchObject({ minutes: 0, sessions: 1, level: 1 });
  });
});

describe("streakWeeks", () => {
  // 2026-10-04 is a Sunday; its week starts 2026-09-28.
  const dates = ["2026-09-14", "2026-09-22", "2026-09-29", "2026-08-31"];

  it("counts back through consecutive weeks, including the current one once met", () => {
    expect(streakWeeks(dates, "2026-10-04")).toBe(3);
  });

  it("measures up to last week while the current week is still open", () => {
    expect(streakWeeks(["2026-09-14", "2026-09-22"], "2026-09-30")).toBe(2);
    expect(streakWeeks(["2026-09-14", "2026-09-22"], "2026-10-06")).toBe(0); // last week missed
  });

  it("applies a weekly minimum", () => {
    const three = ["2026-09-21", "2026-09-23", "2026-09-25", "2026-09-14", "2026-09-16"];
    expect(streakWeeks(three, "2026-09-30", 2)).toBe(2);
    expect(streakWeeks(three, "2026-09-30", 3)).toBe(1);
    // two sessions on the same day are two sessions
    expect(streakWeeks(["2026-09-29", "2026-09-29"], "2026-09-30", 2)).toBe(1);
  });

  it("is 0 with no history and ignores sessions dated after today", () => {
    expect(streakWeeks([], "2026-10-04")).toBe(0);
    expect(streakWeeks(["2026-10-05"], "2026-10-04")).toBe(0);
  });

  it("crosses year boundaries", () => {
    expect(streakWeeks(["2025-12-24", "2025-12-31", "2026-01-07"], "2026-01-08")).toBe(3);
  });
});

describe("longestStreakWeeks", () => {
  it("finds the longest run anywhere in history", () => {
    const dates = [
      "2025-12-22",
      "2025-12-29",
      "2026-01-05",
      "2026-01-12", // 4 in a row across New Year
      "2026-02-02",
      "2026-02-09",
    ];
    expect(longestStreakWeeks(dates)).toBe(4);
    expect(longestStreakWeeks([])).toBe(0);
    expect(longestStreakWeeks(["2026-01-01"])).toBe(1);
  });

  it("applies the weekly minimum", () => {
    const dates = ["2026-01-05", "2026-01-06", "2026-01-12", "2026-01-19", "2026-01-20"];
    expect(longestStreakWeeks(dates, 2)).toBe(1);
    expect(longestStreakWeeks(dates, 1)).toBe(3);
  });
});

describe("sessionsInWeek", () => {
  it("counts sessions in the Monday–Sunday week containing the date", () => {
    const dates = [
      "2026-09-27",
      "2026-09-28",
      "2026-10-01",
      "2026-10-01",
      "2026-10-04",
      "2026-10-05",
    ];
    expect(sessionsInWeek(dates, "2026-09-30")).toBe(4);
    expect(sessionsInWeek([], "2026-09-30")).toBe(0);
  });
});
