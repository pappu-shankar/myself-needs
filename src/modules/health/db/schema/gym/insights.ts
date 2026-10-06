import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

/**
 * Dismissed gym insights. As in finance, an insight id is content-derived, so
 * dismissing one instance doesn't hide a later one with different numbers.
 */
export const gymDismissedInsights = sqliteTable("health_gym_dismissed_insights", {
  id: text("id").primaryKey(),
  dismissedAt: text("dismissed_at")
    .notNull()
    .default(sql`(current_timestamp)`),
});
