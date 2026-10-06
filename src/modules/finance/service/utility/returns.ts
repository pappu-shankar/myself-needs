import xirrPackage from "xirr";
import { divRound, toSafeNumber } from "./integer-math";

/**
 * Pure return-rate math — no DB access, so the exact same functions power
 * both the real per-holding/portfolio numbers and the standalone calculator
 * page. See docs/prd/finance/returns-analytics.md.
 *
 * Two different kinds of number live here and the distinction is the whole
 * point: **amounts are integer minor units** (`*Minor`) and **rates the user
 * typed are integer basis points** (`*Bps`), while a *solved* rate (XIRR, IRR,
 * CAGR) and an intermediate growth factor stay floats — they are ratios, not
 * money, and quantising them would be inventing precision. Every crossing
 * from a float ratio back to money goes through `applyRatio`, which rounds
 * exactly once.
 */

/** Scale a float growth ratio is quantised to before it multiplies money.
 * 1e9 is far finer than any rate's own precision, so the single rounding
 * `applyRatio` performs lands on the money unit, not on the ratio. */
const RATIO_SCALE = 1_000_000_000;

const BPS_PER_UNIT = 10_000;

/**
 * `minor × ratio` with one rounding, in integers.
 *
 * Shared with `loans.ts`: both modules compute a growth/annuity factor as a
 * float and then have to land it on a whole minor unit. Doing that with plain
 * `*` and `Math.round` is what let rupee floats accumulate drift before, so
 * the multiply itself happens in BigInt.
 */
export function applyRatio(minor: number, ratio: number): number {
  if (!Number.isFinite(ratio)) throw new Error("applyRatio: ratio must be finite");
  return toSafeNumber(
    divRound(BigInt(minor) * BigInt(Math.round(ratio * RATIO_SCALE)), BigInt(RATIO_SCALE)),
    "applyRatio",
  );
}

export interface CashFlowInput {
  /** Signed, in the flow's own currency's minor units: negative = money in. */
  amountMinor: number;
  date: string;
}

/**
 * Concatenates the ledger's cash flows with a final "as of today" inflow of
 * `currentValueMinor` — the standard way to turn a still-open position into a
 * closed set of transactions XIRR/IRR can solve against.
 */
function withCurrentValue(
  cashFlows: CashFlowInput[],
  currentValueMinor: number,
  asOfDate: string,
): CashFlowInput[] {
  return [...cashFlows, { amountMinor: currentValueMinor, date: asOfDate }];
}

/**
 * The default "your returns" number — correctly handles real, irregularly
 * dated cash flows (SIPs, top-ups, partial withdrawals, dividends), same as
 * the mutual-fund industry reports it. Returns `null` rather than throwing
 * when there isn't enough data to solve (fewer than 2 flows, all one sign,
 * all on the same day, or the underlying Newton's-method solver doesn't
 * converge) — callers show "not enough data" instead of crashing.
 *
 * Every amount must be in the *same* currency: the rate solves a ratio of
 * sums, so mixing currencies would be the forbidden cross-currency add in
 * disguise. Callers group by currency first (see `getPortfolioXirrByCurrency`).
 */
export function computeXirr(
  cashFlows: CashFlowInput[],
  currentValueMinor: number,
  asOfDate: string,
): number | null {
  const transactions = withCurrentValue(cashFlows, currentValueMinor, asOfDate)
    .filter((cf) => cf.amountMinor !== 0)
    .map((cf) => ({ amount: cf.amountMinor, when: new Date(cf.date) }));

  // A rate only exists when money went both in and out. Without this guard a
  // holding with contributions but no value yet (e.g. no valuation recorded)
  // comes back from the solver as -100% instead of "not enough data".
  if (!transactions.some((t) => t.amount > 0) || !transactions.some((t) => t.amount < 0)) {
    return null;
  }

  try {
    const rate = xirrPackage(transactions);
    return Number.isFinite(rate) && rate > -1 ? rate : null;
  } catch {
    return null;
  }
}

const MAX_NEWTON_ITERATIONS = 100;
const NEWTON_TOLERANCE = 1e-7;

/** Present value of periodic cash flows (index = period number) at rate `r`, and its derivative. */
function periodicValueAndDerivative(amounts: number[], r: number): [number, number] {
  let value = 0;
  let derivative = 0;
  for (let i = 0; i < amounts.length; i++) {
    const denom = Math.pow(1 + r, i);
    value += amounts[i] / denom;
    if (i > 0) derivative += (-i * amounts[i]) / Math.pow(1 + r, i + 1);
  }
  return [value, derivative];
}

/**
 * Same idea as XIRR but assumes evenly-spaced periods (index-based, not
 * real dates) — included for explicit periodic-model comparisons. Newton's
 * method with a bisection fallback (no extra dependency, unlike XIRR).
 * `amountsMinor[0]` is the initial outflow, subsequent entries are one per
 * period, all in one currency's minor units. Returns `null` if it can't find
 * a root.
 */
