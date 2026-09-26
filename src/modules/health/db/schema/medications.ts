import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

/** `frequency` is a free-text reference note (e.g. "twice daily") — adherence is tracked by actual logged doses in `health_medication_logs`, not by matching against a parsed schedule. See docs/prd/health.md. */
export const medications = sqliteTable("health_medications", {
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
