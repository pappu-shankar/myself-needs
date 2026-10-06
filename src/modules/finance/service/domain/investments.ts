import {
  getCashFlowById,
  getHoldingById,
  getLatestValuation,
  insertCashFlow,
  insertHolding,
  upsertValuation,
  listCashFlowsForHolding,
  listHoldings,
  listHoldingsByGoalId,
  listValuationsForHolding,
  markCashFlowVoided,
  setCashFlowSupersededBy,
  type NewCashFlow,
  type NewHolding,
  type NewValuation,
} from "../../db/queries/domain/investments";
import type { Currency } from "../../db/schema/currency";
import type { ConfidenceLevel } from "../../db/schema/provenance";
import {
  UNIT_PRICED_TYPES,
  ACCRUAL_TYPES,
  type CashFlowType,
  type InvestmentType,
} from "../../types";
import { weakestConfidence } from "../utility/aggregate";
import { divRound, toSafeNumber } from "../utility/integer-math";
import { mutualFundNavProvider } from "../utility/price-providers/mutual-fund-nav";
import { computeXirr, type CashFlowInput } from "../utility/returns";
import { applyRateBps, fromUnitsScaled, valueOfUnits } from "../utility/units";
import { daysBetween, todayIso } from "@/lib/dates";
import { DomainError } from "@/modules/core/errors";
import { getDb } from "@/modules/core/db/client";

export function createHolding(entry: NewHolding) {
  return insertHolding(entry);
}

export function getHolding(id: number) {
  return getHoldingById(id) ?? null;
}

/**
 * Low-level insert with the amount already signed per the ledger convention
 * (negative = money in/contributed, positive = money out/received). User input
 * goes through `recordCashFlow`, which derives the sign from the flow type.
 */
export function createCashFlow(entry: NewCashFlow) {
  return insertCashFlow(entry);
}

export function getCashFlowsForHolding(holdingId: number) {
  return listCashFlowsForHolding(holdingId);
}

/** Records the price for a day; a second price for the same holding and day replaces the first. */
export function createValuation(entry: NewValuation) {
  return upsertValuation(entry);
}

export function getValuationsForHolding(holdingId: number) {
  return listValuationsForHolding(holdingId);
}

// ---------------------------------------------------------------------------
// Recording cash flows from user input
// ---------------------------------------------------------------------------

/** Flow types that put money into the holding — stored negative. Everything else is money received — stored positive. */
const MONEY_IN_FLOWS = new Set<CashFlowType>(["contribution"]);

/** Flow types that change a unit-priced holding's unit count, and in which direction. */
const UNIT_DIRECTION: Partial<Record<CashFlowType, 1 | -1>> = {
  contribution: 1,
  redemption: -1,
  maturity: -1,
};

/** The stored ledger sign for a positive amount the user typed, in minor units. */
export function signedAmountMinor(flowType: CashFlowType, amountMinor: number): number {
  const magnitude = Math.abs(amountMinor);
  return MONEY_IN_FLOWS.has(flowType) ? -magnitude : magnitude;
}

export interface CashFlowInputFromUser {
  holdingId: number;
  date: string;
  flowType: CashFlowType;
  /** Always positive, in the holding's currency's minor units — the sign is derived from `flowType`. */
  amountMinor: number;
  /** Always positive, scaled by `UNITS_SCALE` — the direction is derived from `flowType`. Required for buys/sells of unit-priced holdings. */
  unitsScaled?: number;
}

/**
 * Records a cash flow the user entered: they type positive numbers, and the
 * stored signs come from the flow type, so an 80C total, FIFO gains or XIRR
 * can never be broken by a wrongly-typed minus sign.
 *
 * The currency is taken from the holding rather than from the input: a flow in
 * a currency the holding is not denominated in cannot be valued (see
 * `missing: "currency"`), so there is no way to enter one here.
 */
