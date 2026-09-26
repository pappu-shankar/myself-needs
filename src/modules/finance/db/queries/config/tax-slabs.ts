import { count, eq, sql } from "drizzle-orm";
import { getDb } from "@/modules/core/db/client";
import { taxSlabs } from "../../schema/config/tax-slabs";

type NewTaxSlab = typeof taxSlabs.$inferInsert;

/** FY2024-25-ish ballpark defaults (individuals below 60, old regime; section 115BAC new regime) — editable, not authoritative. */
const SEED_SLABS: NewTaxSlab[] = [
  { regime: "old", uptoAmount: 250000, ratePercent: 0 },
  { regime: "old", uptoAmount: 500000, ratePercent: 5 },
  { regime: "old", uptoAmount: 1000000, ratePercent: 20 },
  { regime: "old", uptoAmount: null, ratePercent: 30 },
  { regime: "new", uptoAmount: 300000, ratePercent: 0 },
  { regime: "new", uptoAmount: 700000, ratePercent: 5 },
  { regime: "new", uptoAmount: 1000000, ratePercent: 10 },
  { regime: "new", uptoAmount: 1200000, ratePercent: 15 },
  { regime: "new", uptoAmount: 1500000, ratePercent: 20 },
  { regime: "new", uptoAmount: null, ratePercent: 30 },
];

function seedIfEmpty() {
  const existing = getDb().select({ value: count() }).from(taxSlabs).get()?.value ?? 0;
  if (existing === 0) {
    getDb().insert(taxSlabs).values(SEED_SLABS).run();
  }
}

/** Ascending by upto_amount, with the uncapped top bracket (null) always last — SQLite's default NULL ordering is NULLS FIRST, which would otherwise put it first. */
export function listTaxSlabs(regime: "old" | "new") {
  seedIfEmpty();
  return getDb()
    .select()
    .from(taxSlabs)
    .where(eq(taxSlabs.regime, regime))
    .orderBy(sql`CASE WHEN ${taxSlabs.uptoAmount} IS NULL THEN 1 ELSE 0 END`, taxSlabs.uptoAmount)
    .all();
}

export function insertTaxSlab(entry: NewTaxSlab) {
  return getDb().insert(taxSlabs).values(entry).returning().get();
}

export function updateTaxSlabRate(id: number, ratePercent: number) {
  return getDb().update(taxSlabs).set({ ratePercent }).where(eq(taxSlabs.id, id)).returning().get();
}
