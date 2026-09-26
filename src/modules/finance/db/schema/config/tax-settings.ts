import { sqliteTable, integer, real, text } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

/**
 * Single-row, fully editable reference rates — tax rules change with every
 * budget, so nothing here is hardcoded into the calculation logic. Seeded
 * with FY2024-25-ish defaults that are reasonable ballpark estimates, not
 * guaranteed current; the whole feature is explicitly "estimates only, not
 * a filing tool." See docs/prd/finance/tax-planning.md.
 */
export const taxSettings = sqliteTable("finance_tax_settings", {
  id: integer("id").primaryKey(),

  eightyCLimit: real("eighty_c_limit").notNull().default(150000),
  eightyDLimit: real("eighty_d_limit").notNull().default(25000),

  equityLtcgThresholdMonths: integer("equity_ltcg_threshold_months").notNull().default(12),
  equityLtcgExemption: real("equity_ltcg_exemption").notNull().default(125000),
  equityLtcgRate: real("equity_ltcg_rate").notNull().default(12.5),
  equityStcgRate: real("equity_stcg_rate").notNull().default(20),

  /** International equity, international mutual funds, bonds, gold — not eligible for the special equity rates in Indian tax law. */
  otherLtcgThresholdMonths: integer("other_ltcg_threshold_months").notNull().default(24),
  otherLtcgRate: real("other_ltcg_rate").notNull().default(20),
  otherStcgRate: real("other_stcg_rate").notNull().default(30),

  standardDeductionOld: real("standard_deduction_old").notNull().default(50000),
  standardDeductionNew: real("standard_deduction_new").notNull().default(75000),
  cessPercent: real("cess_percent").notNull().default(4),

  /** Section 87A: taxable income at/below this is fully rebated (flat cutoff — marginal relief above the threshold isn't modeled). */
  rebate87aThresholdOld: real("rebate_87a_threshold_old").notNull().default(500000),
  rebate87aThresholdNew: real("rebate_87a_threshold_new").notNull().default(700000),

  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(current_timestamp)`),
});
