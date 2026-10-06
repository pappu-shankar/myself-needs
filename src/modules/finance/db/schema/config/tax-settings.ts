import { sqliteTable, integer, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { minorAmount } from "../currency";

/**
 * Single-row, fully editable reference rates — tax rules change with every
 * budget, so nothing here is hardcoded into the calculation logic. Seeded
 * with FY2024-25-ish defaults that are reasonable ballpark estimates, not
 * guaranteed current; the whole feature is explicitly "estimates only, not
 * a filing tool." See docs/prd/finance/tax-planning.md.
 *
 * Every amount here is **statutory INR paise**, not the user's base currency:
 * these are figures set by the Indian Finance Act, so they do not move when
 * someone switches their display currency. Rates are integer basis points —
 * a rate that multiplies money is never a float in this module.
 */
export const taxSettings = sqliteTable(
  "finance_tax_settings",
  {
    id: integer("id").primaryKey(),
    /** One row per Indian financial year, e.g. "2025-26". */
    fiscalYear: text("fiscal_year").notNull().default("2024-25"),

    eightyCLimitMinor: minorAmount("eighty_c_limit_minor").notNull().default(15_000_000),
    eightyDLimitMinor: minorAmount("eighty_d_limit_minor").notNull().default(2_500_000),

    equityLtcgThresholdMonths: integer("equity_ltcg_threshold_months").notNull().default(12),
    equityLtcgExemptionMinor: minorAmount("equity_ltcg_exemption_minor")
      .notNull()
      .default(12_500_000),
    equityLtcgRateBps: integer("equity_ltcg_rate_bps").notNull().default(1250),
    equityStcgRateBps: integer("equity_stcg_rate_bps").notNull().default(2000),

    /** International equity, international mutual funds, bonds, gold — not eligible for the special equity rates in Indian tax law. */
    otherLtcgThresholdMonths: integer("other_ltcg_threshold_months").notNull().default(24),
    otherLtcgRateBps: integer("other_ltcg_rate_bps").notNull().default(2000),
    otherStcgRateBps: integer("other_stcg_rate_bps").notNull().default(3000),

    standardDeductionOldMinor: minorAmount("standard_deduction_old_minor")
      .notNull()
      .default(5_000_000),
    standardDeductionNewMinor: minorAmount("standard_deduction_new_minor")
      .notNull()
      .default(7_500_000),
    cessBps: integer("cess_bps").notNull().default(400),

    /** Section 87A: taxable income at/below this is fully rebated (flat cutoff — marginal relief above the threshold isn't modeled). */
    rebate87aThresholdOldMinor: minorAmount("rebate_87a_threshold_old_minor")
      .notNull()
      .default(50_000_000),
    rebate87aThresholdNewMinor: minorAmount("rebate_87a_threshold_new_minor")
      .notNull()
      .default(70_000_000),

    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [uniqueIndex("finance_tax_settings_fy_idx").on(table.fiscalYear)],
);
