import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

/**
 * Dismissing one insight only dismisses that exact instance — its `id` is
 * content-derived (rule name + the specific record/numbers it's about), so
 * a new instance with new numbers gets a new id and surfaces again even if
 * an old instance of the same rule was dismissed. See docs/prd/finance/insights.md.
 */
export const dismissedInsights = sqliteTable("finance_dismissed_insights", {
  id: text("id").primaryKey(),
  dismissedAt: text("dismissed_at")
    .notNull()
    .default(sql`(current_timestamp)`),
});
