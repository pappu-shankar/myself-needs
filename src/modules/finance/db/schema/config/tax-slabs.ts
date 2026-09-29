import { sqliteTable, integer, real, text, index } from "drizzle-orm/sqlite-core";

/**
 * Progressive slab brackets per regime, ordered by `upto_amount` ascending —
 * the last bracket for a regime has a null `upto_amount` (no upper bound).
 * Editable, seeded on first read (see db/queries/tax-slabs.ts) rather than
 * a data migration, same pattern as scheme_templates. See
 * docs/prd/finance/tax-planning.md.
 */
export const taxSlabs = sqliteTable(
  "finance_tax_slabs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    /** Indian financial year the brackets apply to, e.g. "2025-26" (April–March). */
    fiscalYear: text("fiscal_year").notNull().default("2024-25"),
    regime: text("regime", { enum: ["old", "new"] }).notNull(),
    uptoAmount: real("upto_amount"),
    ratePercent: real("rate_percent").notNull(),
  },
  (table) => [index("finance_tax_slabs_fy_regime_idx").on(table.fiscalYear, table.regime)],
);
