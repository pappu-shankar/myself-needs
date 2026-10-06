import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { accounts } from "./accounts";
import { currencyColumn, minorAmount } from "../currency";

/**
 * Reference data for amortization, one row per loan account. These were
 * nullable columns on `finance_accounts`, where they applied to one of seven
 * account types and were null for the rest.
 *
 * The loan's *balance* is not here: it stays ledger-derived from transactions,
 * and negative. Terms-derived outstanding and ledger-derived balance are shown
 * as a reconciliation drift rather than one overwriting the other — see
 * docs/prd/finance/debts-loans.md.
 *
 * Rates are integer basis points for the same reason ownership stakes are:
 * they multiply money.
 */
export const loanTerms = sqliteTable("finance_loan_terms", {
  accountId: integer("account_id")
    .primaryKey()
    .references(() => accounts.id),
  originalAmountMinor: minorAmount("original_amount_minor"),
  currency: currencyColumn(),
  rateBps: integer("rate_bps"),
  rateType: text("rate_type", { enum: ["fixed", "floating"] }),
  tenureMonths: integer("tenure_months"),
  emiMinor: minorAmount("emi_minor"),
  firstEmiDate: text("first_emi_date"),
  /** How the schedule is computed — reducing balance is the Indian default. */
  scheduleBasis: text("schedule_basis", { enum: ["reducing_balance", "flat"] })
    .notNull()
    .default("reducing_balance"),
  feesMinor: minorAmount("fees_minor"),
  notes: text("notes"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(current_timestamp)`),
});
