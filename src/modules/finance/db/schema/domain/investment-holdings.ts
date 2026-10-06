import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { accounts } from "./accounts";
import { schemeTemplates } from "./scheme-templates";
import { entities } from "./entities";
import { institutions } from "./institutions";
import { goals } from "./goals";
import { currencyColumn } from "../currency";
import { archivableColumns } from "../lifecycle";

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
  entityId: integer("entity_id").references(() => entities.id),
  institutionId: integer("institution_id").references(() => institutions.id),
  /** The currency the holding is denominated and priced in. Existing rows
   * default to INR; `intl_equity`/`mutual_fund_intl` rows need user
   * confirmation, because their prices may have been entered in USD. */
  currency: currencyColumn(),
  /** Without this an illiquid private holding is indistinguishable from a
   * listed one in every liquidity-aware figure. Backfilled from `type`. */
  liquidity: text("liquidity", { enum: ["liquid", "semi_liquid", "illiquid"] })
    .notNull()
    .default("liquid"),
  /** Allocation dimensions. User-editable: no reference feed supplies them. */
  sector: text("sector"),
  country: text("country"),
  marketCapBand: text("market_cap_band", { enum: ["large", "mid", "small", "micro"] }),

  /** Unit-priced types (equity/mutual funds/gold/bonds) — see
   * investment_valuations. Scaled by `UNITS_SCALE` (1e6) so holding value is
   * an exact integer product rather than integer units times a float price,
   * which is what made cash exact while every investment value drifted. */
  unitsScaled: integer("units_scaled"),

  /** FD/RD accrual estimate, in integer basis points — a rate that
   * multiplies money is never a float here. */
  rateBps: integer("rate_bps"),
  maturityDate: text("maturity_date"),

  // govt schemes only — reference info, doesn't feed valuation
  schemeTemplateId: integer("scheme_template_id").references(() => schemeTemplates.id),

  /** Identifier a `PriceProvider` uses to look up prices — e.g. the AMFI scheme code for a domestic mutual fund. */
  externalCode: text("external_code"),

  /** PPF/NSC/SSY, ELSS mutual funds, tax-saver FDs, etc. — a generic flag (mirroring `insurance_policies.is_80c_eligible`) rather than per-type flags, since eligibility is scheme-specific and the user knows their own holdings' status better than a type-based guess would. See docs/prd/finance/tax-planning.md. */
  is80cEligible: integer("is_80c_eligible", { mode: "boolean" }).notNull().default(false),

  /**
   * The financial goal this holding funds. A real foreign key now: it was a
   * plain ID only because goals lived in another module, and `finance_goals` is
   * in this one — so `foreign_key_check`, the safety net every migration runs
   * through, can enforce it. See docs/prd/finance/goals.md.
   */
  linkedGoalId: integer("linked_goal_id").references(() => goals.id),

  notes: text("notes"),
  ...archivableColumns(),

  createdAt: text("created_at")
    .notNull()
    .default(sql`(current_timestamp)`),
});
