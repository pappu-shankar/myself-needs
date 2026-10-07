import { listAccountsWithBalances } from "../../db/queries/domain/accounts";
import { listHoldings } from "../../db/queries/domain/investments";
import { listEntities, listEntityStakes, getSelfEntity } from "../../db/queries/domain/entities";
import { allCashFlowsByHolding, allValuationsByHolding } from "../../db/queries/domain/net-worth";
import { listFxRatesAsOf } from "../../db/queries/config/fx-rates";
import { getBaseCurrency } from "../../db/queries/config/settings";
import { getHoldingValue, type HoldingLedgerSource } from "./investments";
import { aggregateToBase, weakestConfidence, type MoneyAggregate } from "../utility/aggregate";
import { stakeBpsAt, prorate, BPS_FULL } from "../utility/ownership";
import { convert } from "../utility/fx";
import { todayIso } from "@/lib/dates";
import { DomainError } from "@/modules/core/errors";
import type { Currency } from "../../db/schema/currency";
import type { ConfidenceLevel } from "../../db/schema/provenance";

/**
 * The several net worths.
 *
 * "Assets minus liabilities" is one sentence and more than one number: for
 * anyone with more than a salary account, the amount they could spend this week
 * and the amount they are economically exposed to differ by an order of
 * magnitude. ₹5 Cr of business equity must never read as equivalent to ₹5 Cr of
 * deposits — the deposits can pay a bill tomorrow, the equity cannot be sold in
 * part, has no quote, and is worth what a buyer eventually agrees. A single
 * headline summing them states a capacity to spend the user does not have, and
 * in a downturn it is the number that fails them.
 *
 * So the module computes every definition over the **same** consolidated
 * values and always labels which one is on screen. Because they share one
 * computation they reconcile: the difference between any two is a nameable set
 * of holdings, not an artefact of two code paths disagreeing.
 *
 * See docs/prd/finance/net-worth.md.
 */

export const NET_WORTH_SCOPES = [
  /** Everything the `Self` entity owns, unprorated — the headline figure. */
  "total",
  /** `liquid` assets only, less liabilities. What could be spent in days. */
  "liquid",
  /** Liquid plus `semi_liquid` financial assets. */
  "investable",
  /** All financial assets less financial liabilities; no property or vehicles. */
  "financial",
  /** Full entity rollup, each entity prorated by the user's stake. */
  "household",
  /** Household plus the prorated business and trust share, flagged illiquid. */
  "business_adjusted",
] as const;
export type NetWorthScope = (typeof NET_WORTH_SCOPES)[number];

/** Entity kinds that count as the household — a family's spendable position. */
const HOUSEHOLD_KINDS = new Set(["personal", "joint", "family_member"]);
/** Added only by `business_adjusted`, and flagged illiquid when it is. */
const BUSINESS_KINDS = new Set(["business", "trust"]);

/**
 * Holding types that are *financial* rather than real or personal-use.
 *
 * Deliberately a type list rather than a liquidity test: a private company
 * stake is financial and illiquid at once, and `financial` is about what kind
 * of thing it is while `liquid` is about how fast it sells.
 */
const NON_FINANCIAL_HOLDING_TYPES = new Set(["other_asset"]);

export interface NetWorthComponent {
  kind: "account" | "holding";
  id: number;
  name: string;
  entityId: number | null;
  currency: Currency;
  /** The entity's own figure, before any stake is applied. */
  minor: number;
  /** After the stake in force on the as-of date. Equals `minor` at 100%. */
  ownedMinor: number;
  ownershipBps: number;
  liquidity: "liquid" | "semi_liquid" | "illiquid";
  isLiability: boolean;
  isFinancial: boolean;
  confidence: ConfidenceLevel;
}

