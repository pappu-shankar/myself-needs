import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { accounts } from "./accounts";
import { schemeTemplates } from "./scheme-templates";

/**
 * Every instrument type (equity, mutual funds, bonds, gold, FD/RD, chit
 * funds, govt schemes) is one row here plus entries in the shared
 * `investment_cash_flows` ledger — see docs/prd/finance/investments.md.
 * `account_id` is nullable: a holding can be standalone, not tied to a
 * brokerage/bank account row.
 */
export const investmentHoldings = sqliteTable("finance_investment_holdings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  type: text("type", {
    enum: [
      "equity",
      "intl_equity",
      "mutual_fund_domestic",
      "mutual_fund_intl",
      "bond",
      "gold",
      "fd",
      "rd",
      "chit_fund",
      "govt_scheme",
      "other_asset",
    ],
  }).notNull(),
  name: text("name").notNull(),
  accountId: integer("account_id").references(() => accounts.id),

  // unit-priced types (equity/mutual funds/gold/bonds) — see investment_valuations
  units: real("units"),

  // FD/RD accrual estimate
  interestRate: real("interest_rate"),
  maturityDate: text("maturity_date"),

  // govt schemes only — reference info, doesn't feed valuation
  schemeTemplateId: integer("scheme_template_id").references(() => schemeTemplates.id),

  /** Identifier a `PriceProvider` uses to look up prices — e.g. the AMFI scheme code for a domestic mutual fund. */
  externalCode: text("external_code"),

  /** PPF/NSC/SSY, ELSS mutual funds, tax-saver FDs, etc. — a generic flag (mirroring `insurance_policies.is_80c_eligible`) rather than per-type flags, since eligibility is scheme-specific and the user knows their own holdings' status better than a type-based guess would. See docs/prd/finance/tax-planning.md. */
  is80cEligible: integer("is_80c_eligible", { mode: "boolean" }).notNull().default(false),

  /** Points at `plans_goals.id` by plain value only — never a DB-level foreign key, since modules never share schema-level references. See docs/prd/finance/goal-linked-investments.md. */
  linkedGoalId: integer("linked_goal_id"),

  notes: text("notes"),

  createdAt: text("created_at")
    .notNull()
    .default(sql`(current_timestamp)`),
});
