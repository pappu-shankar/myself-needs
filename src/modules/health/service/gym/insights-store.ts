import { DomainError } from "@/modules/core/errors";
import { insertDismissedInsight, listDismissedInsightIds } from "../../db/queries/gym/insights";

/**
 * Which gym insights the user dismissed. Ids are content-derived (same pattern
 * as finance insights), so a dismissed instance stays hidden while a later one
 * with different numbers still shows.
 */

export function listDismissedGymInsightIds(): Set<string> {
  return new Set(listDismissedInsightIds());
}

export function dismissGymInsight(id: string): void {
  const trimmed = id.trim();
  if (!trimmed || trimmed.length > 300) throw new DomainError("Unknown insight.");
  insertDismissedInsight(trimmed);
}
