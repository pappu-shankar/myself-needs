import { sqliteTable, integer, real, text } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

/**
 * Single-row, editable thresholds for the insight rules that need a
 * judgment-call number (credit utilization "commonly ~30%", how many idle
 * months of expenses counts as "well above" a buffer, etc.) — same
 * never-hardcode-policy-numbers pattern as tax_settings. See
 * docs/prd/finance/insights.md.
 */
export const insightsSettings = sqliteTable("finance_insights_settings", {
  id: integer("id").primaryKey(),
  creditUtilizationThresholdPercent: real("credit_utilization_threshold_percent")
    .notNull()
    .default(30),
  idleCashMonthsMultiple: real("idle_cash_months_multiple").notNull().default(6),
  staleValuationDays: integer("stale_valuation_days").notNull().default(90),
  recurringPileupThreshold: integer("recurring_pileup_threshold").notNull().default(3),
  budgetHeadroomPercent: real("budget_headroom_percent").notNull().default(70),
  ltcgApproachingPercent: real("ltcg_approaching_percent").notNull().default(90),

  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(current_timestamp)`),
});
