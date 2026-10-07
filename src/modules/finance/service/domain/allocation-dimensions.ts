import { listEntities, getSelfEntity } from "../../db/queries/domain/entities";
import { listFxRatesAsOf } from "../../db/queries/config/fx-rates";
import { getBaseCurrency } from "../../db/queries/config/settings";
import {
  collectComponents,
  includedIn,
  type NetWorthComponent,
  type NetWorthScope,
} from "./net-worth-scopes";
import { aggregateToBase, weakestConfidence, type MoneyAggregate } from "../utility/aggregate";
import { todayIso } from "@/lib/dates";
import { DomainError } from "@/modules/core/errors";
import type { Currency } from "../../db/schema/currency";
import type { ConfidenceLevel } from "../../db/schema/provenance";

/**
 * Allocation along every axis that matters.
 *
 * Computed from the same consolidated, prorated, converted components as net
 * worth, over the same entity scope, so the two always reconcile — each
 * dimension is a one-way grouping of one total, which is why every dimension
 * sums to the same figure.
 *
 * The replaced mapping collapsed everything into four coarse buckets and folded
 * debt funds into equity, because a mutual fund was a mutual fund. A liquid or
 * gilt fund is not equity exposure, and that mapping overstated equity weight
 * by exactly the debt-fund balance — in the one figure an investor uses to
 * decide whether they are over-exposed.
 *
 * See docs/prd/finance/allocation.md.
 */

export const ALLOCATION_DIMENSIONS = [
  "asset_class",
  "geography",
  "currency",
  "sector",
  "market_cap",
  "liquidity",
] as const;
export type AllocationDimension = (typeof ALLOCATION_DIMENSIONS)[number];

/**
 * The bucket every unclassified row falls into.
 *
 * Its own slice, deliberately — never folded into "home country", never
 * defaulted to equity. A wrong classification is worse than a missing one,
 * because only the missing one prompts anybody to fix it, and a chart that
 * silently drops the 60% of a portfolio nobody has tagged is worse still.
 */
export const UNCLASSIFIED = "unclassified";

export type AssetClass =
  "equity" | "debt" | "gold" | "cash" | "real_estate" | "private" | "other" | typeof UNCLASSIFIED;

/** Account types that are cash for allocation purposes. */
const CASH_ACCOUNT_TYPES = new Set(["checking", "savings", "cash", "investment"]);

/**
 * Asset class for one component.
 *
 * A fund reads its own `fund_category` and is **unclassified** without one —
 * that is the whole point of the column. Everything else maps from its type,
 * where the type genuinely determines the class.
 */
function assetClassOf(c: NetWorthComponent): AssetClass {
  if (c.kind === "account") {
    if (c.isLiability) return "debt";
    if (CASH_ACCOUNT_TYPES.has(c.type)) return "cash";
    if (c.type === "receivable") return "other";
    return "cash";
  }

  switch (c.type) {
    case "mutual_fund_domestic":
    case "mutual_fund_intl":
      // No category recorded → unclassified. Defaulting to equity is the bug.
      if (c.fundCategory === null) return UNCLASSIFIED;
      return c.fundCategory === "commodity" ? "gold" : (c.fundCategory as AssetClass);
    case "equity":
    case "intl_equity":
      return "equity";
    case "bond":
    case "fd":
    case "rd":
    case "chit_fund":
    case "govt_scheme":
      return "debt";
    case "gold":
      return "gold";
    case "other_asset":
      // Deliberately not guessed at: "other asset" covers jewellery, art, a
      // private stake and a second flat, and they are different exposures.
      return c.fundCategory === null ? UNCLASSIFIED : (c.fundCategory as AssetClass);
    default:
      return "other";
  }
}

/** The bucket a component falls into on one dimension. */
function bucketOf(dimension: AllocationDimension, c: NetWorthComponent): string {
  switch (dimension) {
    case "asset_class":
      return assetClassOf(c);
    case "geography":
      return c.country ?? UNCLASSIFIED;
    case "currency":
      // Exposure before conversion, so a rupee view of dollar assets is
      // visible — this is the one dimension whose buckets are not a guess.
      return c.currency;
    case "sector":
      // Equity only; a bond has no sector, and bucketing it as unclassified
      // would make the sector chart mostly noise.
      return assetClassOf(c) === "equity" ? (c.sector ?? UNCLASSIFIED) : UNCLASSIFIED;
    case "market_cap":
      return assetClassOf(c) === "equity" ? (c.marketCapBand ?? UNCLASSIFIED) : UNCLASSIFIED;
    case "liquidity":
      return c.liquidity;
  }
}

export interface AllocationSlice {
  bucket: string;
  value: MoneyAggregate;
  /** Share of the dimension's total, 0–1. Null when the total could not be
   * fully converted: a share of an unknown whole is not a share. */
  share: number | null;
  /** True for the bucket holding everything the user has not tagged. */
  unclassified: boolean;
}

export interface AllocationDimensionView {
  dimension: AllocationDimension;
  slices: AllocationSlice[];
  /** The denominator every share was computed against, carrying its rates. */
  total: MoneyAggregate;
  /**
   * How much of the total sits in the unclassified bucket, as a share. The
   * number a caller should lead with when it is large: a sector chart over a
   * portfolio that is 70% untagged is not a sector chart.
   */
  unclassifiedShare: number | null;
}

