import type { Currency } from "../../db/schema/currency";
import { divRound, toSafeNumber } from "./integer-math";

/**
 * Ownership proration and the consolidation order.
 *
 * Stakes are integer basis points (7000 = 70%) and are applied as multipliers
 * on money, so the arithmetic is integer throughout: a float percentage would
 * reintroduce on the multiplier side exactly the drift that integer money
 * storage exists to remove.
 *
 * See docs/prd/finance/entities-ownership.md.
 */

export const BPS_FULL = 10_000;

export interface Stake {
  entityId: number;
  holderEntityId: number;
  ownershipBps: number;
  effectiveFrom: string;
  effectiveTo: string | null;
}

/** A per-entity, per-currency subtotal — the unit consolidation operates on. */
export interface EntityPosition {
  entityId: number;
  currency: Currency;
  minor: number;
}

/**
 * Apply a stake to an amount. BigInt because `minor × bps` reaches 1e15 for a
 * large position, uncomfortably close to `Number.MAX_SAFE_INTEGER`.
 */
export function prorate(minor: number, bps: number): number {
  if (!Number.isInteger(minor)) throw new Error("prorate expects an integer minor amount");
  if (bps === BPS_FULL) return minor;
  return toSafeNumber(divRound(BigInt(minor) * BigInt(bps), BigInt(BPS_FULL)), "prorate");
}

/**
 * The stake in force on a given date. Dated because a stake changes — a
 * founder's holding dilutes across rounds — and net worth as of 2024 must use
 * the 2024 stake, not today's.
 */
export function stakeBpsAt(
  stakes: readonly Stake[],
  entityId: number,
  asOf: string,
): number | null {
  const applicable = stakes
    .filter(
      (s) =>
        s.entityId === entityId &&
        s.effectiveFrom <= asOf &&
        (s.effectiveTo === null || s.effectiveTo > asOf),
    )
    .sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? 1 : -1));
  return applicable.length > 0 ? applicable[0].ownershipBps : null;
}

export interface ConsolidationResult {
  totalMinor: number;
  byCurrency: { currency: Currency; minor: number }[];
}

/**
 * Consolidate positions into one base-currency total.
 *
 * The order is load-bearing and must not be rearranged:
 *
 *   sum per (entity, currency) → prorate by stake → convert → sum
 *
 * Converting before prorating double-rounds. Prorating each underlying row
 * before summing rounds once per row instead of once per entity subtotal,
 * which accumulates error in proportion to how many rows the entity holds.
 */
export function consolidate(
  positions: readonly EntityPosition[],
  options: {
    stakeBpsFor(entityId: number): number | null;
    convertToBase(minor: number, from: Currency): number | null;
  },
): ConsolidationResult {
  // 1. Sum per (entity, currency) — before any multiplication.
  const grouped = new Map<string, EntityPosition>();
  for (const p of positions) {
    const key = `${p.entityId}:${p.currency}`;
    const existing = grouped.get(key);
    if (existing) existing.minor += p.minor;
    else grouped.set(key, { ...p });
  }

  // 2. Prorate each subtotal once. 3. Convert. 4. Sum.
  const perCurrency = new Map<Currency, number>();
  let totalMinor = 0;
  for (const position of grouped.values()) {
    const bps = options.stakeBpsFor(position.entityId);
    if (bps === null) continue;
    const owned = prorate(position.minor, bps);
    perCurrency.set(position.currency, (perCurrency.get(position.currency) ?? 0) + owned);
    const converted = options.convertToBase(owned, position.currency);
    if (converted === null) continue;
    totalMinor += converted;
  }

  return {
    totalMinor,
    byCurrency: [...perCurrency.entries()].map(([currency, minor]) => ({ currency, minor })),
  };
}