export function recordCashFlow(input: CashFlowInputFromUser) {
  const holding = getHoldingById(input.holdingId);
  if (!holding) throw new DomainError("Holding not found");
  if (!(input.amountMinor > 0)) throw new DomainError("Amount must be more than zero");

  const direction = UNIT_DIRECTION[input.flowType];
  let unitsScaled: number | null = null;

  if (UNIT_PRICED_TYPES.has(holding.type) && direction) {
    if (input.unitsScaled === undefined || !(input.unitsScaled > 0)) {
      throw new DomainError(
        input.flowType === "contribution"
          ? "Enter how many units this bought"
          : "Enter how many units this sold or redeemed",
      );
    }
    unitsScaled = direction * input.unitsScaled;

    if (direction < 0) {
      const held = unitsHeldScaled(holding, listCashFlowsForHolding(holding.id, input.date));
      // Exact integer comparison: units are scaled integers now, so the old
      // float epsilon that let a hair-over sell through is gone.
      if (held !== null && input.unitsScaled > held) {
        throw new DomainError(`Only ${formatUnits(held)} units were held on ${input.date}`);
      }
    }
  }

  return insertCashFlow({
    holdingId: input.holdingId,
    date: input.date,
    flowType: input.flowType,
    amountMinor: signedAmountMinor(input.flowType, input.amountMinor),
    currency: holding.currency,
    unitsScaled,
  });
}

// ---------------------------------------------------------------------------
// Valuation
// ---------------------------------------------------------------------------

function formatUnits(unitsScaled: number) {
  return fromUnitsScaled(unitsScaled).toLocaleString("en-IN", { maximumFractionDigits: 4 });
}

type LedgerFlow = {
  date: string;
  amountMinor: number;
  currency: Currency;
  flowType: CashFlowType;
  unitsScaled: number | null;
};

/**
 * Units held (scaled by `UNITS_SCALE`), given the flows up to the date of
 * interest.
 *
 * - Flows carry their own unit deltas (buys +, sells −). The holding's legacy
 *   `units_scaled` column, when set, is an opening balance that predates
 *   per-flow units — it is added on top so an older holding keeps its value
 *   while new buys and sells adjust it.
 * - A holding with neither returns `null` (unknown) — never an implied 1 unit.
 */
function unitsHeldScaled(
  holding: { unitsScaled: number | null },
  flows: LedgerFlow[],
): number | null {
  const flowUnits = flows.filter((f) => f.unitsScaled !== null);
  if (holding.unitsScaled === null && flowUnits.length === 0) return null;
  return flowUnits.reduce((sum, f) => sum + (f.unitsScaled ?? 0), holding.unitsScaled ?? 0);
}

/** Interest for a part-year stub: `principal × rateBps × days ÷ (10000 × 365.25)`
 * in one rounding. Rounding the stub down to whole basis points first would
 * zero out a short stub entirely on a small deposit. Days are scaled by 100
 * because the year basis is fractional. */
const DAYS_PER_YEAR = 365.25;
const STUB_DENOMINATOR = BigInt(10_000 * 36_525);

/**
 * Compounds `principalMinor` from `fromDate` to `toDate` at `rateBps`,
 * annually compounded — an estimate, not a bank-exact accrual.
 *
 * Done as whole-year compounding plus a simple pro-rata stub, entirely in
 * integers, rather than `principal × (1+r)^years` in floats. Same figure for
 * a whole number of years (₹10,000 at 10% for 4 years is exactly ₹14,641),
 * and the part-year tail now lands on a whole paisa instead of drifting — an
 * FD's accrued value is a number the user reconciles against a bank page, so
 * it has to be reproducible rather than merely close.
 */
