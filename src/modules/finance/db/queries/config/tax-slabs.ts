import { and, asc, count, eq, sql } from "drizzle-orm";
import { getDb } from "@/modules/core/db/client";
import { taxSlabs } from "../../schema/config/tax-slabs";
import { SEED_TAX_FISCAL_YEAR } from "./tax-settings";
import { toMinor } from "@/lib/format";
import { toRateBps } from "../../../service/utility/units";

type NewTaxSlab = typeof taxSlabs.$inferInsert;
export type TaxRegime = "old" | "new";

/**
 * FY2024-25-ish ballpark defaults (individuals below 60, old regime; section
 * 115BAC new regime) — editable, not authoritative. Only ever used to seed a
 * brand-new vault.
 *
 * Written as statutory rupees and percentages, which is how the Finance Act
 * states them and how anyone checking this list against the Act will read it,
 * then converted once here. Storage is INR paise and basis points.
 */
const SEED_SLABS: NewTaxSlab[] = (
  [
    { regime: "old", uptoRupees: 250000, ratePercent: 0 },
    { regime: "old", uptoRupees: 500000, ratePercent: 5 },
    { regime: "old", uptoRupees: 1000000, ratePercent: 20 },
    { regime: "old", uptoRupees: null, ratePercent: 30 },
    { regime: "new", uptoRupees: 300000, ratePercent: 0 },
    { regime: "new", uptoRupees: 700000, ratePercent: 5 },
    { regime: "new", uptoRupees: 1000000, ratePercent: 10 },
    { regime: "new", uptoRupees: 1200000, ratePercent: 15 },
    { regime: "new", uptoRupees: 1500000, ratePercent: 20 },
    { regime: "new", uptoRupees: null, ratePercent: 30 },
  ] satisfies { regime: TaxRegime; uptoRupees: number | null; ratePercent: number }[]
).map((slab) => ({
  regime: slab.regime,
  uptoAmountMinor: slab.uptoRupees === null ? null : toMinor(slab.uptoRupees, "INR"),
  rateBps: toRateBps(slab.ratePercent),
  fiscalYear: SEED_TAX_FISCAL_YEAR,
}));

function seedIfEmpty() {
  const existing = getDb().select({ value: count() }).from(taxSlabs).get()?.value ?? 0;
  if (existing === 0) {
    getDb().insert(taxSlabs).values(SEED_SLABS).run();
  }
}

/** Every FY that has at least one slab row for `regime`, ascending. */
export function listTaxSlabFiscalYears(regime: TaxRegime): string[] {
  seedIfEmpty();
  return getDb()
    .selectDistinct({ fiscalYear: taxSlabs.fiscalYear })
    .from(taxSlabs)
    .where(eq(taxSlabs.regime, regime))
    .orderBy(asc(taxSlabs.fiscalYear))
    .all()
    .map((r) => r.fiscalYear);
}

/** One FY's brackets for a regime: ascending by upto_amount_minor, with the uncapped top bracket (null) always last — SQLite's default NULL ordering is NULLS FIRST, which would otherwise put it first. */
export function listTaxSlabs(fiscalYear: string, regime: TaxRegime) {
  seedIfEmpty();
  return getDb()
    .select()
    .from(taxSlabs)
    .where(and(eq(taxSlabs.fiscalYear, fiscalYear), eq(taxSlabs.regime, regime)))
    .orderBy(
      sql`CASE WHEN ${taxSlabs.uptoAmountMinor} IS NULL THEN 1 ELSE 0 END`,
      taxSlabs.uptoAmountMinor,
    )
    .all();
}

export function findTaxSlab(id: number) {
  return getDb().select().from(taxSlabs).where(eq(taxSlabs.id, id)).get();
}

export function insertTaxSlab(entry: NewTaxSlab) {
  return getDb().insert(taxSlabs).values(entry).returning().get();
}

export function updateTaxSlab(
  id: number,
  patch: { uptoAmountMinor: number | null; rateBps: number },
) {
  return getDb().update(taxSlabs).set(patch).where(eq(taxSlabs.id, id)).returning().get();
}

export function deleteTaxSlab(id: number) {
  getDb().delete(taxSlabs).where(eq(taxSlabs.id, id)).run();
}
