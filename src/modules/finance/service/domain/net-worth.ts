import { listAccounts, getAccountsTotalByCurrency } from "../../db/queries/domain/accounts";
import { getBaseCurrency } from "../../db/queries/config/settings";
import { listFxRatesAsOf } from "../../db/queries/config/fx-rates";
import { addDays, addMonths, monthKey, startOfMonth, todayIso } from "@/lib/dates";
import { getHoldingsTotalByCurrency } from "./investments";
import { aggregateToBase, mergeByCurrency, type MoneyAggregate } from "../utility/aggregate";
import type { Currency } from "../../db/schema/currency";
import type { ConfidenceLevel } from "../../db/schema/provenance";
import { weakestConfidence } from "../utility/aggregate";

export interface NetWorthPoint {
  /** YYYY-MM */
  month: string;
  /**
   * The figure plus the basis it was computed on — the rate used per
   * contributing currency, its date and its source.
   *
   * Decision 16: this is never snapshotted, and multi-currency is the reason
   * the rule got stronger rather than weaker. A stored net-worth number freezes
   * the rate it was converted at, and historical rates get back-filled and
   * corrected routinely — so the stored figure silently stops matching the rate
   * it cites, and the number and its own stated basis drift apart. Recomputing
   * is what keeps the trend and the rates it quotes the same thing.
   */
  netWorth: MoneyAggregate;
}

/**
 * Net worth for each of the last `months` months, computed fresh.
 *
 * For each month it sums every account's point-in-time balance plus every
 * holding's point-in-time value. Assets and liabilities fall out of the same
 * signed sum — a liability account already stores a negative balance, which is
 * the convention every historical transaction is written in (decision 11).
 * Accounts with `exclude_from_net_worth` set are left out entirely.
 *
 * The rate is resolved per month at that month's as-of date, not at today's: a
 * trend drawn with one current rate would move every historical point whenever
 * the rate moved, which makes the chart a record of the exchange rate rather
 * than of the portfolio.
 *
 * See docs/prd/finance/net-worth.md.
 */
export function getNetWorthTrend(months = 12): NetWorthPoint[] {
  const accountIds = listAccounts()
    .filter((a) => !a.excludeFromNetWorth)
    .map((a) => a.id);
  const today = todayIso();
  const baseCurrency = getBaseCurrency();
  // One read of the rate table for the whole trend. Rates for every month are
  // a subset of "everything on or before today", so a single query covers all
  // of them — this is the first and cheapest of the batching steps the
  // performance note calls for, before any thought of a cache.
  const rates = listFxRatesAsOf(today);
  const points: NetWorthPoint[] = [];

  for (let i = months - 1; i >= 0; i--) {
    const monthStart = addMonths(startOfMonth(today), -i);
    const asOfDate = i === 0 ? today : addDays(addMonths(monthStart, 1), -1);

    const accountTotals = getAccountsTotalByCurrency(accountIds, asOfDate);
    const holdings = getHoldingsTotalByCurrency(asOfDate);

    points.push({
      month: monthKey(monthStart),
      netWorth: aggregateToBase(mergeByCurrency(accountTotals, holdings.byCurrency), {
        baseCurrency,
        asOf: asOfDate,
        rates,
        confidenceByCurrency: combineConfidence(accountTotals, holdings.confidenceByCurrency),
      }),
    });
  }

  return points;
}

/**
 * A currency's confidence across both contributors.
 *
 * An account balance is a ledger sum of rows the user entered, so it is
 * `reported`: observed, not reconciled against a statement. A holding carries
 * whatever its valuation does. Weakest-link per currency, per decision 19 — so
 * one holding with an unknown price drags its currency's confidence down rather
 * than being averaged away.
 */
function combineConfidence(
  accountTotals: ReadonlyMap<Currency, number>,
  holdingConfidence: ReadonlyMap<Currency, ConfidenceLevel>,
): Map<Currency, ConfidenceLevel> {
  const combined = new Map<Currency, ConfidenceLevel>();
  for (const currency of new Set([...accountTotals.keys(), ...holdingConfidence.keys()])) {
    const levels: ConfidenceLevel[] = [];
    if (accountTotals.has(currency)) levels.push("reported");
    const fromHoldings = holdingConfidence.get(currency);
    if (fromHoldings) levels.push(fromHoldings);
    combined.set(currency, weakestConfidence(levels));
  }
  return combined;
}