function accrueMinor(
  principalMinor: number,
  rateBps: number,
  fromDate: string,
  toDate: string,
): number {
  const days = daysBetween(fromDate, toDate);
  if (days <= 0) return principalMinor;

  const wholeYears = Math.floor(days / DAYS_PER_YEAR);
  let valueMinor = principalMinor;
  for (let year = 0; year < wholeYears; year += 1) {
    valueMinor += applyRateBps(valueMinor, rateBps);
  }

  const stubDays = days - wholeYears * DAYS_PER_YEAR;
  if (stubDays <= 0) return valueMinor;
  const stubInterest = toSafeNumber(
    divRound(
      BigInt(valueMinor) * BigInt(rateBps) * BigInt(Math.round(stubDays * 100)),
      STUB_DENOMINATOR,
    ),
    "accrueMinor",
  );
  return valueMinor + stubInterest;
}

/** Each contribution accrues on its own from its date until `untilDate` — correct for both a lump-sum FD and a drip of RD installments. */
function computeAccrualValueMinor(
  cashFlows: { date: string; amountMinor: number }[],
  rateBps: number,
  untilDate: string,
): number {
  const grown = cashFlows
    .filter((cf) => cf.amountMinor < 0)
    .reduce((sum, cf) => sum + accrueMinor(-cf.amountMinor, rateBps, cf.date, untilDate), 0);
  const paidOut = cashFlows
    .filter((cf) => cf.amountMinor > 0)
    .reduce((sum, cf) => sum + cf.amountMinor, 0);
  return Math.max(0, grown - paidOut);
}

/** Total contributed minus total received so far — not a market valuation, just where the cash currently stands. */
function computeNetInvestedMinor(cashFlows: { amountMinor: number }[]): number {
  return cashFlows.reduce((sum, cf) => sum - cf.amountMinor, 0);
}

/**
 * Government schemes (PPF, EPF, NSC, SSY, …) have no market price, so their
 * value is the scheme balance kept from the ledger:
 *
 *   contributions + `interest` credited − redemptions/withdrawals − maturity payout
 *
 * An `interest` flow on a govt scheme means interest *credited into* the
 * scheme (it compounds there — PPF/EPF/SSY), so it raises the balance. Interest
 * actually paid out to you (e.g. SCSS/POMIS quarterly payouts) is logged as
 * `dividend` ("interest paid out"): income received, balance unchanged.
 * See `xirrFlows` for the matching return treatment.
 */
function computeSchemeBalanceMinor(
  cashFlows: { amountMinor: number; flowType: CashFlowType }[],
): number {
  let balanceMinor = 0;
  for (const cf of cashFlows) {
    if (cf.flowType === "contribution") balanceMinor += -cf.amountMinor;
    else if (cf.flowType === "interest") balanceMinor += Math.abs(cf.amountMinor);
    else if (cf.flowType === "redemption" || cf.flowType === "maturity")
      balanceMinor -= cf.amountMinor;
    // `dividend`: paid out to the holder — doesn't change the scheme balance.
  }
  return Math.max(0, balanceMinor);
}

export interface HoldingValue {
  /**
   * Value counted in totals, in `currency`'s minor units. When the value can't
   * be known (`missing` is set) this is 0 so totals stay summable — show
   * `missing` instead of the number.
   */
  currentValueMinor: number;
  /**
   * The currency `currentValueMinor` is denominated in. For a unit-priced
   * holding this is the *price's* currency, because `units × price` is
   * denominated in whatever the price was quoted in; for everything else it is
   * the holding's own currency.
   */
  currency: Currency;
  /** How `currentValueMinor` was derived — the UI labels accrual/balance/net differently from a market valuation. */
  basis: "valuation" | "accrual" | "balance" | "net_invested";
  /** Market price date for unit-priced holdings, otherwise the date valued at (maturity date once matured). */
  asOfDate: string | null;
  /** Units held as of the valuation date, scaled by `UNITS_SCALE` — unit-priced types only, null when unknown. */
  unitsScaled: number | null;
  /**
   * Why the value is unknown: `units` — a unit-priced holding with no units
   * recorded anywhere ("Add units"); `price` — no valuation recorded yet;
   * `currency` — the ledger holds flows in a currency the holding is not
   * denominated in, and summing them would be the cross-currency add the
   * currency column exists to prevent. The user fixes the flow's currency.
   */
  missing: "units" | "price" | "currency" | null;
  /** FD/RD past its maturity date with no payout recorded — valued at maturity; "Matured on … — record the payout". */
  maturedOn: string | null;
  /** Fully paid out/redeemed — worth 0 and stays that way. */
  closed: boolean;
  /**
   * How much the figure can be trusted (decision 19). A market valuation
   * carries the valuation row's own provenance; a compounded accrual or a
   * net-invested fallback is `estimated` by construction, however exact the
   * arithmetic behind it is; an unknown value is `unknown`.
   */
  confidence: ConfidenceLevel;
}

