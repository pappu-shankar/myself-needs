/**
 * Pure EMI amortization math — no DB access, so the exact same functions
 * power both the real "Debts" view (against a loan account's actual
 * outstanding balance) and the standalone calculator sandbox. See
 * docs/prd/finance/debts-loans.md and docs/prd/finance/calculators.md.
 */

export interface AmortizationRow {
  period: number;
  openingBalance: number;
  interest: number;
  principal: number;
  closingBalance: number;
}

export interface AmortizationInput {
  /** Current amount owed (positive), the starting point for the schedule. */
  outstandingBalance: number;
  /** Annual rate as a percentage, e.g. 9.5 for 9.5%. */
  annualInterestRate: number;
  emiAmount: number;
  /** Extra principal applied on top of the EMI every period. */
  extraPayment?: number;
  /** Safety cap so a non-amortizing EMI (doesn't cover interest) can't loop forever. */
  maxPeriods?: number;
}

/**
 * Schedule computed forward from the current outstanding balance (not the
 * original loan amount) using the standard EMI formula, so it reflects any
 * prepayments already made and always shows the *remaining* EMIs/tenure.
 */
export function computeAmortizationSchedule({
  outstandingBalance,
  annualInterestRate,
  emiAmount,
  extraPayment = 0,
  maxPeriods = 600,
}: AmortizationInput): AmortizationRow[] {
  const monthlyRate = annualInterestRate / 12 / 100;
  const rows: AmortizationRow[] = [];
  let balance = outstandingBalance;

  for (let period = 1; balance > 0.01 && period <= maxPeriods; period++) {
    const interest = balance * monthlyRate;
    const principal = Math.min(balance, Math.max(0, emiAmount + extraPayment - interest));
    const closingBalance = Math.max(0, balance - principal);
    rows.push({ period, openingBalance: balance, interest, principal, closingBalance });
    balance = closingBalance;
  }

  return rows;
}

export interface PrepaymentImpact {
  baseline: AmortizationRow[];
  withExtra: AmortizationRow[];
  monthsSaved: number;
  interestSaved: number;
}

/** Same schedule computed with and without a hypothetical extra payment, without altering real data. */
export function computePrepaymentImpact(
  input: AmortizationInput,
  extraPayment: number,
): PrepaymentImpact {
  const baseline = computeAmortizationSchedule(input);
  const withExtra = computeAmortizationSchedule({ ...input, extraPayment });

  const sumInterest = (rows: AmortizationRow[]) => rows.reduce((sum, r) => sum + r.interest, 0);

  return {
    baseline,
    withExtra,
    monthsSaved: baseline.length - withExtra.length,
    interestSaved: sumInterest(baseline) - sumInterest(withExtra),
  };
}

/** `balance ÷ credit_limit` as a percentage. `balance` is the amount owed (positive). */
export function getCreditUtilization(balance: number, creditLimit: number): number {
  if (!creditLimit) return 0;
  return (balance / creditLimit) * 100;
}

/**
 * Standard EMI formula: `P × r × (1+r)^n ÷ ((1+r)^n − 1)`, `r` the monthly
 * rate and `n` the tenure in months. Only needed by the EMI calculator — the
 * real Debts view never derives an EMI, it's an account field the user
 * already entered. See docs/prd/finance/calculators.md.
 */
export function computeEmiAmount(
  principal: number,
  annualInterestRate: number,
  tenureMonths: number,
): number {
  if (tenureMonths <= 0) return 0;
  const monthlyRate = annualInterestRate / 12 / 100;
  if (monthlyRate === 0) return principal / tenureMonths;
  const factor = Math.pow(1 + monthlyRate, tenureMonths);
  return (principal * monthlyRate * factor) / (factor - 1);
}
