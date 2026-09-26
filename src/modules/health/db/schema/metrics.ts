import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

/**
 * One mechanism covers every tracked vital (weight, sleep, exercise, or a
 * free-form custom metric) — `type` discriminates for trending/grouping,
 * `label` is the display name (fixed per type, free-text for `custom`).
 * See docs/prd/health.md.
 */
export const healthMetrics = sqliteTable("health_metrics", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  type: text("type", { enum: ["weight", "sleep_hours", "exercise_minutes", "custom"] })
    .notNull()
    .default("custom"),
  date: text("date").notNull(),
  label: text("label").notNull(),
  value: real("value"),
  unit: text("unit"),
  note: text("note"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(current_timestamp)`),
});
