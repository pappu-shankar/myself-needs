import { text, integer } from "drizzle-orm/sqlite-core";

/**
 * Where a value came from and how much it can be trusted. Spread into every
 * value-bearing table — see docs/prd/finance/provenance-lifecycle.md.
 *
 * Defaults are per-table on purpose: a row the user typed into a form is
 * `user`/`manual`/`reported`, but a pre-existing valuation genuinely cannot be
 * told apart from a refreshed NAV, so those default to `unknown` rather than
 * letting the migration invent provenance it does not have.
 */
export const PROVENANCE_SOURCES = [
  "user",
  "import",
  "connector",
  "market",
  "computed",
  "unknown",
] as const;
export const PROVENANCE_METHODS = [
  "manual",
  "statement_import",
  "document_extract",
  "api_quote",
  "accrual",
  /** Computed from other records — a scheme balance rolled forward, a
   * net-invested fallback. Distinct from `accrual`, which is interest
   * compounding at a known rate. Always pairs with confidence `estimated`. */
  "derived",
  "user_estimate",
  "unknown",
] as const;
export const CONFIDENCE_LEVELS = ["verified", "reported", "estimated", "unknown"] as const;

export type ProvenanceSource = (typeof PROVENANCE_SOURCES)[number];
export type ProvenanceMethod = (typeof PROVENANCE_METHODS)[number];
export type ConfidenceLevel = (typeof CONFIDENCE_LEVELS)[number];

export function provenanceColumns(defaults: {
  source: ProvenanceSource;
  method: ProvenanceMethod;
  confidence: ConfidenceLevel;
}) {
  return {
    source: text("source", { enum: PROVENANCE_SOURCES }).notNull().default(defaults.source),
    method: text("method", { enum: PROVENANCE_METHODS }).notNull().default(defaults.method),
    confidence: text("confidence", { enum: CONFIDENCE_LEVELS })
      .notNull()
      .default(defaults.confidence),
    /** When the value was true — never when the row was written. Backfilled
     * from the row's own date column, never from "now", which would stamp
     * years of history as freshly observed. */
    asOf: text("as_of"),
    /** Traceability back to the ingestion run that produced this row. */
    importBatchId: integer("import_batch_id"),
    /** The source document's own identifier for this record, so a re-run of an
     * overlapping statement recognises it instead of double-posting. */
    externalRef: text("external_ref"),
  };
}
