import { getFinanceSnapshot } from "./snapshot";
import { AUDITOR_RULES } from "./auditor";
import { ADVOCATE_RULES } from "./advocate";
import { COMPLIANCE_RULES } from "./compliance";
import type { Insight, InsightRule } from "./types";
import { dismissInsight, listDismissedInsightIds } from "../../../db/queries/domain/insights";

const RULES: InsightRule[] = [...AUDITOR_RULES, ...ADVOCATE_RULES, ...COMPLIANCE_RULES];

const SEVERITY_ORDER: Record<Insight["severity"], number> = { critical: 0, warning: 1, info: 2 };

/** Runs every registered rule against one snapshot, drops dismissed instances, sorts most-severe first. */
export function getInsights(): Insight[] {
  const snapshot = getFinanceSnapshot();
  const dismissed = listDismissedInsightIds();

  return RULES.flatMap((rule) => rule(snapshot))
    .filter((insight) => !dismissed.has(insight.id))
    .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}

export function dismissInsightById(id: string) {
  return dismissInsight(id);
}
