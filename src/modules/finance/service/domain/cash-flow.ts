import { and, eq, gte, inArray, lt, ne, sql } from "drizzle-orm";
import { getDb } from "@/modules/core/db/client";
import { transactions } from "../../db/schema/domain/transactions";
import { investmentCashFlows } from "../../db/schema/domain/investment-cash-flows";
import { live } from "../../db/queries/lifecycle";
import { listFxRatesAsOf } from "../../db/queries/config/fx-rates";
import { getBaseCurrency } from "../../db/queries/config/settings";
import { getAccountsTotalByCurrency, listAccounts } from "../../db/queries/domain/accounts";
import { aggregateToBase, mergeByCurrency, type MoneyAggregate } from "../utility/aggregate";
import { addDays, todayIso } from "@/lib/dates";
import type { Currency } from "../../db/schema/currency";

/**
 * Three-way cash flow: operating, investing, financing.
 *
 * Plain category totals can say "you earned ₹1.2 Cr and spent ₹40 L", which
 * reads as an ₹80 L surplus. They cannot say that ₹35 L went into loan
 * principal and ₹14 L into a property purchase, so the net investable surplus
 * was ₹31 L. Putting asset purchases under "spending" misreads saving as
 * consumption; leaving debt repayment out overstates what is free to invest.
 * The split exists to state the second sentence, which is the one that drives
 * a decision.
 *
 * See docs/prd/finance/cash-flow.md.
 */

export interface FlowSide {
  inflow: MoneyAggregate;
  outflow: MoneyAggregate;
  /** Inflow minus outflow, in the base currency's minor units. */
  netMinor: number;
}

export interface CashFlowStatement {
  startDate: string;
  /** Exclusive. */
  endDate: string;
  baseCurrency: Currency;
  operating: FlowSide;
  investing: FlowSide;
  financing: FlowSide;
  /**
   * `operating net − financing outflow net of disbursals`. What was actually
   * free to put to work over the period.
   */
  netInvestableSurplusMinor: number;
  /** Where the surplus went. */
  disposition: {
    investedMinor: number;
    savedMinor: number;
    spentMinor: number;
    /**
     * The part the three cannot account for.
     *
     * Reported rather than forced to zero: a reconciliation that always
     * balances exactly is one nobody can audit, and the residual is the signal
     * that something — an unlogged transfer, a missing opening balance — needs
     * attention. See docs/prd/finance/cash-flow.md § Surplus.
     */
    unexplainedMinor: number;
  };
  /** False when any currency in the period had no resolvable rate. */
  complete: boolean;
}

/** Per-currency inflow and outflow subtotals, before any conversion. */
interface SideTotals {
  inflow: Map<Currency, number>;
  outflow: Map<Currency, number>;
}

function emptySide(): SideTotals {
  return { inflow: new Map(), outflow: new Map() };
}

function add(side: Map<Currency, number>, currency: Currency, minor: number) {
  side.set(currency, (side.get(currency) ?? 0) + minor);
}

/**
 * Operating: income and expenses, from the transaction ledger.
 *
 * Transfers are excluded entirely — they are never spending, they net to zero
 * in net worth, and counting either leg would double-count one movement. A card
 * payment from a bank account is a transfer, not an expense; the expense was
 * recorded when the card was used.
 *
 * Interest *earned* is operating income. Interest *paid* is financing, so the
 * cost of debt is not buried inside lifestyle spend.
 */
function operatingTotals(startDate: string, endDate: string): SideTotals {
  const totals = emptySide();
  const rows = getDb()
    .select({
      type: transactions.type,
      currency: transactions.currency,
      totalMinor: sql<number>`SUM(${transactions.amountMinor})`.mapWith(Number),
    })
    .from(transactions)
    .where(
      and(
        ne(transactions.type, "transfer"),
        gte(transactions.date, startDate),
        lt(transactions.date, endDate),
        live(transactions.voidedAt),
      ),
    )
    .groupBy(transactions.type, transactions.currency)
    .all();

  for (const row of rows) {
    add(row.type === "income" ? totals.inflow : totals.outflow, row.currency, row.totalMinor);
  }
  return totals;
}

