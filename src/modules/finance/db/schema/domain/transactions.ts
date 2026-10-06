import { sqliteTable, text, integer, index, uniqueIndex } from "drizzle-orm/sqlite-core";
import { money } from "../money";
import { sql } from "drizzle-orm";
import { accounts } from "./accounts";
import { categories } from "./categories";
import { recurringRules } from "./recurring-rules";
import { currencyColumn, minorAmount } from "../currency";
import { provenanceColumns } from "../provenance";
import { voidableColumns } from "../lifecycle";

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
    currency: currencyColumn(),
    /** Cross-currency transfers carry both legs, so the rate that actually
     * applied is implied by the two amounts and never needs a lookup — the
     * truth is what the bank did. Null for same-currency transfers. */
    toAmountMinor: minorAmount("to_amount_minor"),
    toCurrency: text("to_currency"),
    date: text("date").notNull(),
    note: text("note"),
    /** Set only when this transaction was created by confirming a recurring
     * due item — see service/recurring.ts. Null for every manually-entered
     * transaction. */
    recurringRuleId: integer("recurring_rule_id").references(() => recurringRules.id),
    /** For recurring-generated transactions: the due date (YYYY-MM-DD) of the
     * period this transaction settles. Unique per rule, so confirming the same
     * period twice (double submit, two tabs) can't double-post. */
    periodStart: text("period_start"),
    ...provenanceColumns({ source: "user", method: "manual", confidence: "reported" }),
    ...voidableColumns(),

    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    index("finance_transactions_account_date_idx").on(table.accountId, table.date),
    index("finance_transactions_category_date_idx").on(table.categoryId, table.date),
    index("finance_transactions_recurring_rule_idx").on(table.recurringRuleId),
    uniqueIndex("finance_transactions_rule_period_idx")
      .on(table.recurringRuleId, table.periodStart)
      .where(sql`${table.recurringRuleId} IS NOT NULL AND ${table.periodStart} IS NOT NULL`),
    index("finance_transactions_to_account_date_idx").on(table.toAccountId, table.date),
    index("finance_transactions_date_idx").on(table.date),
  ],
);
