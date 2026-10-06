/**
 * Exact integer arithmetic for money.
 *
 * Several money operations have intermediate products that genuinely exceed
 * `Number.MAX_SAFE_INTEGER` — a unit count times a price, an amount times a
 * basis-point stake — so they are done in `BigInt` and narrowed back at the
 * boundary. This module is where that lives, so no caller handles BigInt.
 *
 * `BigInt` literals (`0n`) need an ES2020 target and the project targets
 * ES2017, so the constructor form is used throughout. `lib` already includes
 * `esnext`, so the type itself is available.
 */

const ZERO = BigInt(0);
const ONE = BigInt(1);
const TWO = BigInt(2);
const TEN = BigInt(10);

/** 10^n as a bigint, without the `**` operator. */
export function pow10(n: number): bigint {
  let result = ONE;
  for (let i = 0; i < n; i += 1) result *= TEN;
  return result;
}

/**
 * Divide, rounding half away from zero, entirely in integers.
 *
 * Half-away-from-zero rather than JavaScript's `Math.round` (half *up*) so a
 * credit and the matching debit round to the same magnitude — otherwise a
 * reversal would not net to zero at the half-paisa boundary.
 */
export function divRound(numerator: bigint, denominator: bigint): bigint {
  if (denominator === ZERO) throw new Error("divRound: division by zero");
  const negative = numerator < ZERO !== denominator < ZERO;
  const n = numerator < ZERO ? -numerator : numerator;
  const d = denominator < ZERO ? -denominator : denominator;
  const quotient = (n * TWO + d) / (d * TWO);
  return negative ? -quotient : quotient;
}

/** Narrow a bigint result back to a `number`, refusing a silent precision loss. */
export function toSafeNumber(value: bigint, context: string): number {
  const limit = BigInt(Number.MAX_SAFE_INTEGER);
  if (value > limit || value < -limit) {
    throw new Error(`${context}: result exceeds the safe integer range`);
  }
  return Number(value);
}
