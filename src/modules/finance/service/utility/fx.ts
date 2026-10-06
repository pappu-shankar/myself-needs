import { CURRENCY_EXPONENT, FX_RATE_SCALE, type Currency } from "../../db/schema/currency";
import { daysBetween } from "@/lib/dates";
import { divRound, pow10, toSafeNumber } from "./integer-math";

/**
 * Dated currency conversion.
 *
 * Rates are held as one series per currency against a single pivot and
 * triangulated for cross-pairs, so adding a currency is one new series rather
 * than N more pairs. The pivot is EUR because the launch source is the ECB
 * daily reference series, which is published that way.
 *
 * Two rules the type system enforces here rather than leaving to callers:
 *
 * 1. **No rate is ever invented.** Every function returns `null` when it
 *    cannot resolve a rate on or before the as-of date. Converting at today's
 *    rate because the historical one is missing would present a fabricated
 *    figure as an observed one.
 * 2. **Every conversion is auditable.** The result carries the rate, its date
 *    and its source, so a displayed total can state the basis it was computed
 *    on — which is also why converted totals are never stored.
 *
 * See docs/prd/finance/currency-fx.md.
 */

export const FX_PIVOT: Currency = "EUR";

export interface FxRate {
  base: Currency;
  quote: Currency;
  date: string;
  rateScaled: number;
  source: string;
}

export interface ResolvedRate {
  /**
   * The rate as an exact fraction: `minor_to = minor_from × rateNum ÷ rateDen`.
   *
   * A single scaled rate would be wrong for the inverted and triangulated
   * paths, because it quantises the quotient *before* it multiplies the amount.
   * At 8 decimal places that is a relative error around 1e-7 — about ₹1,800 on
   * a ₹1,000 Cr position. Keeping the fraction means one rounding, at the end.
   */
  rateNum: number;
  rateDen: number;
  /** The same rate scaled by FX_RATE_SCALE, for display only — never for arithmetic. */
  rateScaled: number;
  /** The binding date — for a triangulated pair, the older of the two legs. */
  rateDate: string;
  rateSource: string;
}

export interface Conversion extends ResolvedRate {
  /** The converted amount, in `to`'s minor units. */
  minor: number;
}

const SCALE = BigInt(FX_RATE_SCALE);

/** Build a resolved rate from an exact fraction, deriving the display value. */
function asFraction(num: number, den: number, rateDate: string, rateSource: string): ResolvedRate {
  return {
    rateNum: num,
    rateDen: den,
    rateScaled: toSafeNumber(divRound(BigInt(num) * SCALE, BigInt(den)), "resolveRate"),
    rateDate,
    rateSource,
  };
}

/** Newest row for this exact pair dated on or before `asOf`. */
function latestOnOrBefore(
  rates: readonly FxRate[],
  base: Currency,
  quote: Currency,
  asOf: string,
): FxRate | null {
  let best: FxRate | null = null;
  for (const r of rates) {
    if (r.base !== base || r.quote !== quote || r.date > asOf) continue;
    if (best === null || r.date > best.date) best = r;
  }
  return best;
}

/**
 * The rate to turn `from` into `to` as of a date, direct, inverted, or
 * triangulated through the pivot. `null` when it cannot be known.
 */
export function resolveRate(
  rates: readonly FxRate[],
  from: Currency,
  to: Currency,
  asOf: string,
): ResolvedRate | null {
  if (from === to) {
    return asFraction(1, 1, asOf, "identity");
  }

  const direct = latestOnOrBefore(rates, from, to, asOf);
  if (direct) {
    return asFraction(direct.rateScaled, FX_RATE_SCALE, direct.date, direct.source);
  }

  // Inverted exactly: the fraction is flipped, not divided out and re-rounded.
  const inverse = latestOnOrBefore(rates, to, from, asOf);
  if (inverse && inverse.rateScaled !== 0) {
    return asFraction(
      FX_RATE_SCALE,
      inverse.rateScaled,
      inverse.date,
      `${inverse.source} (inverted)`,
    );
  }

  // Triangulate: (pivot → to) ÷ (pivot → from).
  if (from !== FX_PIVOT && to !== FX_PIVOT) {
    const pivotToFrom = latestOnOrBefore(rates, FX_PIVOT, from, asOf);
    const pivotToTo = latestOnOrBefore(rates, FX_PIVOT, to, asOf);
    if (pivotToFrom && pivotToTo && pivotToFrom.rateScaled !== 0) {
      return asFraction(
        pivotToTo.rateScaled,
        pivotToFrom.rateScaled,
        // The older leg binds: a pair is only as current as its stalest input.
        pivotToFrom.date < pivotToTo.date ? pivotToFrom.date : pivotToTo.date,
        `${pivotToTo.source} via ${FX_PIVOT}`,
      );
    }
  }

  return null;
}

/**
 * Convert an amount between currencies. Integer throughout, and `null` when no
 * rate is resolvable — never a silent fallback to a different date's rate.
 */
export function convert(
  rates: readonly FxRate[],
  minor: number,
  from: Currency,
  to: Currency,
  asOf: string,
): Conversion | null {
  if (!Number.isInteger(minor)) throw new Error("convert expects an integer minor amount");
  const resolved = resolveRate(rates, from, to, asOf);
  if (!resolved) return null;

  // minor_to = minor_from × rateNum ÷ rateDen × 10^(exp_to − exp_from).
  // One rounding, at the very end.
  const expFrom = CURRENCY_EXPONENT[from];
  const expTo = CURRENCY_EXPONENT[to];
  let numerator = BigInt(minor) * BigInt(resolved.rateNum);
  let denominator = BigInt(resolved.rateDen);
  if (expTo >= expFrom) numerator *= pow10(expTo - expFrom);
  else denominator *= pow10(expFrom - expTo);

  return { ...resolved, minor: toSafeNumber(divRound(numerator, denominator), "convert") };
}

/** Whether the rate backing a conversion is older than the allowed bound. */
export function isStale(rateDate: string, asOf: string, maxAgeDays: number): boolean {
  return daysBetween(rateDate, asOf) > maxAgeDays;
}