export type ValuableHolding = {
  id: number;
  type: InvestmentType;
  currency: Currency;
  unitsScaled: number | null;
  rateBps: number | null;
  maturityDate?: string | null;
};

/**
 * `currentValueMinor` per docs/prd/finance/investments.md's per-type table.
 * `asOfDate` (YYYY-MM-DD), when given, computes the value as it stood on that
 * date instead of today — used for net-worth history.
 *
 * - Unit-priced: units held on the date (sum of flow units, see
 *   `unitsHeldScaled`) × latest price on/before the date, as one exact integer
 *   product (`valueOfUnits`).
 * - FD/RD: compounded accrual from `rate_bps`, capped at `maturity_date`.
 *   Past maturity with a payout/redemption recorded → closed (0); past
 *   maturity without one → maturity value, flagged `maturedOn`. A `maturity`
 *   flow at any point (e.g. premature closure) also closes it.
 * - Govt schemes: ledger balance with credited interest (`computeSchemeBalanceMinor`).
 * - Chit funds: net cash flow to date.
 */
export function getHoldingValue(holding: ValuableHolding, asOfDate?: string): HoldingValue {
  const effectiveDate = asOfDate ?? todayIso();
  const cashFlows = listCashFlowsForHolding(holding.id, asOfDate);
  const base = {
    unitsScaled: null,
    missing: null,
    maturedOn: null,
    closed: false,
    currency: holding.currency,
  } as const;

  if (UNIT_PRICED_TYPES.has(holding.type)) {
    const unitsScaled = unitsHeldScaled(holding, cashFlows);
    const latest = getLatestValuation(holding.id, asOfDate);
    const priceDate = latest?.date ?? null;
    if (unitsScaled === null) {
      return {
        ...base,
        currentValueMinor: 0,
        basis: "valuation",
        asOfDate: priceDate,
        missing: "units",
        confidence: "unknown",
      };
    }
    if (unitsScaled <= 0 && cashFlows.length > 0) {
      return {
        ...base,
        currentValueMinor: 0,
        basis: "valuation",
        asOfDate: priceDate,
        unitsScaled: 0,
        closed: true,
        confidence: "reported",
      };
    }
    if (!latest) {
      return {
        ...base,
        currentValueMinor: 0,
        basis: "valuation",
        asOfDate: null,
        unitsScaled,
        missing: "price",
        confidence: "unknown",
      };
    }
    return {
      ...base,
      currentValueMinor: valueOfUnits(unitsScaled, latest.priceScaled, latest.priceCurrency),
      currency: latest.priceCurrency,
      basis: "valuation",
      asOfDate: latest.date,
      unitsScaled,
      confidence: latest.confidence,
    };
  }

  // Every remaining basis sums flow *amounts*, so a flow denominated in
  // another currency cannot be folded in — and must not be dropped silently.
  const basisForType = ACCRUAL_TYPES.has(holding.type)
    ? "accrual"
    : holding.type === "govt_scheme"
      ? "balance"
      : "net_invested";
  if (cashFlows.some((cf) => cf.currency !== holding.currency)) {
    return {
      ...base,
      currentValueMinor: 0,
      basis: basisForType,
      asOfDate: effectiveDate,
      missing: "currency",
      confidence: "unknown",
    };
  }

  if (ACCRUAL_TYPES.has(holding.type)) {
    const rateBps = holding.rateBps ?? 0;
    const maturity = holding.maturityDate ?? null;
    const isMatured = maturity !== null && effectiveDate >= maturity;
    const hasMaturityFlow = cashFlows.some((cf) => cf.flowType === "maturity");
    const hasPayoutAfterMaturity =
      isMatured && cashFlows.some((cf) => cf.flowType === "redemption");

    if (hasMaturityFlow || hasPayoutAfterMaturity) {
      return {
        ...base,
        currentValueMinor: 0,
        basis: "accrual",
        asOfDate: effectiveDate,
        closed: true,
        confidence: "reported",
      };
    }
    if (isMatured) {
      return {
        ...base,
        currentValueMinor: computeAccrualValueMinor(cashFlows, rateBps, maturity),
        basis: "accrual",
        asOfDate: maturity,
        maturedOn: maturity,
        confidence: "estimated",
      };
    }
    return {
      ...base,
      currentValueMinor: computeAccrualValueMinor(cashFlows, rateBps, effectiveDate),
      basis: "accrual",
      asOfDate: effectiveDate,
      confidence: "estimated",
    };
  }

  if (holding.type === "govt_scheme") {
    return {
      ...base,
      currentValueMinor: computeSchemeBalanceMinor(cashFlows),
      basis: "balance",
      asOfDate: effectiveDate,
      // Every component is a flow the user reported; nothing is modelled.
      confidence: "reported",
    };
  }

  return {
    ...base,
    currentValueMinor: computeNetInvestedMinor(cashFlows),
    basis: "net_invested",
    asOfDate: effectiveDate,
    // Cash in minus cash out is a floor on the value, not the value.
    confidence: "estimated",
  };
}

