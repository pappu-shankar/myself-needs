import { sqliteTable, text, integer, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { CURRENCIES } from "../currency";

/**
 * Dated exchange rates, one series per currency against a single pivot and
 * triangulated for cross-pairs — so adding a currency is one new series rather
 * than N more pairs. Daily close, mid-rate, one row per pair per date.
 *
 * Reference data, not user data: the source at launch is the ECB daily
 * reference series (public domain, EUR pivot, covers USD/GBP/INR). It moves to
 * a shared store refreshed without any vault key once the reference service
 * exists; until then it is cached per vault.
 *
 * No rate is ever invented. A conversion earlier than the first stored rate
 * for a currency is reported as unknown rather than converted at today's rate.
 * See docs/prd/finance/currency-fx.md.
 */
export const fxRates = sqliteTable(
  "finance_fx_rates",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    base: text("base", { enum: CURRENCIES }).notNull(),
    quote: text("quote", { enum: CURRENCIES }).notNull(),
    date: text("date").notNull(),
    /** Scaled by FX_RATE_SCALE (1e8) to keep triangulation exact in integers. */
    rateScaled: integer("rate_scaled").notNull(),
    source: text("source").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    uniqueIndex("finance_fx_rates_pair_date_idx").on(table.base, table.quote, table.date),
  ],
);
