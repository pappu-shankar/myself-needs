import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { money } from "../money";
import { sql } from "drizzle-orm";
import { accounts } from "./accounts";
import { categories } from "./categories";
import { recurringRules } from "./recurring-rules";

/**
 * income/expense: account_id + category_id.
 * transfer: account_id (from) + to_account_id, category_id is null.
 * See docs/prd/finance/accounts-transactions.md.
 */
export const transactions = sqliteTable(
  "finance_transactions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    type: text("type", { enum: ["income", "expense", "transfer"] }).notNull(),
    accountId: integer("account_id")
      .notNull()
      .references(() => accounts.id),
    toAccountId: integer("to_account_id").references(() => accounts.id),
    categoryId: integer("category_id").references(() => categories.id),
    amount: money("amount").notNull(),
    date: text("date").notNull(),
    note: text("note"),
    /** Set only when this transaction was created by confirming a recurring
     * due item — see service/recurring.ts. Null for every manually-entered
     * transaction. */
    recurringRuleId: integer("recurring_rule_id").references(() => recurringRules.id),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    index("finance_transactions_account_date_idx").on(table.accountId, table.date),
    index("finance_transactions_category_date_idx").on(table.categoryId, table.date),
    index("finance_transactions_recurring_rule_idx").on(table.recurringRuleId),
  ],
);
