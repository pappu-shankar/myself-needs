import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { currencyColumn } from "../currency";

/**
 * Single-row settings, scoped to finance (not a cross-module settings
 * system — nothing else needs one yet). Holds the optional DOB used to
 * pre-fill the age-based suggested allocation target, plus whether the
 * first-visit "Getting started" checklist on the finance hub has been
 * dismissed. See docs/prd/finance/reports-allocation.md.
 */
export const financeSettings = sqliteTable("finance_settings", {
  id: integer("id").primaryKey(),
  dateOfBirth: text("date_of_birth"),
  /** Reporting currency. A read-time display setting only — never written
   * into a value row, so switching it re-converts and moves no history. */
  baseCurrency: currencyColumn("base_currency"),
  gettingStartedDismissed: integer("getting_started_dismissed", { mode: "boolean" })
    .notNull()
    .default(false),

  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(current_timestamp)`),
});
