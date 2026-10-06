import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { PROGRAM_KINDS, PROGRAM_STATUSES } from "../../../gym-types";

/**
 * A periodized stretch of training laid over the weekly plan. At most one is
 * `active`. The current week is derived from `start_date`, never stored.
 * - block: `weeks` long; sets ramp by `set_ramp_per_week`; the final week is a
 *   deload when `deload_final_week`.
 * - wendler: repeating 4-week 5/3/1 cycles (`weeks` = planned total) acting on
 *   routine entries whose scheme is `wendler_*`.
 * See engine/periodization.ts and engine/wendler.ts.
 */
export const gymPrograms = sqliteTable(
  "health_programs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    kind: text("kind", { enum: PROGRAM_KINDS }).notNull(),
    startDate: text("start_date").notNull(),
    weeks: integer("weeks").notNull(),
    setRampPerWeek: integer("set_ramp_per_week").notNull().default(0),
    deloadFinalWeek: integer("deload_final_week", { mode: "boolean" }).notNull().default(true),
    status: text("status", { enum: PROGRAM_STATUSES }).notNull().default("active"),
    endedAt: text("ended_at"),
    notes: text("notes"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [index("health_programs_status_idx").on(table.status)],
);
