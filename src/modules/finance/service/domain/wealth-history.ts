import { and, eq, gte, lt, sql } from "drizzle-orm";
import { getDb } from "@/modules/core/db/client";
import { transactions } from "../../db/schema/domain/transactions";
import { categories } from "../../db/schema/domain/categories";
import { live } from "../../db/queries/lifecycle";
import { listAccounts, getAccountsTotalByCurrency } from "../../db/queries/domain/accounts";
import { listFxRatesAsOf } from "../../db/queries/config/fx-rates";
import { getBaseCurrency } from "../../db/queries/config/settings";
import { getNetWorthByScope, type NetWorthScope } from "./net-worth-scopes";
import { getCashFlowStatement } from "./cash-flow";
import { aggregateToBase, type MoneyAggregate } from "../utility/aggregate";
import { convert } from "../utility/fx";
import { addDays, addMonths, monthKey, startOfMonth, todayIso } from "@/lib/dates";
import type { Currency } from "../../db/schema/currency";

/**
 * Wealth over time, and what moved it.
 *
 * Nothing is stored: each point is the net-worth function as of that date, so
 * a back-filled historical rate shows up in the whole series at once rather
 * than leaving stored figures citing rates they no longer match.
 *
 * See docs/prd/finance/wealth-history.md.
 */

export interface WealthPoint {
  /** YYYY-MM */
  month: string;
  /** The as-of date the figure was computed at (month end, or today). */
  asOf: string;
  value: MoneyAggregate;
  /**
   * True when a contributing currency had no stored rate on or before this
   * date, so the point cannot be known in the base currency.
   *
   * The point still carries what *is* knowable — the base-currency portion and
   * the native subtotals — and the line should break rather than bridge the
   * gap. A back-converted figure is indistinguishable on a chart from an
   * observed one, and a trend that looks continuous is read as measured.
   */
  unknown: boolean;
}

export function getWealthHistory(months = 12, scope: NetWorthScope = "total"): WealthPoint[] {
  const today = todayIso();
  const points: WealthPoint[] = [];
  for (let i = months - 1; i >= 0; i -= 1) {
    const monthStart = addMonths(startOfMonth(today), -i);
    const asOf = i === 0 ? today : addDays(addMonths(monthStart, 1), -1);
    const value = getNetWorthByScope(asOf).scopes[scope].value;
    points.push({ month: monthKey(monthStart), asOf, value, unknown: !value.complete });
  }
  return points;
}

export interface AttributionComponent {
  /** Base-currency minor units. Signed: a negative component reduced wealth. */
  minor: number;
  /** False when an input to this component could not be converted, so the
   * figure is short by an unknown amount. */
  known: boolean;
}

export interface WealthAttribution {
  startDate: string;
  /** Exclusive. */
  endDate: string;
  baseCurrency: Currency;
  scope: NetWorthScope;
  openingMinor: number;
  closingMinor: number;
  /** `closing − opening`. Every component below sums to this. */
  totalChangeMinor: number;
  income: AttributionComponent;
  spending: AttributionComponent;
  tax: AttributionComponent;
  investmentGain: AttributionComponent;
  propertyGain: AttributionComponent;
  /**
   * Principal repaid over the period, as a positive figure.
   *
   * Reported but **not** part of the sum: repaying principal from cash is
   * net-worth-neutral, because the cash leaving and the debt falling cancel.
   * It is here because where the money went is worth knowing — the interest
   * portion of an EMI is not principal and lands in the residual, since
   * splitting an EMI needs the loan engine and the ledger alone cannot.
   */
  debtReduction: AttributionComponent;
  /**
   * The part of the change that is currency movement on non-base balances.
   *
   * Explicit, because a rupee-denominated wealth change that includes a
   * weakening dollar is partly currency — and hiding it inside investment gain
   * credits the user with a skill that was an exchange rate.
   */
  fxEffect: AttributionComponent;
  /**
   * What the components cannot account for.
   *
   * Shown, never forced to zero: a plugged balance hides a wrong component,
   * and the residual is the only thing that reveals one. `known` is false when
   * any component had an unconvertible input, because a residual computed from
   * incomplete parts is not a measurement of anything.
   */
  unexplained: AttributionComponent;
}

/** Income and expense totals for the period, split by whether the category is
 * flagged as tax. */
