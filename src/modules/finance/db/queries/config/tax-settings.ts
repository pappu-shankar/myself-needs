import { asc, count, eq } from "drizzle-orm";
import { getDb } from "@/modules/core/db/client";
import { taxSettings } from "../../schema/config/tax-settings";

type TaxSettingsRow = typeof taxSettings.$inferSelect;
type NewTaxSettings = typeof taxSettings.$inferInsert;

/** The FY a brand-new vault is seeded with, from the schema's column defaults — see the schema file's docstring. */
export const SEED_TAX_FISCAL_YEAR = "2024-25";

function seedIfEmpty() {
  const existing = getDb().select({ value: count() }).from(taxSettings).get()?.value ?? 0;
  if (existing === 0) {
    getDb().insert(taxSettings).values({ fiscalYear: SEED_TAX_FISCAL_YEAR }).run();
  }
}

/** Every FY that has its own settings row, ascending ("2024-25" < "2025-26" sorts correctly as text). */
export function listTaxSettingsFiscalYears(): string[] {
  seedIfEmpty();
  return getDb()
    .select({ fiscalYear: taxSettings.fiscalYear })
    .from(taxSettings)
    .orderBy(asc(taxSettings.fiscalYear))
    .all()
    .map((r) => r.fiscalYear);
}

/** The settings row stored for exactly this FY, if any. */
export function findTaxSettings(fiscalYear: string): TaxSettingsRow | undefined {
  seedIfEmpty();
  return getDb().select().from(taxSettings).where(eq(taxSettings.fiscalYear, fiscalYear)).get();
}

export function insertTaxSettings(entry: Omit<NewTaxSettings, "id" | "updatedAt">): TaxSettingsRow {
  return getDb().insert(taxSettings).values(entry).returning().get();
}

export function updateTaxSettings(
  fiscalYear: string,
  patch: Partial<Omit<NewTaxSettings, "id" | "fiscalYear" | "updatedAt">>,
): TaxSettingsRow | undefined {
  return getDb()
    .update(taxSettings)
    .set(patch)
    .where(eq(taxSettings.fiscalYear, fiscalYear))
    .returning()
    .get();
}
