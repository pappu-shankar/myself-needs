import { eq } from "drizzle-orm";
import { getDb } from "@/modules/core/db/client";
import { financeSettings } from "../../schema/config/settings";
import type { Currency } from "../../schema/currency";

const SETTINGS_ID = 1;

/** What a vault reports in before anyone has chosen otherwise. Matches the
 * column default, so a vault with no settings row behaves like one with the
 * default row rather than throwing. */
export const DEFAULT_BASE_CURRENCY: Currency = "INR";

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

/**
 * The currency figures are *reported* in. Read-time only (decision 9): it is
 * never written into a value row, so switching it re-converts at read time and
 * moves no history.
 */
export function getBaseCurrency(): Currency {
  return getSettings()?.baseCurrency ?? DEFAULT_BASE_CURRENCY;
}

export function setBaseCurrency(baseCurrency: Currency) {
  return getDb()
    .insert(financeSettings)
    .values({ id: SETTINGS_ID, baseCurrency })
    .onConflictDoUpdate({ target: financeSettings.id, set: { baseCurrency } })
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
