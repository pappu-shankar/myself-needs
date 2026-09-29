import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { money } from "../money";
import { sql } from "drizzle-orm";

/**
 * checking | savings | cash | credit_card | loan | investment | receivable
 * See docs/prd/finance/accounts-transactions.md.
 */
export const accounts = sqliteTable("finance_accounts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  type: text("type", {
    enum: ["checking", "savings", "cash", "credit_card", "loan", "investment", "receivable"],
  }).notNull(),
  openingBalance: money("opening_balance").notNull().default(0),

  // credit_card only
  creditLimit: money("credit_limit"),

  // credit_card + loan
  interestRate: real("interest_rate"),

  // loan only — see docs/prd/finance/debts-loans.md
  originalAmount: money("original_amount"),
  emiAmount: money("emi_amount"),
  tenureMonths: integer("tenure_months"),

  /**
   * Opt-out, not opt-in — defaults to counted for every existing type.
   * `receivable` accounts are the one case where the create form lets you
   * flip this off at creation time (money owed by family, say, that you
   * don't want inflating your net worth until/unless you actually collect
   * it). No edit-account feature exists yet, so this is create-time only.
   */
  excludeFromNetWorth: integer("exclude_from_net_worth", { mode: "boolean" })
    .notNull()
    .default(false),

  createdAt: text("created_at")
    .notNull()
    .default(sql`(current_timestamp)`),
});
