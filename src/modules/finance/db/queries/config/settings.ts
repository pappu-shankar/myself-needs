import { eq } from "drizzle-orm";
import { getDb } from "@/modules/core/db/client";
import { financeSettings } from "../../schema/config/settings";

const SETTINGS_ID = 1;

export function getSettings() {
  return (
    getDb().select().from(financeSettings).where(eq(financeSettings.id, SETTINGS_ID)).get() ?? null
  );
}

export function upsertSettings(dateOfBirth: string | null) {
  return getDb()
    .insert(financeSettings)
    .values({ id: SETTINGS_ID, dateOfBirth })
    .onConflictDoUpdate({ target: financeSettings.id, set: { dateOfBirth } })
    .returning()
    .get();
}

export function dismissGettingStarted() {
  return getDb()
    .insert(financeSettings)
    .values({ id: SETTINGS_ID, gettingStartedDismissed: true })
    .onConflictDoUpdate({ target: financeSettings.id, set: { gettingStartedDismissed: true } })
    .returning()
    .get();
}
