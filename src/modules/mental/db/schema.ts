import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

/**
 * Mental-health-specific medications only — general/physical medications
 * live in `health_medications` instead (see docs/prd/mental.md and
 * docs/prd/health.md for the split). Same shape as `health`'s medications:
 * `frequency` is a free-text reference note, adherence is tracked by actual
 * logged doses in `mental_medication_logs`, not a parsed schedule.
 */
export const medications = sqliteTable("mental_medications", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  dosage: text("dosage"),
  frequency: text("frequency"),
  startDate: text("start_date").notNull(),
  endDate: text("end_date"),
  notes: text("notes"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(current_timestamp)`),
});

/** One row per dose actually taken. */
export const medicationLogs = sqliteTable(
  "mental_medication_logs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    medicationId: integer("medication_id")
      .notNull()
      .references(() => medications.id),
    date: text("date").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    index("mental_medication_logs_medication_date_idx").on(table.medicationId, table.date),
  ],
);
