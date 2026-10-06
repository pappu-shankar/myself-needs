import { text, integer } from "drizzle-orm/sqlite-core";

/**
 * Correction semantics. Ledger-affecting rows are immutable: a mistake is
 * voided and replaced, never edited, so a reported balance or return can never
 * change silently under a user who only meant to fix a typo. Descriptive rows
 * are edited in place and archived instead.
 *
 * See docs/prd/finance/provenance-lifecycle.md for the policy per record class.
 */

/** For the two ledger tables (transactions, investment cash flows) only. */
export function voidableColumns() {
  return {
    voidedAt: text("voided_at"),
    voidReason: text("void_reason"),
    /** The row that replaces this one. Set on the voided row, so history reads
     * forward from the mistake to the correction. */
    supersededById: integer("superseded_by_id"),
    updatedAt: text("updated_at"),
  };
}

/** For descriptive rows that history references and so must never be deleted. */
export function archivableColumns() {
  return {
    archivedAt: text("archived_at"),
  };
}
