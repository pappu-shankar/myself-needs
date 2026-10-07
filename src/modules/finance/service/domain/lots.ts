import { divRound, toSafeNumber } from "../utility/integer-math";
import type { ConfidenceLevel } from "../../db/schema/provenance";

/**
 * Unit-based FIFO lot matching.
 *
 * The previous implementation matched a sale against its lots **by amount**:
 * proceeds were drawn down against cost until exhausted, and only proceeds
 * *beyond* the matched cost counted as gain. That model structurally cannot
 * produce a capital loss — a sale coming in below its cost basis simply
 * registered as a zero-gain event — which makes loss harvesting unrepresentable
 * and understates nothing while overstating taxable gains.
 *
 * This matches by **units**: a sale consumes units from the oldest purchase
 * lots, and the gain is the proceeds attributed to exactly those units minus
 * what those units cost. The result is signed, so a loss is a loss.
 *
 * Pure and database-free on purpose, so the arithmetic is testable over
 * fixtures without a vault. The caller supplies lots already restated into one
 * currency — this file does no conversion and knows nothing about FX.
 */

export interface PurchaseLot {
  /** Acquisition date — this is what decides long versus short term. */
  date: string;
  /** Units acquired, scaled by `UNITS_SCALE`. */
  unitsScaled: number;
  /** What those units cost in total, a positive minor-unit amount. */
  costMinor: number;
  confidence: ConfidenceLevel;
}

export interface Sale {
  date: string;
  /** Units sold, scaled by `UNITS_SCALE`. Positive. */
  unitsScaled: number;
  /** What was received in total, a positive minor-unit amount. */
  proceedsMinor: number;
  confidence: ConfidenceLevel;
}

export interface LotMatch {
  acquisitionDate: string;
  saleDate: string;
  /** Units drawn from this lot. */
  unitsScaled: number;
  /** Cost of exactly those units. */
  costBasisMinor: number;
  /** Proceeds attributed to exactly those units. */
  proceedsMinor: number;
  /** `proceedsMinor − costBasisMinor`. **Signed** — negative is a real loss. */
  gainMinor: number;
  /** Weakest confidence of the two flows the figure derives from. */
  confidence: ConfidenceLevel;
}

export interface MatchResult {
  matches: LotMatch[];
  /**
   * Units the sale claimed that no lot could supply.
   *
   * Reported rather than clamped: selling more units than were ever bought
   * means the recorded history is incomplete (a transfer in that was never
   * logged, say), and a silently clamped match would present a gain computed
   * from a cost basis that does not exist as if it were sound.
   */
  unmatchedUnitsScaled: number;
  /** Proceeds belonging to those unmatched units. */
  unmatchedProceedsMinor: number;
}

/** A lot with the part of it still unsold. */
interface OpenLot extends PurchaseLot {
  remainingUnitsScaled: number;
  remainingCostMinor: number;
}

function openLot(lot: PurchaseLot): OpenLot {
  return { ...lot, remainingUnitsScaled: lot.unitsScaled, remainingCostMinor: lot.costMinor };
}

const CONFIDENCE_ORDER: ConfidenceLevel[] = ["unknown", "estimated", "reported", "verified"];

function weaker(a: ConfidenceLevel, b: ConfidenceLevel): ConfidenceLevel {
  return CONFIDENCE_ORDER.indexOf(a) <= CONFIDENCE_ORDER.indexOf(b) ? a : b;
}

/**
 * Match one sale against the open lots, oldest first, mutating them.
 *
 * The cost taken from a partially sold lot is computed against what *remains*
 * of it, not against its original size. That is what keeps repeated partial
 * sales exact: when the last units of a lot go, `consumedUnits` equals
 * `remainingUnits`, so the consumed cost is exactly `remainingCostMinor` and
 * nothing is left behind. Apportioning against the original size instead would
 * leak a paisa per sale, and the leak compounds silently.
 */
