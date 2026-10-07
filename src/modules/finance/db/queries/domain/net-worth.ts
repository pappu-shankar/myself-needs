import { asc } from "drizzle-orm";
import { getDb } from "@/modules/core/db/client";
import { investmentCashFlows } from "../../schema/domain/investment-cash-flows";
import { investmentValuations } from "../../schema/domain/investment-valuations";
import { live } from "../lifecycle";
import type { Currency } from "../../schema/currency";
import type { ConfidenceLevel } from "../../schema/provenance";

/**
 * The whole ledger in two queries, for the net-worth trend.
 *
 * `getNetWorthTrend(12)` was a month loop around a holding loop, and each
 * holding cost a cash-flow query plus a valuation query — about 757 queries and
 * 24 full table scans at 30 holdings. These two preloads replace the fan-out:
 * every month in the trend filters the same in-memory history by its own as-of
 * date.
 *
 * Deliberately **not** a cache and **not** a snapshot (decision 16). Nothing
 * here is stored or reused across requests; it is one read per request, and the
 * figures are still computed from the ledger every time. Batching removes the
 * fan-out without giving up the invariant that a back-filled historical rate
 * shows up in the trend immediately.
 */

export interface PreloadedFlow {
  holdingId: number;
  date: string;
  amountMinor: number;
  currency: Currency;
  unitsScaled: number | null;
  flowType: "contribution" | "redemption" | "dividend" | "interest" | "maturity";
  confidence: ConfidenceLevel;
}

/** Every live cash flow, grouped by holding and ordered oldest-first. Voided
 * flows are excluded, as everywhere else. */
export function allCashFlowsByHolding(): Map<number, PreloadedFlow[]> {
  const rows = getDb()
    .select({
      holdingId: investmentCashFlows.holdingId,
      date: investmentCashFlows.date,
      amountMinor: investmentCashFlows.amountMinor,
      currency: investmentCashFlows.currency,
      unitsScaled: investmentCashFlows.unitsScaled,
      flowType: investmentCashFlows.flowType,
      confidence: investmentCashFlows.confidence,
    })
    .from(investmentCashFlows)
    .where(live(investmentCashFlows.voidedAt))
    .orderBy(asc(investmentCashFlows.date), asc(investmentCashFlows.id))
    .all();

  return groupBy(rows, (r) => r.holdingId);
}

export interface PreloadedValuationRow {
  holdingId: number;
  date: string;
  priceScaled: number;
  priceCurrency: Currency;
  confidence: ConfidenceLevel;
}

/**
 * Every valuation, grouped by holding and ordered oldest-first.
 *
 * Ascending order is load-bearing: the consumer takes the last entry dated on
 * or before its as-of date, which is only the newest qualifying one if the list
 * is ascending.
 */
export function allValuationsByHolding(): Map<number, PreloadedValuationRow[]> {
  const rows = getDb()
    .select({
      holdingId: investmentValuations.holdingId,
      date: investmentValuations.date,
      priceScaled: investmentValuations.priceScaled,
      priceCurrency: investmentValuations.priceCurrency,
      confidence: investmentValuations.confidence,
    })
    .from(investmentValuations)
    .orderBy(asc(investmentValuations.date), asc(investmentValuations.id))
    .all();

  return groupBy(rows, (r) => r.holdingId);
}

function groupBy<T>(rows: readonly T[], key: (row: T) => number): Map<number, T[]> {
  const grouped = new Map<number, T[]>();
  for (const row of rows) {
    const bucket = grouped.get(key(row));
    if (bucket) bucket.push(row);
    else grouped.set(key(row), [row]);
  }
  return grouped;
}
