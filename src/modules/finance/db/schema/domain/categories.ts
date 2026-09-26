import { sqliteTable, text, integer, type AnySQLiteColumn } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

/** Fully custom, no seeded list. See docs/prd/finance/accounts-transactions.md. */
export const categories = sqliteTable("finance_categories", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  type: text("type", { enum: ["income", "expense"] }).notNull(),
  parentCategoryId: integer("parent_category_id").references((): AnySQLiteColumn => categories.id),

  createdAt: text("created_at")
    .notNull()
    .default(sql`(current_timestamp)`),
});