export interface NetWorthByScope {
  scope: NetWorthScope;
  value: MoneyAggregate;
  /**
   * The liquidity split of this scope's own figure, so the headline is never
   * shown without it. Illiquid wealth is separated, not footnoted.
   */
  liquidityMinor: Record<"liquid" | "semi_liquid" | "illiquid", number>;
  /** Every row that contributed, so the difference between two scopes is a
   * nameable set rather than an unexplained delta. */
  components: NetWorthComponent[];
}

export interface NetWorthView {
  asOf: string;
  baseCurrency: Currency;
  scopes: Record<NetWorthScope, NetWorthByScope>;
}

/**
 * Collect every account and holding once, with its entity, liquidity, kind and
 * the stake in force — the single pass every scope then filters.
 */
function collectComponents(asOf: string, selfEntityId: number): NetWorthComponent[] {
  const stakes = listEntityStakes();
  const preloaded: HoldingLedgerSource = {
    flowsByHolding: allCashFlowsByHolding(),
    valuationsByHolding: allValuationsByHolding(),
  };

  const components: NetWorthComponent[] = [];

  for (const account of listAccountsWithBalances(asOf, { includeArchived: true })) {
    if (account.excludeFromNetWorth) continue;
    const entityId = account.entityId ?? selfEntityId;
    const bps = stakeFor(stakes, entityId, selfEntityId, asOf);
    if (bps === null) continue;
    components.push({
      kind: "account",
      id: account.id,
      name: account.name,
      entityId,
      currency: account.currency,
      minor: account.balanceMinor,
      ownedMinor: prorate(account.balanceMinor, bps),
      ownershipBps: bps,
      liquidity: account.liquidity,
      isLiability: account.kind === "liability",
      // Every account is a financial instrument — a bank balance, a card, a
      // loan. Property and vehicles are recorded as holdings.
      isFinancial: true,
      confidence: account.confidence,
    });
  }

  for (const holding of listHoldings({ includeArchived: true })) {
    const value = getHoldingValue(holding, asOf, preloaded);
    const entityId = holding.entityId ?? selfEntityId;
    const bps = stakeFor(stakes, entityId, selfEntityId, asOf);
    if (bps === null) continue;
    components.push({
      kind: "holding",
      id: holding.id,
      name: holding.name,
      entityId,
      currency: value.currency,
      minor: value.currentValueMinor,
      ownedMinor: prorate(value.currentValueMinor, bps),
      ownershipBps: bps,
      liquidity: holding.liquidity,
      isLiability: false,
      isFinancial: !NON_FINANCIAL_HOLDING_TYPES.has(holding.type),
      confidence: value.confidence,
    });
  }

  return components;
}

/**
 * The user's stake in an entity on a date.
 *
 * The `Self` entity is owned outright and needs no stake row to say so — which
 * matters because migration 0027 seeded exactly one stake (Self in Self at
 * 10000 bps from the epoch sentinel) and a vault whose user never recorded a
 * family member has no others. An entity with no stake recorded returns null
 * and is left out rather than assumed to be wholly owned: silently counting an
 * unattributed business at 100% is how a stake nobody entered becomes wealth
 * the user does not have.
 */
function stakeFor(
  stakes: readonly ReturnType<typeof listEntityStakes>[number][],
  entityId: number,
  selfEntityId: number,
  asOf: string,
): number | null {
  if (entityId === selfEntityId) return BPS_FULL;
  return stakeBpsAt(stakes, entityId, asOf);
}

