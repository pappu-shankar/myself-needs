import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

/**
 * A once-a-day 1–5 self-rating feeding the readiness score (engine/readiness.ts),
 * alongside that night's `sleep_hours` metric. Soreness and stress: 5 = worst.
 */
export const gymReadinessCheckins = sqliteTable("health_readiness_checkins", {
  date: text("date").primaryKey(),
  sleepQuality: integer("sleep_quality").notNull(),
  energy: integer("energy").notNull(),
  soreness: integer("soreness").notNull(),
  stress: integer("stress").notNull(),
  motivation: integer("motivation").notNull(),
  note: text("note"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(current_timestamp)`),
});
