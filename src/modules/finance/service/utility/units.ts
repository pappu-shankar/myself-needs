import { CURRENCY_EXPONENT, type Currency } from "../../db/schema/currency";
import { divRound, pow10, toSafeNumber } from "./integer-math";

/**
 * Holding valuation in exact integers.
 *
 * Units and prices are stored as scaled integers rather than floats because
 * the previous design multiplied an integer-exact unit count by a REAL price,
 * so cash was exact while every investment value drifted.
 *
 * The product genuinely overflows IEEE-754's safe range: 1e7 units at
 * ₹100,000 is `1e13 × 1e11 = 1e24`, against a `Number.MAX_SAFE_INTEGER` of
 * about 9e15. So the multiply happens in `BigInt` — confined to this file, so
 * no caller ever has to think about it.
 */

/** Units are stored to 6 decimal places (mutual-fund units need ~3–4). */
export const UNITS_SCALE = 1_000_000;
/** Prices are stored to 6 decimal places, independent of currency exponent. */
export const PRICE_SCALE = 1_000_000;

const UNITS_SCALE_BIG = BigInt(UNITS_SCALE);
const PRICE_SCALE_BIG = BigInt(PRICE_SCALE);

/**
 * `unitsScaled × priceScaled` → an amount in the currency's minor units.
 *
 * Returns a `number`: the *result* is an ordinary money amount well inside the
 * safe range even when the intermediate product is not.
 */
export function valueOfUnits(unitsScaled: number, priceScaled: number, currency: Currency): number {
  if (!Number.isInteger(unitsScaled) || !Number.isInteger(priceScaled)) {
    throw new Error("valueOfUnits expects scaled integers, not fractional values");
  }
  const product = BigInt(unitsScaled) * BigInt(priceScaled) * pow10(CURRENCY_EXPONENT[currency]);
  return toSafeNumber(divRound(product, UNITS_SCALE_BIG * PRICE_SCALE_BIG), "valueOfUnits");
}

/** Convert a user-entered decimal unit count to its stored scaled integer. */
export function toUnitsScaled(units: number): number {
  return Math.round(units * UNITS_SCALE);
}

/** Convert a user-entered decimal price to its stored scaled integer. */
export function toPriceScaled(price: number): number {
  return Math.round(price * PRICE_SCALE);
}

export function fromUnitsScaled(unitsScaled: number): number {
  return unitsScaled / UNITS_SCALE;
}
