import { sqliteTable, text, integer, uniqueIndex } from "drizzle-orm/sqlite-core";
import { money } from "../money";
import { sql } from "drizzle-orm";
import { categories } from "./categories";
import { currencyColumn } from "../currency";

/**
 * One row per (category, effective_from) — changing a budget going forward
 * inserts a new row rather than updating in place, so history of what the
 * limit used to be is never lost. Actual spend is never stored here; it's
 * computed on demand from `finance_transactions` (see queries/budgets.ts).
 * See docs/prd/finance/budgets.md.
 */
export const budgets = sqliteTable(
  "finance_budgets",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    categoryId: integer("category_id")
      .notNull()
      .references(() => categories.id),
    monthlyLimit: money("monthly_limit").notNull(),
    /** The budget's own currency. Spend in other currencies converts into it
     * for comparison, rather than the limit converting into base. */
    currency: currencyColumn(),
    effectiveFrom: text("effective_from").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    uniqueIndex("finance_budgets_category_effective_idx").on(table.categoryId, table.effectiveFrom),
  ],
);
