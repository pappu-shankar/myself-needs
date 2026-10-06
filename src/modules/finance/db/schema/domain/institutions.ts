import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { archivableColumns } from "../lifecycle";

/**
 * Where an account or holding is held. Rows rather than free text repeated per
 * account, so "everything at HDFC" is answerable and institution
 * concentration risk is computable at all.
 *
 * `finance_insurance_policies.provider` is free-text today and is what seeds
 * this table. See docs/prd/finance/institutions.md.
 */
export const institutions = sqliteTable("finance_institutions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  kind: text("kind", {
    enum: ["bank", "broker", "amc", "insurer", "custodian", "other"],
  }).notNull(),
  country: text("country"),
  notes: text("notes"),
  ...archivableColumns(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(current_timestamp)`),
});
