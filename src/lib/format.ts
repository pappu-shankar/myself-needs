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

/**
 * A monetary value and the currency it is denominated in. Money is always this
 * pair: the minor-unit exponent is a property of the currency, not of the
 * column, so an amount without its currency cannot be formatted correctly.
 */
export interface Money {
  /** Integer amount in the currency's smallest unit (paise, cents, pence). */
  minor: number;
  /** ISO 4217 code. */
  currency: string;
}

/**
 * Each currency is formatted in its own conventional locale by default, not in
 * the reader's. `Intl` treats locale and currency independently, so `en-IN`
 * plus USD yields `$1,23,456.70` — Indian digit grouping on a dollar figure,
 * which is defensible by the spec and wrong to every actual reader. Pass an
 * explicit `locale` to override.
 */
const CURRENCY_LOCALES: Record<string, string> = {
  INR: "en-IN",
  USD: "en-US",
  GBP: "en-GB",
  EUR: "de-DE",
  JPY: "ja-JP",
};
const FALLBACK_LOCALE = "en-US";

function localeFor(currency: string, override?: string): string {
  return override ?? CURRENCY_LOCALES[currency] ?? FALLBACK_LOCALE;
}

const moneyFormatters = new Map<string, Intl.NumberFormat>();

function moneyFormatter(currency: string, locale: string, wholeUnits: boolean): Intl.NumberFormat {
  const key = `${currency}:${locale}:${wholeUnits}`;
  let formatter = moneyFormatters.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      ...(wholeUnits ? { minimumFractionDigits: 0, maximumFractionDigits: 0 } : {}),
    });
    moneyFormatters.set(key, formatter);
  }
  return formatter;
}

/** Minor units per major unit for a currency, from Intl rather than a hardcoded table. */
function exponentOf(currency: string, locale: string): number {
  return moneyFormatter(currency, locale, false).resolvedOptions().maximumFractionDigits ?? 2;
}

/**
 * Format money in its own currency: `{ minor: 12345670, currency: "INR" }` →
 * ₹1,23,456.70, and the same amount in USD → $123,456.70.
 *
 * `Intl` already knows each currency's exponent and symbol, which is why this
 * replaces the hand-rolled `₹`-and-`en-IN` formatters: those were correct only
 * for rupees, and silently wrong for a 0- or 3-decimal currency.
 *
 * Negative zero prints as zero, matching `formatAmount`.
 */
export function formatMoney(
  money: Money,
  options: { locale?: string; wholeUnits?: boolean } = {},
): string {
  const locale = localeFor(money.currency, options.locale);
  const major = money.minor / 10 ** exponentOf(money.currency, locale);
  const value = major === 0 ? 0 : major;
  return moneyFormatter(money.currency, locale, options.wholeUnits ?? false).format(value);
}

/** The same value without a currency symbol — for table columns that label the
 * currency once in the header rather than on every row. */
export function formatMoneyAmount(money: Money, options: { locale?: string } = {}): string {
  const locale = localeFor(money.currency, options.locale);
  const exponent = exponentOf(money.currency, locale);
  const major = money.minor / 10 ** exponent;
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: exponent,
    maximumFractionDigits: exponent,
  }).format(major === 0 ? 0 : major);
}

/**
 * A major-unit decimal the user typed → the integer minor-unit amount stored.
 *
 * This is the only place a money value crosses from a float to an integer, and
 * it exists so no call site writes `Math.round(x * 100)` and quietly assumes a
 * 2-decimal currency. The exponent comes from `Intl`, the same source
 * `formatMoney` reads, so the round-trip cannot disagree with the display.
 */
export function toMinor(major: number, currency: string): number {
  const exponent = exponentOf(currency, localeFor(currency));
  return Math.round(major * 10 ** exponent);
}

/**
 * The inverse, for pre-filling an edit form with what the user originally
 * typed. Never use it to do arithmetic — that is what put floats on money in
 * the first place. Arithmetic happens in minor units.
 */
export function toMajor(minor: number, currency: string): number {
  const exponent = exponentOf(currency, localeFor(currency));
  return minor / 10 ** exponent;
}