/**
 * Investing: principal movements in and out of assets.
 *
 * Principal only. A dividend or credited interest is operating income — it is
 * a return *on* the asset, not a change in how much of it is owned — and
 * counting it here would both overstate investing inflow and understate
 * earnings. Drawn from the same investment cash flows that produce XIRR, so
 * the two tie to the same rows.
 */
const INVESTING_FLOW_TYPES = ["contribution", "redemption", "maturity"] as const;

function investingTotals(startDate: string, endDate: string): SideTotals {
  const totals = emptySide();
  const rows = getDb()
    .select({
      flowType: investmentCashFlows.flowType,
      currency: investmentCashFlows.currency,
      totalMinor: sql<number>`SUM(${investmentCashFlows.amountMinor})`.mapWith(Number),
    })
    .from(investmentCashFlows)
    .where(
      and(
        inArray(investmentCashFlows.flowType, [...INVESTING_FLOW_TYPES]),
        gte(investmentCashFlows.date, startDate),
        lt(investmentCashFlows.date, endDate),
        live(investmentCashFlows.voidedAt),
      ),
    )
    .groupBy(investmentCashFlows.flowType, investmentCashFlows.currency)
    .all();

  for (const row of rows) {
    // The ledger's convention: negative is money in (contributed), positive is
    // money out (received). So a contribution is an investing *outflow*.
    if (row.totalMinor < 0) add(totals.outflow, row.currency, -row.totalMinor);
    else add(totals.inflow, row.currency, row.totalMinor);
  }
  return totals;
}

/**
 * Financing: borrowing, principal repayment, and the cost of debt.
 *
 * Derived from movements against liability accounts rather than from a category
 * tag, because what makes a payment financing is what it was paid *to*. A
 * transfer into a liability account reduces what is owed, which is a principal
 * repayment; a transaction recorded directly against a liability account is a
 * drawdown or a charge.
 *
 * Interest and fees belong here with the principal, so neither lands in
 * operating spend — see the PRD. Splitting a single EMI into its two parts
 * needs the loan engine and is not attempted from the ledger alone; an EMI
 * recorded as one transfer is reported whole as a financing outflow, which is
 * accurate about the cash even where it does not separate the interest.
 */
function financingTotals(startDate: string, endDate: string): SideTotals {
  const totals = emptySide();
  const liabilityIds = listAccounts({ includeArchived: true })
    .filter((a) => a.kind === "liability")
    .map((a) => a.id);
  if (liabilityIds.length === 0) return totals;

  // Money moved *into* a liability account: a repayment. Uses the destination
  // leg's own amount, so a cross-currency repayment is counted in the currency
  // of the debt it settled.
  const repayments = getDb()
    .select({
      currency: sql<Currency>`COALESCE(${transactions.toCurrency}, ${transactions.currency})`,
      totalMinor:
        sql<number>`SUM(COALESCE(${transactions.toAmountMinor}, ${transactions.amountMinor}))`.mapWith(
          Number,
        ),
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.type, "transfer"),
        inArray(transactions.toAccountId, liabilityIds),
        gte(transactions.date, startDate),
        lt(transactions.date, endDate),
        live(transactions.voidedAt),
      ),
    )
    .groupBy(sql`COALESCE(${transactions.toCurrency}, ${transactions.currency})`)
    .all();
  for (const row of repayments) add(totals.outflow, row.currency, row.totalMinor);

  // An expense or income recorded directly against a liability account: a card
  // charge, a fee, a drawdown.
  const direct = getDb()
    .select({
      type: transactions.type,
      currency: transactions.currency,
      totalMinor: sql<number>`SUM(${transactions.amountMinor})`.mapWith(Number),
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.type, "income"),
        inArray(transactions.accountId, liabilityIds),
        gte(transactions.date, startDate),
        lt(transactions.date, endDate),
        live(transactions.voidedAt),
      ),
    )
    .groupBy(transactions.type, transactions.currency)
    .all();
  for (const row of direct) add(totals.inflow, row.currency, row.totalMinor);

  return totals;
}