export function matchSaleAgainstLots(lots: OpenLot[], sale: Sale): MatchResult {
  if (sale.unitsScaled <= 0) {
    return { matches: [], unmatchedUnitsScaled: 0, unmatchedProceedsMinor: 0 };
  }

  const consumed: { lot: OpenLot; unitsScaled: number; costBasisMinor: number }[] = [];
  let unitsToMatch = sale.unitsScaled;

  while (unitsToMatch > 0 && lots.length > 0) {
    const lot = lots[0];
    const units = Math.min(unitsToMatch, lot.remainingUnitsScaled);
    const costBasisMinor = toSafeNumber(
      divRound(BigInt(lot.remainingCostMinor) * BigInt(units), BigInt(lot.remainingUnitsScaled)),
      "matchSaleAgainstLots",
    );
    lot.remainingUnitsScaled -= units;
    lot.remainingCostMinor -= costBasisMinor;
    unitsToMatch -= units;
    consumed.push({ lot, unitsScaled: units, costBasisMinor });
    if (lot.remainingUnitsScaled <= 0) lots.shift();
  }

  // Proceeds are apportioned by units, on a running cumulative total so the
  // per-lot shares add back to the sale's proceeds exactly rather than losing a
  // paisa per lot to independent rounding.
  const matches: LotMatch[] = [];
  let cumulativeUnits = 0;
  let allocatedProceeds = 0;
  for (const part of consumed) {
    cumulativeUnits += part.unitsScaled;
    const throughHere = toSafeNumber(
      divRound(BigInt(sale.proceedsMinor) * BigInt(cumulativeUnits), BigInt(sale.unitsScaled)),
      "matchSaleAgainstLots",
    );
    const proceedsMinor = throughHere - allocatedProceeds;
    allocatedProceeds = throughHere;
    matches.push({
      acquisitionDate: part.lot.date,
      saleDate: sale.date,
      unitsScaled: part.unitsScaled,
      costBasisMinor: part.costBasisMinor,
      proceedsMinor,
      gainMinor: proceedsMinor - part.costBasisMinor,
      confidence: weaker(part.lot.confidence, sale.confidence),
    });
  }

  return {
    matches,
    unmatchedUnitsScaled: unitsToMatch,
    // Whatever share of the proceeds the matched units did not claim.
    unmatchedProceedsMinor: sale.proceedsMinor - allocatedProceeds,
  };
}

export interface LedgerEvent {
  date: string;
  /** Positive for a purchase, negative for a sale. Scaled by `UNITS_SCALE`. */
  unitsScaled: number;
  /** The absolute money moved, a positive minor-unit amount. */
  amountMinor: number;
  confidence: ConfidenceLevel;
  /** Only `redemption` consumes lots; a dividend or interest payment does not. */
  consumesLots: boolean;
}

/**
 * Walk a holding's whole history in date order, matching every sale.
 *
 * The full history is walked even when only one year's gains are wanted,
 * because an earlier sale consumes the earlier lots and therefore changes which
 * lot a later sale matches against. Filtering to a fiscal year happens *after*
 * matching, never before.
 */
export function matchHistory(events: readonly LedgerEvent[]): MatchResult {
  // Purchases before sales on the same date: a sale cannot consume units that
  // the same day's purchase supplied unless that purchase is already in the
  // queue, and treating same-day buys as available is the convention a
  // statement reads as.
  const sorted = [...events].sort(
    (a, b) => a.date.localeCompare(b.date) || b.unitsScaled - a.unitsScaled,
  );

  const lots: OpenLot[] = [];
  const matches: LotMatch[] = [];
  let unmatchedUnitsScaled = 0;
  let unmatchedProceedsMinor = 0;

  for (const event of sorted) {
    if (event.unitsScaled > 0) {
      lots.push(
        openLot({
          date: event.date,
          unitsScaled: event.unitsScaled,
          costMinor: event.amountMinor,
          confidence: event.confidence,
        }),
      );
      continue;
    }
    if (!event.consumesLots || event.unitsScaled === 0) continue;

    const result = matchSaleAgainstLots(lots, {
      date: event.date,
      unitsScaled: -event.unitsScaled,
      proceedsMinor: event.amountMinor,
      confidence: event.confidence,
    });
    matches.push(...result.matches);
    unmatchedUnitsScaled += result.unmatchedUnitsScaled;
    unmatchedProceedsMinor += result.unmatchedProceedsMinor;
  }

  return { matches, unmatchedUnitsScaled, unmatchedProceedsMinor };
}
