import xirrPackage from "xirr";

/**
 * Pure return-rate math — no DB access, so the exact same functions power
 * both the real per-holding/portfolio numbers and the standalone calculator
 * page. See docs/prd/finance/returns-analytics.md.
 */

export interface CashFlowInput {
  amount: number;
  date: string;
}

/**
 * Concatenates the ledger's cash flows with a final "as of today" inflow of
 * `currentValue` — the standard way to turn a still-open position into a
 * closed set of transactions XIRR/IRR can solve against.
 */
function withCurrentValue(
  cashFlows: CashFlowInput[],
  currentValue: number,
  asOfDate: string,
): CashFlowInput[] {
  return [...cashFlows, { amount: currentValue, date: asOfDate }];
}

/**
 * The default "your returns" number — correctly handles real, irregularly
 * dated cash flows (SIPs, top-ups, partial withdrawals, dividends), same as
 * the mutual-fund industry reports it. Returns `null` rather than throwing
 * when there isn't enough data to solve (fewer than 2 flows, all one sign,
 * all on the same day, or the underlying Newton's-method solver doesn't
 * converge) — callers show "not enough data" instead of crashing.
 */
export function computeXirr(
  cashFlows: CashFlowInput[],
  currentValue: number,
  asOfDate: string,
): number | null {
  const transactions = withCurrentValue(cashFlows, currentValue, asOfDate).map((cf) => ({
    amount: cf.amount,
    when: new Date(cf.date),
  }));

  try {
    return xirrPackage(transactions);
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
 * `amounts[0]` is the initial outflow, subsequent entries are one per
 * period. Returns `null` if it can't find a root.
 */
export function computeIrr(amounts: number[]): number | null {
  if (amounts.length < 2) return null;
  if (amounts.every((a) => a >= 0) || amounts.every((a) => a <= 0)) return null;

  let r = 0.1;
  for (let i = 0; i < MAX_NEWTON_ITERATIONS; i++) {
    const [value, derivative] = periodicValueAndDerivative(amounts, r);
    if (Math.abs(value) < NEWTON_TOLERANCE) return r;
    if (derivative === 0) break;
    const next = r - value / derivative;
    if (!Number.isFinite(next) || next <= -1) break;
    r = next;
  }

  // Newton didn't converge — bisect over a wide, practical rate range instead.
  let low = -0.99;
  let high = 10;
  const [lowValue] = periodicValueAndDerivative(amounts, low);
  const [highValue] = periodicValueAndDerivative(amounts, high);
  if (Math.sign(lowValue) === Math.sign(highValue)) return null;

  for (let i = 0; i < MAX_NEWTON_ITERATIONS; i++) {
    const mid = (low + high) / 2;
    const [midValue] = periodicValueAndDerivative(amounts, mid);
    if (Math.abs(midValue) < NEWTON_TOLERANCE) return mid;
    if (Math.sign(midValue) === Math.sign(lowValue)) {
      low = mid;
    } else {
      high = mid;
    }
  }
  return (low + high) / 2;
}

/** Single start value/date + end value/date, no interim cash flows — e.g. "this lumpsum grew from X to Y over N years." */
export function computeCagr(startValue: number, endValue: number, years: number): number | null {
  if (startValue <= 0 || years <= 0) return null;
  return Math.pow(endValue / startValue, 1 / years) - 1;
}

/** Compounds `principal` annually at `annualRatePercent` for `years` — the shared formula behind the lumpsum and inflation calculators (they ask the same question in different units). */
function compoundGrowth(principal: number, annualRatePercent: number, years: number): number {
  return principal * Math.pow(1 + annualRatePercent / 100, years);
}

/** Lumpsum calculator: principal + rate + years → future value. */
export function computeLumpsumFutureValue(
  principal: number,
  annualRatePercent: number,
  years: number,
): number {
  return compoundGrowth(principal, annualRatePercent, years);
}

export interface SipResult {
  futureValue: number;
  totalInvested: number;
  totalGain: number;
}

/**
 * SIP calculator: monthly amount + expected annual rate + years → future
 * value, total invested, total gain. Standard annuity-due formula (each
 * month's contribution is assumed to land at the start of that month and
 * compound for the full month, which is how SIP calculators conventionally
 * treat it).
 */
export function computeSipFutureValue(
  monthlyAmount: number,
  annualRatePercent: number,
  years: number,
): SipResult {
  const monthlyRate = annualRatePercent / 12 / 100;
  const months = years * 12;
  const totalInvested = monthlyAmount * months;

  if (monthlyRate === 0) {
    return { futureValue: totalInvested, totalInvested, totalGain: 0 };
  }

  const futureValue =
    monthlyAmount * ((Math.pow(1 + monthlyRate, months) - 1) / monthlyRate) * (1 + monthlyRate);
  return { futureValue, totalInvested, totalGain: futureValue - totalInvested };
}

/** Inflation calculator: present value + inflation rate + years → future equivalent value (same math as lumpsum growth, applied to purchasing power instead of an investment). */
export function computeInflationAdjustedValue(
  presentValue: number,
  inflationRatePercent: number,
  years: number,
): number {
  return compoundGrowth(presentValue, inflationRatePercent, years);
}

/** Real rate of return: nominal − inflation, per the PRD's explicit (simplified, non-Fisher) formula. */
export function computeRealRateOfReturn(
  nominalRatePercent: number,
  inflationRatePercent: number,
): number {
  return nominalRatePercent - inflationRatePercent;
}