interface Basis {
  baseCurrency: Currency;
  asOf: string;
  rates: ReturnType<typeof listFxRatesAsOf>;
}

function toSide(totals: SideTotals, basis: Basis): FlowSide {
  const inflow = aggregateToBase(totals.inflow, basis);
  const outflow = aggregateToBase(totals.outflow, basis);
  return { inflow, outflow, netMinor: inflow.baseMinor - outflow.baseMinor };
}

/**
 * The statement for a period. `endDate` is exclusive, matching every other
 * period query in the module.
 */
export function getCashFlowStatement(startDate: string, endDate: string): CashFlowStatement {
  const baseCurrency = getBaseCurrency();
  // Rates as of the period's end: the statement is a single period's figure,
  // so one as-of date applies to all of it, unlike the net-worth trend where
  // each month resolves its own.
  const asOf = endDate > todayIso() ? todayIso() : addDays(endDate, -1);
  const basis = { baseCurrency, asOf, rates: listFxRatesAsOf(asOf) };

  const operating = toSide(operatingTotals(startDate, endDate), basis);
  const investing = toSide(investingTotals(startDate, endDate), basis);
  const financing = toSide(financingTotals(startDate, endDate), basis);

  const netInvestableSurplusMinor = operating.netMinor + financing.netMinor;

  // What happened to the money: invested is the investing outflow; saved is
  // whatever stayed as liquid balance; spent is the operating outflow.
  const investedMinor = investing.outflow.baseMinor;
  const spentMinor = operating.outflow.baseMinor;
  const savedMinor = liquidBalanceChange(startDate, endDate, basis);

  const statement: CashFlowStatement = {
    startDate,
    endDate,
    baseCurrency,
    operating,
    investing,
    financing,
    netInvestableSurplusMinor,
    disposition: {
      investedMinor,
      savedMinor,
      spentMinor,
      // Everything earned has to have gone somewhere. The residual is the part
      // the three destinations cannot account for — an unlogged transfer, a
      // missing opening balance, a holding bought from an account the ledger
      // does not know about. Shown, never forced to zero.
      unexplainedMinor:
        operating.inflow.baseMinor -
        spentMinor -
        investedMinor -
        financing.outflow.baseMinor +
        financing.inflow.baseMinor +
        investing.inflow.baseMinor -
        savedMinor,
    },
    complete:
      operating.inflow.complete &&
      operating.outflow.complete &&
      investing.inflow.complete &&
      investing.outflow.complete &&
      financing.inflow.complete &&
      financing.outflow.complete,
  };
  return statement;
}

/**
 * Change in liquid balance over the period — what was "saved".
 *
 * Computed as the difference between two point-in-time balances rather than
 * from a sum of movements, so it is derived from the same place the balance on
 * screen comes from and cannot disagree with it.
 */
function liquidBalanceChange(startDate: string, endDate: string, basis: Basis): number {
  const liquidIds = listAccounts({ includeArchived: true })
    .filter((a) => a.kind === "asset" && a.liquidity === "liquid")
    .map((a) => a.id);
  if (liquidIds.length === 0) return 0;

  const opening = aggregateToBase(
    getAccountsTotalByCurrency(liquidIds, addDays(startDate, -1)),
    basis,
  );
  const closing = aggregateToBase(
    getAccountsTotalByCurrency(liquidIds, addDays(endDate, -1)),
    basis,
  );
  return closing.baseMinor - opening.baseMinor;
}

/** Operating, investing and financing merged, for a one-line period total. */
export function getPeriodNetByCurrency(startDate: string, endDate: string): Map<Currency, number> {
  const sides = [
    operatingTotals(startDate, endDate),
    investingTotals(startDate, endDate),
    financingTotals(startDate, endDate),
  ];
  const inflow = mergeByCurrency(...sides.map((s) => s.inflow));
  const outflow = mergeByCurrency(...sides.map((s) => s.outflow));
  const net = new Map(inflow);
  for (const [currency, minor] of outflow) net.set(currency, (net.get(currency) ?? 0) - minor);
  return net;
}
