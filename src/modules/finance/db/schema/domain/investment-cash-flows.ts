import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { investmentHoldings } from "./investment-holdings";
import { currencyColumn, minorAmount } from "../currency";
import { provenanceColumns } from "../provenance";
import { voidableColumns } from "../lifecycle";

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
    amountMinor: minorAmount("amount_minor").notNull(),
    currency: currencyColumn(),
    /** Units bought (+) or redeemed (−) by this flow, for unit-priced holdings,
     * scaled by `UNITS_SCALE` (1e6). Null for legacy rows and non-unit
     * holdings. See service/utility/units.ts. */
    unitsScaled: integer("units_scaled"),
    flowType: text("flow_type", {
      enum: ["contribution", "redemption", "dividend", "interest", "maturity"],
    }).notNull(),

    ...provenanceColumns({ source: "user", method: "manual", confidence: "reported" }),
    ...voidableColumns(),

    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    index("finance_investment_cash_flows_holding_date_idx").on(table.holdingId, table.date),
  ],
);