export function computeIrr(amountsMinor: number[]): number | null {
  if (amountsMinor.length < 2) return null;
  if (amountsMinor.every((a) => a >= 0) || amountsMinor.every((a) => a <= 0)) return null;

  let r = 0.1;
  for (let i = 0; i < MAX_NEWTON_ITERATIONS; i++) {
    const [value, derivative] = periodicValueAndDerivative(amountsMinor, r);
    if (Math.abs(value) < NEWTON_TOLERANCE) return r;
    if (derivative === 0) break;
    const next = r - value / derivative;
    if (!Number.isFinite(next) || next <= -1) break;
    r = next;
  }

  // Newton didn't converge — bisect over a wide, practical rate range instead.
  let low = -0.99;
  let high = 10;
  const [lowValue] = periodicValueAndDerivative(amountsMinor, low);
  const [highValue] = periodicValueAndDerivative(amountsMinor, high);
  if (Math.sign(lowValue) === Math.sign(highValue)) return null;

  for (let i = 0; i < MAX_NEWTON_ITERATIONS; i++) {
    const mid = (low + high) / 2;
    const [midValue] = periodicValueAndDerivative(amountsMinor, mid);
    if (Math.abs(midValue) < NEWTON_TOLERANCE) return mid;
    if (Math.sign(midValue) === Math.sign(lowValue)) {
      low = mid;
    } else {
      high = mid;
    }
  }
  return (low + high) / 2;
}

/**
 * Single start value/date + end value/date, no interim cash flows — e.g. "this
 * lumpsum grew from X to Y over N years." Both values are minor units of the
 * same currency; the result is a ratio, so the unit cancels out.
 */
export function computeCagr(
  startValueMinor: number,
  endValueMinor: number,
  years: number,
): number | null {
  // Growth between a non-positive start or end isn't a rate (and the power of a
  // negative ratio is NaN), so report "not enough data" instead.
  if (!(startValueMinor > 0) || !(endValueMinor > 0) || !(years > 0)) return null;
  const rate = Math.pow(endValueMinor / startValueMinor, 1 / years) - 1;
  return Number.isFinite(rate) ? rate : null;
}

/** Compounds `principalMinor` annually at `annualRateBps` for `years` — the
 * shared formula behind the lumpsum and inflation calculators (they ask the
 * same question in different units). The growth factor is a float ratio; the
 * money it multiplies is rounded once, by `applyRatio`. */
function compoundGrowth(principalMinor: number, annualRateBps: number, years: number): number {
  return applyRatio(principalMinor, Math.pow(1 + annualRateBps / BPS_PER_UNIT, years));
}

/** Lumpsum calculator: principal + rate + years → future value, all in minor units/bps. */
export function computeLumpsumFutureValue(
  principalMinor: number,
  annualRateBps: number,
  years: number,
): number {
  return compoundGrowth(principalMinor, annualRateBps, years);
}

export interface SipResult {
  futureValueMinor: number;
  totalInvestedMinor: number;
  totalGainMinor: number;
}

/**
 * SIP calculator: monthly amount + expected annual rate + years → future
 * value, total invested, total gain. Standard annuity-due formula (each
 * month's contribution is assumed to land at the start of that month and
 * compound for the full month, which is how SIP calculators conventionally
 * treat it).
 *
 * `totalGainMinor` is a subtraction of two already-rounded integers rather
 * than a separately rounded figure, so the three numbers the UI shows side by
 * side always add up.
 */
export function computeSipFutureValue(
  monthlyAmountMinor: number,
  annualRateBps: number,
  years: number,
): SipResult {
  const monthlyRate = annualRateBps / 12 / BPS_PER_UNIT;
  const months = years * 12;
  const totalInvestedMinor = applyRatio(monthlyAmountMinor, months);

  if (monthlyRate === 0) {
    return { futureValueMinor: totalInvestedMinor, totalInvestedMinor, totalGainMinor: 0 };
  }

  const futureValueMinor = applyRatio(
    monthlyAmountMinor,
    ((Math.pow(1 + monthlyRate, months) - 1) / monthlyRate) * (1 + monthlyRate),
  );
  return {
    futureValueMinor,
    totalInvestedMinor,
    totalGainMinor: futureValueMinor - totalInvestedMinor,
  };
}

/** Inflation calculator: present value + inflation rate + years → future equivalent value (same math as lumpsum growth, applied to purchasing power instead of an investment). */
export function computeInflationAdjustedValue(
  presentValueMinor: number,
  inflationRateBps: number,
  years: number,
): number {
  return compoundGrowth(presentValueMinor, inflationRateBps, years);
}

/** Real rate of return: nominal − inflation, per the PRD's explicit
 * (simplified, non-Fisher) formula. Basis points in, basis points out — an
 * exact integer subtraction, where the float version could return 5.999999. */
export function computeRealRateOfReturn(
  nominalRateBps: number,
  inflationRateBps: number,
): number {
  return nominalRateBps - inflationRateBps;
}
