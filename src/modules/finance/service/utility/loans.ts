import { divRound, toSafeNumber } from "./integer-math";
import { applyRatio } from "./returns";

/**
 * Pure EMI amortization math — no DB access, so the exact same functions
 * power both the real "Debts" view and the standalone calculator sandbox.
 * See docs/prd/finance/debts-loans.md and docs/prd/finance/calculators.md.
 *
 * The real view used to hand these functions an account row, because the loan
 * fields lived on `finance_accounts`. They now live in `finance_loan_terms`
 * and `finance_credit_terms`, and these functions deliberately did **not**
 * follow them into taking a terms row: a schedule is a function of
 * (balance, rate, EMI) and nothing else, which is what lets the calculator
 * sandbox run it on numbers that are not in the database at all. Callers pass
 * `getAccountBalanceMinor(accountId)` with `loanTerms.rateBps` /
 * `loanTerms.emiMinor`.
 *
 * Amounts are integer minor units and the rate is integer basis points, so a
 * schedule's principal column sums back to the opening balance *exactly* —
 * with rupee floats the 300th row's rounding error was already visible.
 */

/** Basis points per unit × months per year: `balanceMinor × rateBps ÷ this`
 * is one month's interest with a single rounding. Dividing an annual figure by
 * 12 afterwards would round twice, and the second rounding is what made a
 * schedule's interest column disagree with its own total. */
const BPS_MONTHS = 120_000;

export interface AmortizationRow {
  period: number;
  openingBalanceMinor: number;
  interestMinor: number;
  principalMinor: number;
  closingBalanceMinor: number;
}

export interface AmortizationInput {
  /** Current amount owed (positive), in minor units — the starting point. */
  outstandingBalanceMinor: number;
  /** Annual rate in integer basis points, e.g. 950 for 9.5%. */
  rateBps: number;
  emiMinor: number;
  /** Extra principal applied on top of the EMI every period, in minor units. */
  extraPaymentMinor?: number;
  /** Safety cap so a non-amortizing EMI (doesn't cover interest) can't loop forever. */
  maxPeriods?: number;
}

/** One month's interest on `balanceMinor`, exact to the minor unit. */
function monthlyInterestMinor(balanceMinor: number, rateBps: number): number {
  return toSafeNumber(
    divRound(BigInt(balanceMinor) * BigInt(rateBps), BigInt(BPS_MONTHS)),
    "monthlyInterestMinor",
  );
}

/**
 * Schedule computed forward from the current outstanding balance (not the
 * original loan amount) using the standard EMI formula, so it reflects any
 * prepayments already made and always shows the *remaining* EMIs/tenure.
 */
export function computeAmortizationSchedule({
  outstandingBalanceMinor,
  rateBps,
  emiMinor,
  extraPaymentMinor = 0,
  maxPeriods = 600,
}: AmortizationInput): AmortizationRow[] {
  const rows: AmortizationRow[] = [];
  let balanceMinor = outstandingBalanceMinor;

  // `> 0`, not the old `> 0.01`: the balance is an integer count of minor
  // units now, so "paid off" is exactly zero and needs no float tolerance.
  for (let period = 1; balanceMinor > 0 && period <= maxPeriods; period++) {
    const interestMinor = monthlyInterestMinor(balanceMinor, rateBps);
    const principalMinor = Math.min(
      balanceMinor,
      Math.max(0, emiMinor + extraPaymentMinor - interestMinor),
    );
    const closingBalanceMinor = balanceMinor - principalMinor;
    rows.push({
      period,
      openingBalanceMinor: balanceMinor,
      interestMinor,
      principalMinor,
      closingBalanceMinor,
    });
    balanceMinor = closingBalanceMinor;
  }

  return rows;
}

export interface PrepaymentImpact {
  baseline: AmortizationRow[];
  withExtra: AmortizationRow[];
  monthsSaved: number;
  interestSavedMinor: number;
}

/** Same schedule computed with and without a hypothetical extra payment, without altering real data. */
export function computePrepaymentImpact(
  input: AmortizationInput,
  extraPaymentMinor: number,
): PrepaymentImpact {
  const baseline = computeAmortizationSchedule(input);
  const withExtra = computeAmortizationSchedule({ ...input, extraPaymentMinor });

  const sumInterest = (rows: AmortizationRow[]) =>
    rows.reduce((sum, r) => sum + r.interestMinor, 0);

  return {
    baseline,
    withExtra,
    monthsSaved: baseline.length - withExtra.length,
    interestSavedMinor: sumInterest(baseline) - sumInterest(withExtra),
  };
}

/**
 * `balance ÷ credit_limit` as a percentage. Both amounts are minor units of
 * the *same* currency — a card's balance and its limit are by definition in
 * the card's own currency, so the ratio needs no conversion. A percentage
 * (not basis points) because it never multiplies money: it is displayed and
 * compared against the 30%/50% thresholds.
 */
export function getCreditUtilization(balanceMinor: number, creditLimitMinor: number): number {
  if (!creditLimitMinor) return 0;
  return (balanceMinor / creditLimitMinor) * 100;
}

/**
 * Standard EMI formula: `P × r × (1+r)^n ÷ ((1+r)^n − 1)`, `r` the monthly
 * rate and `n` the tenure in months. Only needed by the EMI calculator — the
 * real Debts view never derives an EMI, it reads `finance_loan_terms.emi_minor`,
 * which the user (or their bank) already set. See
 * docs/prd/finance/calculators.md.
 *
 * The annuity factor is a float ratio; `applyRatio` lands it on a whole minor
 * unit with one rounding.
 */
export function computeEmiAmount(
  principalMinor: number,
  rateBps: number,
  tenureMonths: number,
): number {
  if (tenureMonths <= 0) return 0;
  if (rateBps === 0) {
    return toSafeNumber(divRound(BigInt(principalMinor), BigInt(tenureMonths)), "computeEmiAmount");
  }
  const monthlyRate = rateBps / BPS_MONTHS;
  const factor = Math.pow(1 + monthlyRate, tenureMonths);
  return applyRatio(principalMinor, (monthlyRate * factor) / (factor - 1));
}