/** Which components a scope counts. */
function includedIn(
  scope: NetWorthScope,
  component: NetWorthComponent,
  entityKindById: ReadonlyMap<number, string>,
): boolean {
  const kind = component.entityId === null ? "personal" : entityKindById.get(component.entityId);

  switch (scope) {
    case "total":
      // The `Self` entity alone, at full value — the headline.
      return component.ownershipBps === BPS_FULL && kind === "personal";
    case "liquid":
      // Liquid assets, less *all* liabilities: a debt does not become less owed
      // because the asset backing it is slow to sell.
      return (
        component.ownershipBps === BPS_FULL &&
        kind === "personal" &&
        (component.isLiability || component.liquidity === "liquid")
      );
    case "investable":
      return (
        component.ownershipBps === BPS_FULL &&
        kind === "personal" &&
        component.isFinancial &&
        (component.isLiability || component.liquidity !== "illiquid")
      );
    case "financial":
      return component.ownershipBps === BPS_FULL && kind === "personal" && component.isFinancial;
    case "household":
      return kind !== undefined && HOUSEHOLD_KINDS.has(kind);
    case "business_adjusted":
      return kind !== undefined && (HOUSEHOLD_KINDS.has(kind) || BUSINESS_KINDS.has(kind));
  }
}

/**
 * Every net-worth definition as of a date.
 *
 * One pass over the ledger, then each scope is a filter over the same
 * components — which is what makes the definitions reconcile.
 */
export function getNetWorthByScope(asOfDate?: string): NetWorthView {
  const asOf = asOfDate ?? todayIso();
  const self = getSelfEntity();
  if (!self) {
    throw new DomainError("This vault has no entities yet, so net worth cannot be attributed.");
  }
  const baseCurrency = getBaseCurrency();
  const rates = listFxRatesAsOf(asOf);
  const entityKindById = new Map(
    listEntities({ includeArchived: true }).map((e) => [e.id, e.kind]),
  );
  const components = collectComponents(asOf, self.id);

  const scopes = {} as Record<NetWorthScope, NetWorthByScope>;
  for (const scope of NET_WORTH_SCOPES) {
    const included = components.filter((c) => includedIn(scope, c, entityKindById));

    // Consolidation order (decision 13): sum per (entity, currency) first,
    // prorate once per subtotal, convert, then sum. `ownedMinor` is already
    // prorated per component, so grouping by currency here and converting
    // after is the same order — the stake was applied before any conversion.
    const byCurrency = new Map<Currency, number>();
    const confidenceByCurrency = new Map<Currency, ConfidenceLevel[]>();
    const liquidityMinor = { liquid: 0, semi_liquid: 0, illiquid: 0 };

    for (const c of included) {
      byCurrency.set(c.currency, (byCurrency.get(c.currency) ?? 0) + c.ownedMinor);
      confidenceByCurrency.set(c.currency, [
        ...(confidenceByCurrency.get(c.currency) ?? []),
        c.confidence,
      ]);
      // A business share counted by `business_adjusted` is flagged illiquid
      // whatever the underlying rows say, because a prorated stake in a private
      // entity has no exit of its own — that is the whole reason the scope is
      // kept separate from `household`.
      const entityKind = c.entityId === null ? "personal" : entityKindById.get(c.entityId);
      const effective =
        scope === "business_adjusted" && entityKind !== undefined && BUSINESS_KINDS.has(entityKind)
          ? "illiquid"
          : c.liquidity;
      const base = converted(rates, c.ownedMinor, c.currency, baseCurrency, asOf);
      if (base !== null) liquidityMinor[effective] += base;
    }

    scopes[scope] = {
      scope,
      value: aggregateToBase(byCurrency, {
        baseCurrency,
        asOf,
        rates,
        confidenceByCurrency: new Map(
          [...confidenceByCurrency].map(([currency, levels]) => [
            currency,
            weakestConfidence(levels),
          ]),
        ),
      }),
      liquidityMinor,
      components: included,
    };
  }

  return { asOf, baseCurrency, scopes };
}

/** Convert for the liquidity split, which needs one currency to be a split at
 * all. Null when no rate resolves — the aggregate's own `complete` flag is
 * what tells the caller the split is short. */
function converted(
  rates: Parameters<typeof convert>[0],
  minor: number,
  from: Currency,
  to: Currency,
  asOf: string,
): number | null {
  if (from === to) return minor;
  return convert(rates, minor, from, to, asOf)?.minor ?? null;
}
