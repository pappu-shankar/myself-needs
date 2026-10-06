import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { gymRoutines } from "./routines";

/** The standing weekly plan: one row per weekday (0 = Sunday) that has a routine. */
export const gymWeekSchedule = sqliteTable("health_week_schedule", {
  weekday: integer("weekday").primaryKey(),
  routineId: integer("routine_id").references(() => gymRoutines.id, { onDelete: "set null" }),
});

/**
 * A one-off change to a single date without touching the weekly plan — moving
 * a missed session, or declaring a rest day (`routine_id` null).
 */
export const gymScheduleOverrides = sqliteTable("health_schedule_overrides", {
  date: text("date").primaryKey(),
  routineId: integer("routine_id").references(() => gymRoutines.id, { onDelete: "set null" }),
  note: text("note"),
});