function operatingSplit(startDate: string, endDate: string) {
  const rows = getDb()
    .select({
      type: transactions.type,
      isTax: sql<number>`COALESCE(${categories.isTax}, 0)`.mapWith(Number),
      currency: transactions.currency,
      totalMinor: sql<number>`SUM(${transactions.amountMinor})`.mapWith(Number),
    })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(
      and(
        sql`${transactions.type} <> 'transfer'`,
        gte(transactions.date, startDate),
        lt(transactions.date, endDate),
        live(transactions.voidedAt),
      ),
    )
    .groupBy(transactions.type, categories.isTax, transactions.currency)
    .all();

  const income = new Map<Currency, number>();
  const spending = new Map<Currency, number>();
  const tax = new Map<Currency, number>();
  for (const row of rows) {
    const target = row.type === "income" ? income : row.isTax ? tax : spending;
    target.set(row.currency, (target.get(row.currency) ?? 0) + row.totalMinor);
  }
  return { income, spending, tax };
}

/** Liability balances, per currency, as of a date. Their change over a period
 * is principal movement — which is exactly what debt reduction means. */
function liabilityTotals(asOf: string): Map<Currency, number> {
  const ids = listAccounts({ includeArchived: true })
    .filter((a) => a.kind === "liability")
    .map((a) => a.id);
  return getAccountsTotalByCurrency(ids, asOf);
}

/** Asset classes whose value change is property rather than investment gain. */
const PROPERTY_CLASSES = new Set(["real_estate"]);

/**
 * Decompose the change in wealth between two dates.
 *
 * `endDate` is exclusive, matching every other period query in the module.
 */
export function getWealthAttribution(
  startDate: string,
  endDate: string,
  scope: NetWorthScope = "total",
): WealthAttribution {
  const baseCurrency = getBaseCurrency();
  const openingAsOf = addDays(startDate, -1);
  const closingAsOf = addDays(endDate, -1);
  const closingRates = listFxRatesAsOf(closingAsOf);
  const openingRates = listFxRatesAsOf(openingAsOf);
  const closingBasis = { baseCurrency, asOf: closingAsOf, rates: closingRates };

  const openingView = getNetWorthByScope(openingAsOf).scopes[scope];
  const closingView = getNetWorthByScope(closingAsOf).scopes[scope];
  const openingMinor = openingView.value.baseMinor;
  const closingMinor = closingView.value.baseMinor;

  const { income, spending, tax } = operatingSplit(startDate, endDate);
  // Converted at the closing rate, so every component is in one frame and the
  // currency movement itself lands in `fxEffect` rather than being smeared
  // across the others.
  const incomeAgg = aggregateToBase(income, closingBasis);
  const spendingAgg = aggregateToBase(spending, closingBasis);
  const taxAgg = aggregateToBase(tax, closingBasis);

  // Liabilities are stored negative, so a *rise* in the total is principal
  // repaid. The interest portion of an EMI is not principal and belongs in
  // spending; it falls out as part of the residual rather than being guessed,
  // because splitting an EMI needs the loan engine and the ledger alone cannot.
  const openingDebt = aggregateToBase(liabilityTotals(openingAsOf), closingBasis);
  const closingDebt = aggregateToBase(liabilityTotals(closingAsOf), closingBasis);
  const debtReductionMinor = closingDebt.baseMinor - openingDebt.baseMinor;

  // Investment and property gain: the change in each class's value, less what
  // was put in. The cash-flow statement already separates contributions from
  // dividends, so net contributions come from there rather than being re-derived.
  const flows = getCashFlowStatement(startDate, endDate);
  const netContributionsMinor =
    flows.investing.outflow.baseMinor - flows.investing.inflow.baseMinor;

  const openingByClass = valueByPropertySplit(
    openingView.components,
    openingRates,
    openingAsOf,
    baseCurrency,
  );
  const closingByClass = valueByPropertySplit(
    closingView.components,
    closingRates,
    closingAsOf,
    baseCurrency,
  );

  const propertyGainMinor = closingByClass.property - openingByClass.property;
  const investmentGainMinor =
    closingByClass.investment - openingByClass.investment - netContributionsMinor;

  // FX effect: what the *opening* non-base balances are worth at closing rates
  // versus opening rates. Isolating it this way attributes the currency move to
  // the position that was already held, which is what the user did not choose.
  const fxEffectMinor = fxEffectOf(
    openingView.components,
    openingRates,
    closingRates,
    openingAsOf,
    closingAsOf,
    baseCurrency,
  );

  /**
   * The additive decomposition.
   *
   * `debtReduction` is deliberately **not** a term here, though it is reported
   * below. Repaying principal from cash is net-worth-neutral: the cash leaving
   * and the debt falling cancel exactly. Adding it would double-count — money
   * earned and then used to repay a loan already shows up once as income, and
   * crediting the repayment again would make every EMI look like it created
   * wealth. It is reported because *where* the money went is worth knowing,
   * not because it moved the total.
   */
  const accounted =
    incomeAgg.baseMinor -
    spendingAgg.baseMinor -
    taxAgg.baseMinor +
    investmentGainMinor +
    propertyGainMinor +
    fxEffectMinor;

  const allKnown =
    openingView.value.complete &&
    closingView.value.complete &&
    incomeAgg.complete &&
    spendingAgg.complete &&
    taxAgg.complete &&
    flows.complete;

  return {
    startDate,
    endDate,
    baseCurrency,
    scope,
    openingMinor,
    closingMinor,
    totalChangeMinor: closingMinor - openingMinor,
    income: { minor: incomeAgg.baseMinor, known: incomeAgg.complete },
    spending: { minor: -spendingAgg.baseMinor, known: spendingAgg.complete },
    tax: { minor: -taxAgg.baseMinor, known: taxAgg.complete },
    investmentGain: {
      minor: investmentGainMinor,
      known: flows.complete && closingView.value.complete,
    },
    propertyGain: { minor: propertyGainMinor, known: closingView.value.complete },
    debtReduction: {
      minor: debtReductionMinor,
      known: openingDebt.complete && closingDebt.complete,
    },
    fxEffect: { minor: fxEffectMinor, known: openingView.value.complete },
    unexplained: { minor: closingMinor - openingMinor - accounted, known: allKnown },
  };
}

