import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { money } from "../money";
import { sql } from "drizzle-orm";
import { entities } from "./entities";
import { institutions } from "./institutions";
import { currencyColumn } from "../currency";
import { provenanceColumns } from "../provenance";
import { archivableColumns } from "../lifecycle";

/**
 * checking | savings | cash | credit_card | loan | investment | receivable
 * See docs/prd/finance/accounts-transactions.md.
 */
export const accounts = sqliteTable("finance_accounts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  type: text("type", {
    enum: [
      "checking",
      "savings",
      "cash",
      "credit_card",
      /** Draws against a limit with no fixed EMI — line of credit, overdraft,
       * BNPL, margin loan. Takes `finance_credit_terms`, not loan terms. */
      "revolving_credit",
      "loan",
      "investment",
      "receivable",
    ],
  }).notNull(),

  /** Whose money it is. Nullable until backfilled to the seeded `Self` entity. */
  entityId: integer("entity_id").references(() => entities.id),
  /** Where it is held. Stays null for existing rows: the only signal is the
   * free-text name ("HDFC Savings"), and guessing from that is worse than
   * leaving it for the user to set. */
  institutionId: integer("institution_id").references(() => institutions.id),
  /** Pinned here, so every transaction leg on the account shares it and
   * balance computation stays one exact integer sum per account. */
  currency: currencyColumn(),
  kind: text("kind", { enum: ["asset", "liability"] })
    .notNull()
    .default("asset"),
  /** Makes the sign convention explicit instead of inferred from `type`. The
   * sign itself does not change — it is baked into every historical row, and
   * flipping it would be a data mutation with no safe inverse. */
  normalBalance: text("normal_balance", { enum: ["debit", "credit"] })
    .notNull()
    .default("debit"),
  liquidity: text("liquidity", { enum: ["liquid", "semi_liquid", "illiquid"] })
    .notNull()
    .default("liquid"),
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

  ...provenanceColumns({ source: "user", method: "manual", confidence: "reported" }),
  ...archivableColumns(),

  createdAt: text("created_at")
    .notNull()
    .default(sql`(current_timestamp)`),
});
