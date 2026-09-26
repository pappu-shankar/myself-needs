export type InsightCategory = "audit" | "advocate" | "compliance";
export type InsightSeverity = "info" | "warning" | "critical";

export interface Insight {
  /**
   * Content-derived, e.g. `${rule}:${entityId}:${keyFact}` — stable across
   * runs as long as the underlying fact hasn't changed, so dismissing this
   * exact instance doesn't hide a later instance with different numbers.
   * See docs/prd/finance/insights.md.
   */
  id: string;
  category: InsightCategory;
  severity: InsightSeverity;
  message: string;
  link: string;
}

/**
 * One small pure function per rule, `(snapshot) => Insight[]` (empty when
 * the rule doesn't fire). Registered in `engine.ts` — adding a rule is
 * adding one function and one registration line, no schema/page changes.
 */
export type InsightRule = (snapshot: import("./snapshot").FinanceSnapshot) => Insight[];