/** Base-currency value of the components, split into property and everything
 * else that is not an account balance. */
function valueByPropertySplit(
  components: readonly {
    currency: Currency;
    ownedMinor: number;
    kind: string;
    type: string;
    fundCategory: string | null;
  }[],
  rates: ReturnType<typeof listFxRatesAsOf>,
  asOf: string,
  baseCurrency: Currency,
): { property: number; investment: number } {
  let property = 0;
  let investment = 0;
  for (const c of components) {
    if (c.kind !== "holding") continue;
    const base =
      c.currency === baseCurrency
        ? c.ownedMinor
        : (convert(rates, c.ownedMinor, c.currency, baseCurrency, asOf)?.minor ?? 0);
    if (PROPERTY_CLASSES.has(c.fundCategory ?? "")) property += base;
    else investment += base;
  }
  return { property, investment };
}

/**
 * What currency movement alone did to the balances held at the start.
 *
 * Measured on the opening positions, not the closing ones: the closing
 * positions include everything bought during the period, and crediting the
 * period's rate move to a position bought on the last day would attribute a
 * currency effect that position never experienced.
 */
function fxEffectOf(
  components: readonly { currency: Currency; ownedMinor: number }[],
  openingRates: ReturnType<typeof listFxRatesAsOf>,
  closingRates: ReturnType<typeof listFxRatesAsOf>,
  openingAsOf: string,
  closingAsOf: string,
  baseCurrency: Currency,
): number {
  const byCurrency = new Map<Currency, number>();
  for (const c of components) {
    if (c.currency === baseCurrency) continue;
    byCurrency.set(c.currency, (byCurrency.get(c.currency) ?? 0) + c.ownedMinor);
  }

  let effect = 0;
  for (const [currency, minor] of byCurrency) {
    const atOpening = convert(openingRates, minor, currency, baseCurrency, openingAsOf);
    const atClosing = convert(closingRates, minor, currency, baseCurrency, closingAsOf);
    // No rate at either end: the effect is unknowable for that currency, and
    // the point's own `complete` flag already says the figure is short.
    if (!atOpening || !atClosing) continue;
    effect += atClosing.minor - atOpening.minor;
  }
  return effect;
}
