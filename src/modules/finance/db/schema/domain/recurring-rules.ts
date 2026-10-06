import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { accounts } from "./accounts";
import { categories } from "./categories";
import { goals } from "./goals";
import { currencyColumn, minorAmount } from "../currency";
import { archivableColumns } from "../lifecycle";

/**
 * Same account_id/to_account_id/category_id shape as `finance_transactions`
 * (income/expense use category_id, transfer uses to_account_id). No silent
 * auto-logging — this only describes the schedule; see service/recurring.ts
 * for how due-but-unlogged periods are derived on demand. See
 * docs/prd/finance/recurring-transactions.md.
 */
export const recurringRules = sqliteTable("finance_recurring_rules", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  type: text("type", { enum: ["income", "expense", "transfer"] }).notNull(),
  accountId: integer("account_id")
    .notNull()
    .references(() => accounts.id),
  toAccountId: integer("to_account_id").references(() => accounts.id),
  categoryId: integer("category_id").references(() => categories.id),
  amountMinor: minorAmount("amount_minor").notNull(),
  currency: currencyColumn(),
  toAmountMinor: minorAmount("to_amount_minor"),
  toCurrency: text("to_currency"),
  frequency: text("frequency", {
    enum: ["weekly", "monthly", "quarterly", "half_yearly", "yearly"],
  }).notNull(),
  startDate: text("start_date").notNull(),
  endDate: text("end_date"),
  note: text("note"),

  /** The financial goal this schedule contributes to — a real foreign key, as
   * `finance_goals` is in this module. See docs/prd/finance/goals.md. */
  linkedGoalId: integer("linked_goal_id").references(() => goals.id),

  /** Paused rules stop producing due periods without rewriting any confirmed
   * history. See docs/prd/finance/recurring-transactions.md. */
  pausedAt: text("paused_at"),
  ...archivableColumns(),

  createdAt: text("created_at")
    .notNull()
    .default(sql`(current_timestamp)`),
});
