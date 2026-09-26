import { sqliteTable, text, integer, real, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { investmentHoldings } from "./investment-holdings";

/**
 * Only for unit-priced holdings (equity, mutual funds, gold, bonds) — current
 * value = units × latest price here. Manual entry for everything except
 * domestic mutual funds, which get a "Refresh NAV" button backed by
 * `price-providers/mutual-fund-nav.ts`. See docs/prd/finance/investments.md.
 */
export const investmentValuations = sqliteTable(
  "finance_investment_valuations",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    holdingId: integer("holding_id")
      .notNull()
      .references(() => investmentHoldings.id),
    date: text("date").notNull(),
    pricePerUnit: real("price_per_unit").notNull(),

    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    index("finance_investment_valuations_holding_date_idx").on(table.holdingId, table.date),
  ],
);