export interface HoldingsTotal {
  /** Per-currency subtotals — never one number, since holdings can be priced
   * in different currencies and the rate belongs to the caller's as-of date. */
  byCurrency: Map<Currency, number>;
  /** Weakest confidence among the holdings contributing to each currency,
   * ready to hand to `aggregateToBase`. */
  confidenceByCurrency: Map<Currency, ConfidenceLevel>;
}

/**
 * Value of every holding as of `asOfDate`, per currency — used for net-worth
 * history. Unknown values count as 0 (and carry their `unknown` confidence
 * into the currency they would have landed in, so an incomplete total still
 * says so).
 */
export function getHoldingsTotalByCurrency(asOfDate: string): HoldingsTotal {
  const byCurrency = new Map<Currency, number>();
  const levels = new Map<Currency, ConfidenceLevel[]>();

  for (const holding of listHoldings()) {
    const value = getHoldingValue(holding, asOfDate);
    byCurrency.set(value.currency, (byCurrency.get(value.currency) ?? 0) + value.currentValueMinor);
    levels.set(value.currency, [...(levels.get(value.currency) ?? []), value.confidence]);
  }

  return {
    byCurrency,
    confidenceByCurrency: new Map(
      [...levels].map(([currency, list]) => [currency, weakestConfidence(list)]),
    ),
  };
}

/**
 * The cash flows that are real money movements for XIRR. A govt scheme's
 * credited `interest` stays inside the scheme (it's already in the balance
 * used as the terminal value), so counting it as received would double it.
 */
function xirrFlows(type: InvestmentType, flows: LedgerFlow[]): CashFlowInput[] {
  return flows
    .filter((cf) => !(type === "govt_scheme" && cf.flowType === "interest"))
    .map((cf) => ({ amountMinor: cf.amountMinor, date: cf.date }));
}

