import { sqliteTable, text, integer, real, index } from "drizzle-orm/sqlite-core";
import { money } from "../money";
import { sql } from "drizzle-orm";
import { investmentHoldings } from "./investment-holdings";

/**
 * The one mechanism that covers every instrument type without bespoke
 * per-type schema, and what makes XIRR/IRR/CAGR computable uniformly. See
 * docs/prd/finance/investments.md and docs/prd/finance/returns-analytics.md.
 * `amount`: negative = money in/contributed, positive = money out/received.
 */
export const investmentCashFlows = sqliteTable(
  "finance_investment_cash_flows",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    holdingId: integer("holding_id")
      .notNull()
      .references(() => investmentHoldings.id),
    date: text("date").notNull(),
    amount: money("amount").notNull(),
    /** Units bought (+) or redeemed (−) by this flow, for unit-priced holdings.
     * Null for legacy rows and non-unit holdings. */
    units: real("units"),
    flowType: text("flow_type", {
      enum: ["contribution", "redemption", "dividend", "interest", "maturity"],
    }).notNull(),

    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    index("finance_investment_cash_flows_holding_date_idx").on(table.holdingId, table.date),
  ],
);
