import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

/**
 * One row per asset class, freely rewritable — a formula-driven starting
 * point (see service/allocation.ts), never financial advice. The UI shows
 * current-vs-target with the variance so the user decides whether/how to
 * rebalance. See docs/prd/finance/reports-allocation.md.
 */
export const allocationTargets = sqliteTable("finance_allocation_targets", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  assetClass: text("asset_class", { enum: ["equity", "debt", "gold", "cash"] })
    .notNull()
    .unique(),
  targetPercentage: real("target_percentage").notNull(),

  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(current_timestamp)`),
});
