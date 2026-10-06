import { getDb } from "@/modules/core/db/client";
import { gymDismissedInsights } from "../../schema/gym/insights";

export function listDismissedInsightIds(): string[] {
  return getDb()
    .select({ id: gymDismissedInsights.id })
    .from(gymDismissedInsights)
    .all()
    .map((row) => row.id);
}

/** Dismissing twice is a no-op. */
export function insertDismissedInsight(id: string): void {
  getDb().insert(gymDismissedInsights).values({ id }).onConflictDoNothing().run();
}
