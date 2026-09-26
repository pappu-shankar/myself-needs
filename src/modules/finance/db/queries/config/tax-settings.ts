import { eq } from "drizzle-orm";
import { getDb } from "@/modules/core/db/client";
import { taxSettings } from "../../schema/config/tax-settings";

const SETTINGS_ID = 1;

/** Seeded from the schema's column defaults on first read — see the schema file's docstring for why. */
export function getTaxSettings() {
  const existing = getDb().select().from(taxSettings).where(eq(taxSettings.id, SETTINGS_ID)).get();
  if (existing) return existing;
  return getDb().insert(taxSettings).values({ id: SETTINGS_ID }).returning().get();
}

export function updateTaxSettings(patch: Partial<typeof taxSettings.$inferInsert>) {
  getTaxSettings(); // ensure the row exists before updating it
  return getDb()
    .update(taxSettings)
    .set(patch)
    .where(eq(taxSettings.id, SETTINGS_ID))
    .returning()
    .get();
}
