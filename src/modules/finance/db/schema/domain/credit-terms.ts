import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { accounts } from "./accounts";
import { currencyColumn, minorAmount } from "../currency";

/**
 * Reference data for revolving facilities — credit cards, lines of credit,
 * overdrafts, BNPL, margin loans. They draw against a limit with no fixed EMI,
 * so there is no amortization schedule to compute and they take these terms
 * rather than `finance_loan_terms`.
 *
 * See docs/prd/finance/debts-loans.md.
 */
export const creditTerms = sqliteTable("finance_credit_terms", {
  accountId: integer("account_id")
    .primaryKey()
    .references(() => accounts.id),
  creditLimitMinor: minorAmount("credit_limit_minor"),
  currency: currencyColumn(),
  aprBps: integer("apr_bps"),
  /** Day of month the statement is generated, and the payment due day. */
  statementDay: integer("statement_day"),
  dueDay: integer("due_day"),
  notes: text("notes"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(current_timestamp)`),
});