function withValueAndXirr<T extends ValuableHolding>(holdings: T[]) {
  const today = todayIso();
  return holdings.map((holding) => {
    const value = getHoldingValue(holding);
    const cashFlows = listCashFlowsForHolding(holding.id);
    // No value → no return: "—", not −100%.
    const xirr =
      value.missing !== null
        ? null
        : computeXirr(xirrFlows(holding.type, cashFlows), value.currentValueMinor, today);
    return { ...holding, ...value, xirr };
  });
}

export function getHoldingsWithValue() {
  return withValueAndXirr(listHoldings());
}

/** For a goal's detail composition at the app layer — see docs/prd/finance/goal-linked-investments.md. */
export function getHoldingsByGoalId(goalId: number) {
  return withValueAndXirr(listHoldingsByGoalId(goalId));
}

/**
 * XIRR of every cash flow across every holding plus total current value as
 * a final "as of today" inflow — "computed uniformly... at any level" per
 * docs/prd/finance/returns-analytics.md. Holdings whose value is unknown are
 * left out entirely (their contributions with no value would read as a loss).
 *
 * One rate **per currency**, not one overall: a rate is the solution to a sum
 * of discounted amounts, so pooling rupee and dollar flows into one solve is
 * the cross-currency add in disguise — and converting a decade of flows at
 * their own dates would make the headline return depend on FX history the user
 * never asked about. The UI shows the base currency's rate, with the others
 * listed beside it.
 */
export function getPortfolioXirrByCurrency(): Map<Currency, number | null> {
  const today = todayIso();
  const totals = new Map<Currency, number>();
  const flows = new Map<Currency, CashFlowInput[]>();

  for (const holding of listHoldings()) {
    const value = getHoldingValue(holding);
    if (value.missing !== null) continue;
    totals.set(value.currency, (totals.get(value.currency) ?? 0) + value.currentValueMinor);
    flows.set(value.currency, [
      ...(flows.get(value.currency) ?? []),
      ...xirrFlows(holding.type, listCashFlowsForHolding(holding.id)),
    ]);
  }

  return new Map(
    [...totals].map(([currency, totalMinor]) => [
      currency,
      computeXirr(flows.get(currency) ?? [], totalMinor, today),
    ]),
  );
}

/** Fetches the latest NAV for a domestic mutual fund holding and records it as that day's valuation. Manual click only — see price-providers/mutual-fund-nav.ts. */
export async function refreshMutualFundNav(holdingId: number) {
  const holding = getHoldingById(holdingId);
  if (!holding) throw new DomainError("Holding not found");
  if (holding.type !== "mutual_fund_domestic")
    throw new DomainError("NAV refresh is only available for domestic mutual funds");
  if (!holding.externalCode) throw new DomainError("This holding has no AMFI scheme code set");

  const quote = await mutualFundNavProvider.fetchLatestPrice(holding.externalCode);
  // AMFI NAVs are published in rupees. Storing one against a holding the user
  // has marked as denominated in something else would quietly value it at the
  // wrong scale, so it is refused rather than converted — no rate is invented.
  if (quote.currency !== holding.currency) {
    throw new DomainError(
      `This holding is in ${holding.currency}, but its NAV is published in ${quote.currency}`,
    );
  }

  return upsertValuation({
    holdingId,
    date: quote.date,
    priceScaled: quote.priceScaled,
    priceCurrency: quote.currency,
    source: "market",
    method: "api_quote",
    // The feed republishes AMFI's own figure, so it is better than a typed
    // price — but nothing here has reconciled it against a statement.
    confidence: "reported",
    asOf: quote.date,
  });
}

/**
 * The currency a holding is denominated in — for the action layer, so a typed
 * amount converts with the holding's exponent rather than an assumed two
 * decimals. Same reasoning as `getAccountCurrency`.
 */
export function getHoldingCurrency(holdingId: number): Currency {
  const holding = getHoldingById(holdingId);
  if (!holding) throw new DomainError("Holding not found");
  return holding.currency;
}

