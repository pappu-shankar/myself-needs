import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { archivableColumns } from "../lifecycle";

/**
 * Whose money it is. Every account, holding and policy belongs to an entity:
 * the user, a family member, a business, a trust, an SPV. This is what makes
 * "my net worth" and "the wealth I'm responsible for" different numbers.
 *
 * Entities are the user's *record* of family and business wealth — not logins.
 * Nothing syncs between a spouse's entity here and that spouse's own account,
 * because a cross-user rollup would mean one user reading another's data. See
 * docs/prd/finance/entities-ownership.md.
 */
export const entities = sqliteTable("finance_entities", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  kind: text("kind", {
    enum: ["personal", "joint", "family_member", "business", "trust", "other"],
  }).notNull(),
  name: text("name").notNull(),
  /** Optional override; otherwise the user's base currency applies. */
  baseCurrency: text("base_currency"),
  notes: text("notes"),
  ...archivableColumns(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(current_timestamp)`),
});
