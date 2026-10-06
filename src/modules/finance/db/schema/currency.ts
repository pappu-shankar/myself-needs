import { text, integer } from "drizzle-orm/sqlite-core";

/**
 * Launch currencies. Every monetary value stores its own currency beside the
 * amount, because the minor-unit exponent is a property of the currency, not
 * of the column — which is precisely why a single Drizzle `customType` cannot
 * carry money correctly once more than one currency exists (its callback only
 * ever sees its own column's value). See docs/prd/finance/currency-fx.md.
 */
export const CURRENCIES = ["INR", "USD", "GBP", "EUR"] as const;
export type Currency = (typeof CURRENCIES)[number];

/** Minor units per major unit, by currency. All four launch currencies are
 * 2-decimal; the table exists so adding JPY (0) or KWD (3) is a data change.
 *
 * This duplicates what `Intl` knows, deliberately: the BigInt valuation path
 * needs a plain integer exponent without constructing a formatter. A test
 * asserts the table agrees with `Intl`, so the two cannot drift. */
export const CURRENCY_EXPONENT: Record<Currency, number> = {
  INR: 2,
  USD: 2,
  GBP: 2,
  EUR: 2,
};

/** `INR` for every pre-existing row: there was no currency column before this,
 * and every stored value was rupees. */
export function currencyColumn(name = "currency") {
  return text(name, { enum: CURRENCIES }).notNull().default("INR");
}

/** Rates are stored scaled by 1e8 so triangulation stays exact in integers. */
export const FX_RATE_SCALE = 100_000_000;

/**
 * An integer amount in the currency's smallest unit. Named `*_minor` to make
 * the unit impossible to mistake at a call site — the previous design exposed
 * rupees as a plain `number`, which is how a float ever got near money.
 */
export function minorAmount(name: string) {
  return integer(name);
}
