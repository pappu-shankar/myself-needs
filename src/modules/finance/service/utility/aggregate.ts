import type { Currency } from "../../db/schema/currency";
import type { ConfidenceLevel } from "../../db/schema/provenance";
import { convert, isStale, type FxRate } from "./fx";

/**
 * Turning per-currency subtotals into one displayable figure.
 *
 * Every query that sums money across accounts returns per-currency subtotals
 * (decision 8: SQL never multiplies money by a rate). This is where those
 * subtotals become a single number — and where that number is made to carry
 * its own basis, because decision 16 says a converted total is never stored:
 * historical rates get back-filled routinely, so a stored figure drifts away
 * from the rate it cites while still citing it.
 *
 * The rule the return type enforces: a total that could not be fully converted
 * says so. It does not quietly drop the currencies it could not resolve.
 */

/** How long a rate may be before it is called out as stale in the UI. */
export const DEFAULT_MAX_RATE_AGE_DAYS = 7;

export interface CurrencyContribution {
  currency: Currency;
  /** The subtotal in its own currency's minor units, unconverted. */
  minor: number;
  /** The same amount in the base currency, or null when no rate resolved. */
  baseMinor: number | null;
  rateNum: number | null;
  rateDen: number | null;
  /** Scaled rate, for display only — never arithmetic. */
  rateScaled: number | null;
  rateDate: string | null;
  rateSource: string | null;
  stale: boolean;
}

export interface MoneyAggregate {
  /** The headline figure, in `baseCurrency`'s minor units. Sums only the
   * contributions that converted; `complete` says whether that was all of
   * them. */
  baseMinor: number;
  baseCurrency: Currency;
  /** One entry per contributing currency, with the rate actually used. */
  byCurrency: CurrencyContribution[];
  /** False when at least one currency had no resolvable rate as of the date.
   * A UI showing an incomplete total must say which currency is missing rather
   * than present a short number as the whole. */
  complete: boolean;
  /** True when any rate used is older than the allowed bound. */
  stale: boolean;
  /** Weakest confidence among the contributors (decision 19). */
  confidence: ConfidenceLevel;
  /** The same confidence, broken down by share of value, so the UI can say
   * "₹4.2 Cr — 71% verified, 29% estimated" rather than only the weakest. */
  confidenceMix: ConfidenceShare[];
}

export interface ConfidenceShare {
  confidence: ConfidenceLevel;
  /** Absolute base-currency minor units carried at this confidence. */
  baseMinor: number;
  /** Share of the aggregate's absolute value, 0–1. */
  share: number;
}

/** Weakest first is how confidence propagates: an aggregate is only as
 * trustworthy as its least trustworthy contributor. */
const CONFIDENCE_ORDER: ConfidenceLevel[] = ["unknown", "estimated", "reported", "verified"];

export function weakestConfidence(levels: readonly ConfidenceLevel[]): ConfidenceLevel {
  if (levels.length === 0) return "unknown";
  let weakest = levels[0];
  for (const level of levels) {
    if (CONFIDENCE_ORDER.indexOf(level) < CONFIDENCE_ORDER.indexOf(weakest)) weakest = level;
  }
  return weakest;
}

/**
 * Confidence by share of value rather than by row count: one estimated
 * ₹2 Cr holding among fifty verified ₹10,000 ones is the thing worth saying,
 * and a count-weighted mix would bury it.
 *
 * Shares use absolute values, so a liability does not cancel out an asset's
 * contribution to the mix.
 */
export function confidenceMix(
  contributions: readonly { confidence: ConfidenceLevel; baseMinor: number }[],
): ConfidenceShare[] {
  const totals = new Map<ConfidenceLevel, number>();
  let absTotal = 0;
  for (const c of contributions) {
    totals.set(c.confidence, (totals.get(c.confidence) ?? 0) + c.baseMinor);
    absTotal += Math.abs(c.baseMinor);
  }
  return [...totals.entries()]
    .map(([confidence, baseMinor]) => ({
      confidence,
      baseMinor,
      share: absTotal === 0 ? 0 : Math.abs(baseMinor) / absTotal,
    }))
    .sort(
      (a, b) => CONFIDENCE_ORDER.indexOf(a.confidence) - CONFIDENCE_ORDER.indexOf(b.confidence),
    );
}

export interface AggregateOptions {
  baseCurrency: Currency;
  asOf: string;
  rates: readonly FxRate[];
  maxRateAgeDays?: number;
  /** Confidence per contributing currency, where the caller tracks it. Any
   * currency without an entry counts as `unknown` — the honest default, since
   * a missing provenance is not a verified one. */
  confidenceByCurrency?: ReadonlyMap<Currency, ConfidenceLevel>;
}

/**
 * Convert per-currency subtotals into a base-currency aggregate that states
 * the rate it used for each one.
 */
export function aggregateToBase(
  byCurrency: ReadonlyMap<Currency, number>,
  options: AggregateOptions,
): MoneyAggregate {
  const { baseCurrency, asOf, rates } = options;
  const maxAge = options.maxRateAgeDays ?? DEFAULT_MAX_RATE_AGE_DAYS;

  const contributions: CurrencyContribution[] = [];
  let baseMinor = 0;
  let complete = true;
  let stale = false;

  // Sorted so the same inputs always produce the same order — a total that
  // reorders between renders reads like it changed.
  for (const currency of [...byCurrency.keys()].sort()) {
    const minor = byCurrency.get(currency)!;
    const converted = convert(rates, minor, currency, baseCurrency, asOf);
    if (!converted) {
      complete = false;
      contributions.push({
        currency,
        minor,
        baseMinor: null,
        rateNum: null,
        rateDen: null,
        rateScaled: null,
        rateDate: null,
        rateSource: null,
        stale: false,
      });
      continue;
    }
    const rateStale =
      converted.rateSource !== "identity" && isStale(converted.rateDate, asOf, maxAge);
    if (rateStale) stale = true;
    baseMinor += converted.minor;
    contributions.push({
      currency,
      minor,
      baseMinor: converted.minor,
      rateNum: converted.rateNum,
      rateDen: converted.rateDen,
      rateScaled: converted.rateScaled,
      rateDate: converted.rateDate,
      rateSource: converted.rateSource,
      stale: rateStale,
    });
  }

  const levels = contributions.map(
    (c) => options.confidenceByCurrency?.get(c.currency) ?? "unknown",
  );
  return {
    baseMinor,
    baseCurrency,
    byCurrency: contributions,
    complete,
    stale,
    confidence: weakestConfidence(levels),
    confidenceMix: confidenceMix(
      contributions.map((c, i) => ({ confidence: levels[i], baseMinor: c.baseMinor ?? 0 })),
    ),
  };
}

/** Add per-currency subtotal maps together without converting anything. */
export function mergeByCurrency(...maps: ReadonlyMap<Currency, number>[]): Map<Currency, number> {
  const merged = new Map<Currency, number>();
  for (const map of maps) {
    for (const [currency, minor] of map) {
      merged.set(currency, (merged.get(currency) ?? 0) + minor);
    }
  }
  return merged;
}

/** Negate every subtotal — for turning liabilities into a deduction. */
export function negateByCurrency(map: ReadonlyMap<Currency, number>): Map<Currency, number> {
  return new Map([...map].map(([currency, minor]) => [currency, -minor]));
}