export interface AllocationView {
  asOf: string;
  baseCurrency: Currency;
  scope: NetWorthScope;
  dimensions: Record<AllocationDimension, AllocationDimensionView>;
}

function aggregateOf(
  components: readonly NetWorthComponent[],
  basis: { baseCurrency: Currency; asOf: string; rates: ReturnType<typeof listFxRatesAsOf> },
): MoneyAggregate {
  const byCurrency = new Map<Currency, number>();
  const levels = new Map<Currency, ConfidenceLevel[]>();
  for (const c of components) {
    byCurrency.set(c.currency, (byCurrency.get(c.currency) ?? 0) + c.ownedMinor);
    levels.set(c.currency, [...(levels.get(c.currency) ?? []), c.confidence]);
  }
  return aggregateToBase(byCurrency, {
    ...basis,
    confidenceByCurrency: new Map(
      [...levels].map(([currency, list]) => [currency, weakestConfidence(list)]),
    ),
  });
}

/**
 * Allocation across every dimension, for one net-worth scope.
 *
 * Defaults to the `total` scope so the figures match the headline net worth.
 * Pass another scope to see the household's or the business-adjusted mix — the
 * dimension totals then match that scope's net worth instead, which is the
 * property that makes the two views reconcile.
 */
export function getAllocationByDimension(
  scope: NetWorthScope = "total",
  asOfDate?: string,
): AllocationView {
  const asOf = asOfDate ?? todayIso();
  const self = getSelfEntity();
  if (!self) {
    throw new DomainError("This vault has no entities yet, so allocation cannot be attributed.");
  }
  const baseCurrency = getBaseCurrency();
  const basis = { baseCurrency, asOf, rates: listFxRatesAsOf(asOf) };
  const entityKindById = new Map(
    listEntities({ includeArchived: true }).map((e) => [e.id, e.kind]),
  );

  const components = collectComponents(asOf, self.id).filter((c) =>
    includedIn(scope, c, entityKindById),
  );
  const total = aggregateOf(components, basis);

  const dimensions = {} as Record<AllocationDimension, AllocationDimensionView>;
  for (const dimension of ALLOCATION_DIMENSIONS) {
    const grouped = new Map<string, NetWorthComponent[]>();
    for (const c of components) {
      const bucket = bucketOf(dimension, c);
      const existing = grouped.get(bucket);
      if (existing) existing.push(c);
      else grouped.set(bucket, [c]);
    }

    // A share needs a whole denominator. Withheld rather than computed against
    // a short one, which would read as a confident mix of a portfolio the app
    // could not fully value.
    const canShare = total.complete && total.baseMinor !== 0;

    const slices = [...grouped.entries()]
      .map(([bucket, rows]) => {
        const value = aggregateOf(rows, basis);
        return {
          bucket,
          value,
          share: canShare ? value.baseMinor / total.baseMinor : null,
          unclassified: bucket === UNCLASSIFIED,
        };
      })
      // Largest first, with the unclassified bucket last whatever its size —
      // it is a gap in the data, not a position, and reading it as the top
      // holding would be a category error.
      .sort((a, b) => {
        if (a.unclassified !== b.unclassified) return a.unclassified ? 1 : -1;
        return b.value.baseMinor - a.value.baseMinor;
      });

    dimensions[dimension] = {
      dimension,
      slices,
      total,
      unclassifiedShare: canShare
        ? (slices.find((s) => s.unclassified)?.value.baseMinor ?? 0) / total.baseMinor
        : null,
    };
  }

  return { asOf, baseCurrency, scope, dimensions };
}

/**
 * A cross-tab of two dimensions — asset class × geography, say.
 *
 * Supported because no dimension is derived from another, so the pairing is
 * meaningful rather than a restatement.
 */
export interface CrossTabCell {
  rowBucket: string;
  columnBucket: string;
  value: MoneyAggregate;
}

export function getAllocationCrossTab(
  rowDimension: AllocationDimension,
  columnDimension: AllocationDimension,
  scope: NetWorthScope = "total",
  asOfDate?: string,
): { cells: CrossTabCell[]; total: MoneyAggregate } {
  const asOf = asOfDate ?? todayIso();
  const self = getSelfEntity();
  if (!self) {
    throw new DomainError("This vault has no entities yet, so allocation cannot be attributed.");
  }
  const baseCurrency = getBaseCurrency();
  const basis = { baseCurrency, asOf, rates: listFxRatesAsOf(asOf) };
  const entityKindById = new Map(
    listEntities({ includeArchived: true }).map((e) => [e.id, e.kind]),
  );
  const components = collectComponents(asOf, self.id).filter((c) =>
    includedIn(scope, c, entityKindById),
  );

  const grouped = new Map<string, NetWorthComponent[]>();
  for (const c of components) {
    const key = `${bucketOf(rowDimension, c)}\u0000${bucketOf(columnDimension, c)}`;
    const existing = grouped.get(key);
    if (existing) existing.push(c);
    else grouped.set(key, [c]);
  }

  return {
    cells: [...grouped.entries()].map(([key, rows]) => {
      const [rowBucket, columnBucket] = key.split("\u0000");
      return { rowBucket, columnBucket, value: aggregateOf(rows, basis) };
    }),
    total: aggregateOf(components, basis),
  };
}
