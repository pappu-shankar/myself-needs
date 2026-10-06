import { addDays, todayIso } from "@/lib/dates";
import { sessionsInWeek, streakWeeks, weekStartOf } from "../../engine/calendar";
import { getGymSettings } from "./settings";
import { getPlannedRoutineForDate, getWeekPlan } from "./schedule";
import { listRoutines } from "./routines";
import { getActiveWorkout, listWorkoutDates, listWorkouts } from "./workouts";
import { getWorkoutRecords } from "./history";
import { getActiveProgram } from "./programs";
import { getLatestBodyweight } from "./vitals";
import { buildSessionPlan, programContext } from "./session-plan";
import { getReadiness, getRecentRecords } from "./analytics";
import { getGymInsights } from "./insights/engine";

/** Everything the gym hub shows, in one call (each part is cheap; see the individual services). */
export function getGymOverview(today: string = todayIso()) {
  const settings = getGymSettings();
  const planned = getPlannedRoutineForDate(today);
  const active = getActiveWorkout();
  const dates = listWorkoutDates(addDays(today, -730), today);
  const records = getWorkoutRecords({ from: addDays(today, -70), to: today });
  return {
    today,
    settings,
    planned,
    // Preview only when nothing is in progress — the active session is what matters then.
    preview:
      planned.routineId !== null && !active ? buildSessionPlan(planned.routineId, today) : null,
    active: active
      ? {
          id: active.id,
          name: active.name,
          startedAt: active.startedAt,
          setsDone: active.entries.reduce(
            (n, e) => n + e.sets.filter((s) => s.completed && s.kind !== "warmup").length,
            0,
          ),
          setsTotal: active.entries.reduce(
            (n, e) => n + e.sets.filter((s) => s.kind !== "warmup").length,
            0,
          ),
        }
      : null,
    week: getWeekPlan(today),
    /** Dates in this Monday–Sunday week with a finished session. */
    loggedThisWeek: [...new Set(dates.filter((d) => d >= weekStartOf(today)))],
    hasRoutines: listRoutines({ limit: 1 }).length > 0,
    sessionsThisWeek: sessionsInWeek(dates, today),
    streakWeeks: streakWeeks(dates, today),
    recent: listWorkouts({ limit: 3 }).rows,
    readiness: getReadiness(today, records),
    program: programContext(getActiveProgram(), today),
    recentRecords: getRecentRecords(today, 7, records),
    insights: getGymInsights(today),
    bodyweight: getLatestBodyweight(),
  };
}
export type GymOverview = ReturnType<typeof getGymOverview>;

/** The dashboard's small gym tile — deliberately cheap (no prescriptions, insights or analytics). */
export function getGymDashboardSummary(today: string = todayIso()) {
  const dates = listWorkoutDates(weekStartOf(today), today);
  const planned = getPlannedRoutineForDate(today);
  const active = getActiveWorkout();
  return {
    sessionsThisWeek: sessionsInWeek(dates, today),
    weeklyGoal: getGymSettings().weeklySessionGoal,
    activeWorkoutName: active?.name ?? null,
    todayRoutineName: planned.routineName,
    trainedToday: dates.includes(today),
  };
}
