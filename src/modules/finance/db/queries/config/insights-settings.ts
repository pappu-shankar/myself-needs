import { eq } from "drizzle-orm";
import { getDb } from "@/modules/core/db/client";
import { insightsSettings } from "../../schema/config/insights-settings";

const INSIGHTS_SETTINGS_ID = 1;

export function getInsightsSettings() {
  const existing = getDb()
    .select()
    .from(insightsSettings)
    .where(eq(insightsSettings.id, INSIGHTS_SETTINGS_ID))
    .get();
  if (existing) return existing;
  return getDb().insert(insightsSettings).values({ id: INSIGHTS_SETTINGS_ID }).returning().get();
}

export function updateInsightsSettings(patch: Partial<typeof insightsSettings.$inferInsert>) {
  getInsightsSettings(); // ensure the row exists before updating it
  return getDb()
    .update(insightsSettings)
    .set(patch)
    .where(eq(insightsSettings.id, INSIGHTS_SETTINGS_ID))
    .returning()
    .get();
}
