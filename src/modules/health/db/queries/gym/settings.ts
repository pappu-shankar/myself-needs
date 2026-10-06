import { eq, sql } from "drizzle-orm";
import { getDb } from "@/modules/core/db/client";
import { gymSettings } from "../../schema/gym/settings";

const SETTINGS_ID = 1;

export type GymSettingsRow = typeof gymSettings.$inferSelect;
export type GymSettingsPatch = Partial<Omit<typeof gymSettings.$inferInsert, "id" | "updatedAt">>;

export function getGymSettingsRow() {
  return getDb().select().from(gymSettings).where(eq(gymSettings.id, SETTINGS_ID)).get() ?? null;
}

/** Single-row upsert: the first save creates the row (column defaults fill the rest). */
export function upsertGymSettings(patch: GymSettingsPatch) {
  return getDb()
    .insert(gymSettings)
    .values({ ...patch, id: SETTINGS_ID })
    .onConflictDoUpdate({
      target: gymSettings.id,
      set: { ...patch, updatedAt: sql`(current_timestamp)` },
    })
    .returning()
    .get();
}
