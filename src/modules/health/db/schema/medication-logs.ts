import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { medications } from "./medications";

/** One row per dose actually taken — a real DB foreign key, since both tables live inside `health` (intra-module, not the cross-module case the plain-ID rule is about). See docs/prd/health.md. */
export const medicationLogs = sqliteTable(
  "health_medication_logs",
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
    index("health_medication_logs_medication_date_idx").on(table.medicationId, table.date),
  ],
);
