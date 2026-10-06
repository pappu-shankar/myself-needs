import { and, eq, lte } from "drizzle-orm";
import { getDb } from "@/modules/core/db/client";
import { fxRates } from "../../schema/config/fx-rates";
import type { Currency } from "../../schema/currency";
import type { FxRate } from "../../../service/utility/fx";

export type NewFxRate = typeof fxRates.$inferInsert;

/**
 * Every rate usable for a conversion as of a date — that is, dated on or
 * before it.
 *
 * Deliberately returns the whole usable set rather than resolving a single
 * pair in SQL: `resolveRate` may need to invert a series or triangulate
 * through the pivot, and "latest row on or before this date" per candidate pair
 * is a correlated subquery per row in SQL but a single pass in TypeScript.
 * See decision 8.
 */
export function listFxRatesAsOf(asOf: string): FxRate[] {
  return getDb()
    .select({
      base: fxRates.base,
      quote: fxRates.quote,
      date: fxRates.date,
      rateScaled: fxRates.rateScaled,
      source: fxRates.source,
    })
    .from(fxRates)
    .where(lte(fxRates.date, asOf))
    .all();
}

/** The newest stored rate date for a pair, or null when the series is empty. */
export function latestRateDate(base: Currency, quote: Currency): string | null {
  const row = getDb()
    .select({ date: fxRates.date })
    .from(fxRates)
    .where(and(eq(fxRates.base, base), eq(fxRates.quote, quote)))
    .orderBy(fxRates.date)
    .all()
    .at(-1);
  return row?.date ?? null;
}

/**
 * Record rates idempotently: one row per pair per date, so re-fetching a day
 * the vault already has replaces it rather than duplicating it. A corrected
 * rate from the source is meant to win — which is also why no converted total
 * is ever stored (decision 16).
 */
export function upsertFxRates(entries: NewFxRate[]) {
  if (entries.length === 0) return;
  for (const entry of entries) {
    getDb()
      .insert(fxRates)
      .values(entry)
      .onConflictDoUpdate({
        target: [fxRates.base, fxRates.quote, fxRates.date],
        set: { rateScaled: entry.rateScaled, source: entry.source },
      })
      .run();
  }
}
