import { sqliteTable, text, integer, type AnySQLiteColumn } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { archivableColumns } from "../lifecycle";

/** Fully custom, no seeded list. See docs/prd/finance/accounts-transactions.md. */
export const categories = sqliteTable("finance_categories", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  type: text("type", { enum: ["income", "expense"] }).notNull(),
  parentCategoryId: integer("parent_category_id").references((): AnySQLiteColumn => categories.id),

  /**
   * Marks a category as tax paid, so attribution can separate it from
   * lifestyle spending.
   *
   * A flag rather than a name match: "Income tax", "TDS", "Advance tax" and
   * "Self-assessment" are all tax and none of them share a substring, and a
   * name-matching rule would silently reclassify a category the day someone
   * renamed it. See docs/prd/finance/wealth-history.md § Attribution.
   */
  isTax: integer("is_tax", { mode: "boolean" }).notNull().default(false),

  /**
   * Migration 0027 gave every other descriptive table an `archived_at` and
   * missed this one, so a category that history referenced had no retire path
   * at all: it could be renamed but never hidden from the pickers. The
   * lifecycle policy says edit-in-place plus archive for categories, and the
   * schema now agrees with it.
   */
  ...archivableColumns(),

  createdAt: text("created_at")
    .notNull()
    .default(sql`(current_timestamp)`),
});
