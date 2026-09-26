import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

/**
 * Reference info only (lock-in countdown, current notified rate) shown
 * alongside a holding — a govt-scheme holding still uses the plain
 * cash-flow mechanism for its own value, same as every other instrument.
 * Pre-seeded on first read (see db/queries/scheme-templates.ts) rather than
 * via a data migration — see docs/prd/finance/investments.md.
 */
export const schemeTemplates = sqliteTable("finance_scheme_templates", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  lockInMonths: integer("lock_in_months"),
  /** Editable — govt scheme rates get revised periodically (e.g. quarterly for PPF). */
  interestRate: real("interest_rate"),
  notes: text("notes"),

  createdAt: text("created_at")
    .notNull()
    .default(sql`(current_timestamp)`),
});
