import { sqliteTable, text, integer, index, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

/**
 * What the foundation migration could not decide for itself.
 *
 * Migration 0027/0028 had to attach a currency, an owning entity, an
 * institution and a provenance to rows that predate all four. Where the right
 * answer was derivable it was derived; where it was not, the migration records
 * a question here instead of guessing. That is the whole point: a fabricated
 * `currency = 'INR'` on a holding whose prices were entered in dollars is a
 * silent factor-of-85 error, and no later code can detect it.
 *
 * Rows are resolved by the user, never automatically. See
 * docs/prd/finance/provenance-lifecycle.md.
 */
export const RECONCILIATION_KINDS = [
  /** A foreign-denominated holding whose currency was defaulted to INR. */
  "currency_unconfirmed",
  /** No owning entity: attributed to `Self` by default, which may be wrong. */
  "entity_unattributed",
  /** No institution linked — the only signal was free-text name. */
  "institution_unknown",
  /** A valuation whose source/method/confidence are all `unknown`. */
  "valuation_provenance_unknown",
  /** A conversion was needed on a date before the first stored FX rate. */
  "fx_rate_missing",
  /** A holding or schedule pointed at a goal that could not become a financial
   * goal, so the link was cleared rather than left dangling. */
  "goal_link_dropped",
] as const;
export type ReconciliationKind = (typeof RECONCILIATION_KINDS)[number];

export const reconciliationItems = sqliteTable(
  "finance_reconciliation_items",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    kind: text("kind", { enum: RECONCILIATION_KINDS }).notNull(),
    /** The table the question is about, e.g. `finance_investment_holdings`.
     * A plain name, not a foreign key: the queue spans several tables and a
     * polymorphic reference cannot carry an FK — which would forfeit the
     * `foreign_key_check` gate in `applyMigrations`. */
    subjectTable: text("subject_table").notNull(),
    subjectId: integer("subject_id").notNull(),
    /** What the migration assumed, in the user's words, so the question is
     * answerable without reading the migration. */
    detail: text("detail").notNull(),
    resolvedAt: text("resolved_at"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    index("finance_reconciliation_open_idx").on(table.resolvedAt, table.kind),
    /** One open question per (kind, row) — re-running the seed is idempotent. */
    uniqueIndex("finance_reconciliation_subject_idx").on(
      table.kind,
      table.subjectTable,
      table.subjectId,
    ),
  ],
);
