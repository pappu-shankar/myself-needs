import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { recurringRules } from "./recurring-rules";
import { entities } from "./entities";
import { institutions } from "./institutions";
import { currencyColumn, minorAmount } from "../currency";
import { provenanceColumns } from "../provenance";
import { archivableColumns } from "../lifecycle";

/**
 * Optionally linked to a `recurring_rules` entry for its premium, so premium
 * due dates surface in the same "Due — not yet logged" worklist as rent
 * rather than a second parallel reminder system. `is_80c_eligible` /
 * `is_80d_eligible` feed tax-planning.md; a passed `renewal_date` with no
 * logged premium is a compliance-watch insight (insights.md). See
 * docs/prd/finance/insurance.md.
 */
export const insurancePolicies = sqliteTable("finance_insurance_policies", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  type: text("type", { enum: ["life", "health", "term", "vehicle", "other"] }).notNull(),
  /** Free text, and the seed for `finance_institutions` — a distinct provider
   * name is an insurer. Retained so existing rows keep reading correctly. */
  provider: text("provider").notNull(),
  institutionId: integer("institution_id").references(() => institutions.id),
  entityId: integer("entity_id").references(() => entities.id),
  currency: currencyColumn(),
  name: text("name").notNull(),
  policyNumber: text("policy_number"),
  sumAssuredMinor: minorAmount("sum_assured_minor"),
  premiumAmountMinor: minorAmount("premium_amount_minor").notNull(),
  premiumFrequency: text("premium_frequency", {
    enum: ["weekly", "monthly", "quarterly", "half_yearly", "yearly"],
  }).notNull(),
  startDate: text("start_date").notNull(),
  renewalDate: text("renewal_date"),
  notes: text("notes"),
  is80cEligible: integer("is_80c_eligible", { mode: "boolean" }).notNull().default(false),
  is80dEligible: integer("is_80d_eligible", { mode: "boolean" }).notNull().default(false),
  recurringRuleId: integer("recurring_rule_id").references(() => recurringRules.id),

  ...provenanceColumns({ source: "user", method: "manual", confidence: "reported" }),
  ...archivableColumns(),

  createdAt: text("created_at")
    .notNull()
    .default(sql`(current_timestamp)`),
});
