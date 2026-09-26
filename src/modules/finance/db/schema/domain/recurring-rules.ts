import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { accounts } from "./accounts";
import { categories } from "./categories";

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
  amount: real("amount").notNull(),
  frequency: text("frequency", {
    enum: ["weekly", "monthly", "quarterly", "half_yearly", "yearly"],
  }).notNull(),
  startDate: text("start_date").notNull(),
  endDate: text("end_date"),
  note: text("note"),

  /** Points at `plans_goals.id` by plain value only — never a DB-level foreign key. See docs/prd/finance/goal-linked-investments.md. */
  linkedGoalId: integer("linked_goal_id"),

  createdAt: text("created_at")
    .notNull()
    .default(sql`(current_timestamp)`),
});