// ---------------------------------------------------------------------------
// Void and correct a cash flow (decision 17: ledger rows are immutable)
// ---------------------------------------------------------------------------

/**
 * Without a stated reason a reversed flow is just a gap in a return series
 * nobody can account for later, so the reason is enforced in the service and
 * not only in the form schema.
 */
function requireFlowReason(reason: string): string {
  const trimmed = reason.trim();
  if (trimmed === "") throw new DomainError("Say why this cash flow is being reversed.");
  return trimmed;
}

/** The flow, voided or not — for a detail view and for the correction trail. */
export function getCashFlow(id: number) {
  return getCashFlowById(id) ?? null;
}

export interface CashFlowCorrectionTrail {
  row: NonNullable<ReturnType<typeof getCashFlowById>>;
  /** Set when the flow was corrected rather than only reversed. */
  replacement: NonNullable<ReturnType<typeof getCashFlowById>> | null;
}

/** A flow together with whatever replaced it, so the trail reads forward from
 * the mistake to the fix in one call. */
export function getCashFlowCorrectionTrail(id: number): CashFlowCorrectionTrail | null {
  const row = getCashFlowById(id);
  if (!row) return null;
  const replacement =
    row.supersededById === null ? null : (getCashFlowById(row.supersededById) ?? null);
  return { row, replacement };
}

/**
 * Reverses a cash flow that should not have been recorded. Every return and
 * valuation path already excludes voided flows, so XIRR, the FIFO cost basis
 * and the units held all move back together rather than one of them lagging.
 */
export function voidCashFlow(id: number, reason: string) {
  const stated = requireFlowReason(reason);
  const existing = getCashFlowById(id);
  if (!existing) throw new DomainError("That cash flow no longer exists.");
  if (existing.voidedAt !== null)
    throw new DomainError("That cash flow has already been reversed.");
  const voided = markCashFlowVoided(id, todayIso(), stated);
  // Lost the race against a concurrent void: the first reason stands.
  if (!voided) throw new DomainError("That cash flow has already been reversed.");
  return voided;
}

export interface CashFlowCorrection {
  voided: NonNullable<ReturnType<typeof markCashFlowVoided>>;
  replacement: ReturnType<typeof insertCashFlow>;
}

/**
 * Corrects a cash flow: voids the original and records `replacement` in its
 * place, with the voided row pointing forward at the new one.
 *
 * The replacement goes through `recordCashFlow`, so the sign still comes from
 * the flow type, the currency still comes from the holding, and a sell is
 * still checked against the units actually held — a correction cannot bypass a
 * rule a fresh entry would have hit. Because the void lands first inside the
 * same DB transaction, that units check sees the corrected world: redeeming
 * the units the voided flow had claimed is allowed again.
 *
 * `replacement` is a user-level input with no id of its own, so there is no
 * way for a correction to point at itself, and `getCashFlowById` is scoped to
 * the caller's vault, so there is no way for it to point into another.
 */
export function correctCashFlow(
  id: number,
  replacement: CashFlowInputFromUser,
  reason: string,
): CashFlowCorrection {
  const stated = requireFlowReason(reason);
  const original = getCashFlowById(id);
  if (!original) throw new DomainError("That cash flow no longer exists.");
  if (original.supersededById !== null) {
    throw new DomainError(
      "That cash flow has already been corrected. Correct its replacement instead, so the trail stays one chain.",
    );
  }
  if (original.voidedAt !== null) {
    throw new DomainError("That cash flow was already reversed, so there is nothing to correct.");
  }

  return getDb().transaction(() => {
    const voided = markCashFlowVoided(id, todayIso(), stated);
    if (!voided) throw new DomainError("That cash flow has already been reversed.");
    const created = recordCashFlow(replacement);
    const linked = setCashFlowSupersededBy(id, created.id);
    if (!linked) throw new DomainError("That cash flow has already been corrected.");
    return { voided: linked, replacement: created };
  });
}
