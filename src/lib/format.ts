const amountFormatter = new Intl.NumberFormat("en-IN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const wholeAmountFormatter = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

/** Indian digit grouping with two decimals, no currency symbol: 1,23,456.70.
 * Negative zero (from float noise or rounding) prints as 0.00, not -0.00. */
export function formatAmount(amount: number): string {
  const rounded = Math.round(amount * 100) / 100;
  return amountFormatter.format(rounded === 0 ? 0 : rounded);
}

/** Rupee amount with symbol: ₹1,23,456.70. */
export function formatINR(amount: number, options: { wholeRupees?: boolean } = {}): string {
  if (options.wholeRupees) {
    const rounded = Math.round(amount);
    return `₹${wholeAmountFormatter.format(rounded === 0 ? 0 : rounded)}`;
  }
  return `₹${formatAmount(amount)}`;
}

/** `rate` as a fraction (0.1234 → "12.34%"); null/NaN/Infinity → "—". */
export function formatPercent(rate: number | null | undefined, decimals = 2): string {
  if (rate === null || rate === undefined || !Number.isFinite(rate)) return "—";
  const value = rate * 100;
  const rounded = Number(value.toFixed(decimals));
  return `${(rounded === 0 ? 0 : rounded).toFixed(decimals)}%`;
}

/** Plain number with a fixed number of decimals, dropping float noise
 * (2.9000000000000004 → "2.9"). */
export function formatNumber(value: number, maxDecimals = 2): string {
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: maxDecimals }).format(value);
}
