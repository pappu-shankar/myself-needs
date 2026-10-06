import { addMonths, startOfMonth, todayIso } from "@/lib/dates";
import { getExpenseByCategory, getMonthlyIncomeExpense } from "../../db/queries/domain/reports";
import { getAccountsTotalByCurrency, listAccounts } from "../../db/queries/domain/accounts";
import type { Currency } from "../../db/schema/currency";
import type { ConfidenceLevel } from "../../db/schema/provenance";
import {
  aggregateToBase,
  mergeByCurrency,
  weakestConfidence,
  type MoneyAggregate,
} from "../utility/aggregate";
import { resolveConversionBasis, type BaseConversionOptions } from "./accounts";

/** Start of the month `monthsAgo` months before the current one (0 = this month), in the local calendar — never derived via `toISOString()`, which is the UTC date and can be a day off from India's local date. */
function monthStart(monthsAgo: number): string {
  return addMonths(startOfMonth(todayIso()), -monthsAgo);
}

/** Exclusive end bound — the first day of the month after the current one, so the current (partial) month is included. */
function nextMonthStart(): string {
  return addMonths(startOfMonth(todayIso()), 1);
}

/**
 * Both report queries now return one row per currency, because SQL never
 * multiplies money by a rate (decision 8). Grouping them back into one series
 * therefore means converting in TypeScript, and the conversion has to be able
 * to fail: a currency with no rate on the as-of date is reported unresolved,
 * never converted at today's rate or at 1.
 */
function groupByCurrency<Row>(
  rows: readonly Row[],
  key: (row: Row) => string,
  currency: (row: Row) => Currency,
  minor: (row: Row) => number,
): Map<string, Map<Currency, number>> {
  const grouped = new Map<string, Map<Currency, number>>();
  for (const row of rows) {
    const k = key(row);
    let byCurrency = grouped.get(k);
    if (!byCurrency) grouped.set(k, (byCurrency = new Map()));
    const c = currency(row);
    byCurrency.set(c, (byCurrency.get(c) ?? 0) + minor(row));
  }
  return grouped;
}

export interface MonthlyTrendPoint {
  month: string;
  income: MoneyAggregate;
  expense: MoneyAggregate;
}

export interface CategoryBreakdownEntry {
  categoryId: number;
  categoryName: string;
  total: MoneyAggregate;
}

export interface IncomeExpenseReport {
  baseCurrency: Currency;
  trend: MonthlyTrendPoint[];
  /** Descending by converted total — a category whose currency did not resolve
   * sorts on the part of it that did, and `complete` says so. */
  categoryBreakdown: CategoryBreakdownEntry[];
  totalIncome: MoneyAggregate;
  totalExpense: MoneyAggregate;
  /** (income − expense) / income over the same window as `trend`; null if
   * there was no income, and null when a currency could not be converted —
   * a ratio of two short numbers is not a smaller savings rate, it is a
   * meaningless one. */
  savingsRate: number | null;
  /** False when any contributing currency had no resolvable rate. */
  complete: boolean;
  /** True when any rate used is older than the allowed bound. */
  stale: boolean;
}

/** Reuses existing income/expense transactions and categories — no new schema. See docs/prd/finance/reports-allocation.md. */
export function getIncomeExpenseReport(
  options: BaseConversionOptions & { months?: number } = {},
): IncomeExpenseReport {
  const months = options.months ?? 6;
  const startDate = monthStart(months - 1);
  const endDate = nextMonthStart();
  const basis = resolveConversionBasis(options);
  const toBase = (byCurrency: ReadonlyMap<Currency, number>) => aggregateToBase(byCurrency, basis);

  const rows = getMonthlyIncomeExpense(startDate, endDate);
  const incomeByMonth = groupByCurrency(
    rows,
    (r) => r.month,
    (r) => r.currency,
    (r) => r.incomeMinor,
  );
  const expenseByMonth = groupByCurrency(
    rows,
    (r) => r.month,
    (r) => r.currency,
    (r) => r.expenseMinor,
  );
  const trend: MonthlyTrendPoint[] = [...incomeByMonth.keys()].sort().map((month) => ({
    month,
    income: toBase(incomeByMonth.get(month)!),
    expense: toBase(expenseByMonth.get(month)!),
  }));

  const categoryRows = getExpenseByCategory(startDate, endDate);
  const names = new Map(categoryRows.map((r) => [String(r.categoryId), r.categoryName]));
  const categoryBreakdown: CategoryBreakdownEntry[] = [
    ...groupByCurrency(
      categoryRows,
      (r) => String(r.categoryId),
      (r) => r.currency,
      (r) => r.totalMinor,
    ),
  ]
    .map(([categoryId, byCurrency]) => ({
      categoryId: Number(categoryId),
      categoryName: names.get(categoryId)!,
      total: toBase(byCurrency),
    }))
    .sort((a, b) => b.total.baseMinor - a.total.baseMinor);

  const totalIncome = toBase(mergeByCurrency(...incomeByMonth.values()));
  const totalExpense = toBase(mergeByCurrency(...expenseByMonth.values()));
  const complete = totalIncome.complete && totalExpense.complete;
  const savingsRate =
    complete && totalIncome.baseMinor > 0
      ? (totalIncome.baseMinor - totalExpense.baseMinor) / totalIncome.baseMinor
      : null;

  return {
    baseCurrency: basis.baseCurrency,
    trend,
    categoryBreakdown,
    totalIncome,
    totalExpense,
    savingsRate,
    complete,
    stale: totalIncome.stale || totalExpense.stale,
  };
}

const EMERGENCY_FUND_WINDOW_MONTHS = 3;

export interface EmergencyFundCoverage {
  /** Months of coverage. Null when there is no expense history to divide by,
   * or when a currency could not be converted — a ratio computed from a
   * partially-converted numerator would read as a shortfall that isn't real. */
  months: number | null;
  baseCurrency: Currency;
  /** Liquid assets, with the rate used for each contributing currency. */
  liquidAssets: MoneyAggregate;
  /** Total expense over the 3-complete-month window. */
  windowExpense: MoneyAggregate;
  avgMonthlyExpenseMinor: number;
  complete: boolean;
  stale: boolean;
  confidence: ConfidenceLevel;
}

/**
 * Liquid assets ÷ average monthly expense over the last 3 *complete* months
 * = months of coverage. Unlike the income/expense trend (which deliberately
 * includes the current, still-in-progress month), this window ends at the
 * start of the current month so a mostly-empty partial month can't drag the
 * average down and inflate the ratio.
 *
 * "Liquid" is the account's own `liquidity` column rather than a type list:
 * migration 0027 backfilled it from type (investment is `semi_liquid`
 * deliberately — counting a brokerage balance as a cash buffer overstates it)
 * and it is what the user can change afterwards.
 */
export function getEmergencyFundMonths(
  options: BaseConversionOptions = {},
): EmergencyFundCoverage {
  const basis = resolveConversionBasis(options);

  const liquidIds = listAccounts()
    .filter((a) => a.kind === "asset" && a.liquidity === "liquid")
    .map((a) => a.id);
  const liquidAssets = aggregateToBase(getAccountsTotalByCurrency(liquidIds), basis);

  const currentMonthStart = startOfMonth(todayIso());
  const startDate = addMonths(currentMonthStart, -EMERGENCY_FUND_WINDOW_MONTHS);
  const endDate = currentMonthStart; // exclusive — excludes the current, still-partial month
  const expenseByCurrency = new Map<Currency, number>();
  for (const row of getMonthlyIncomeExpense(startDate, endDate)) {
    expenseByCurrency.set(
      row.currency,
      (expenseByCurrency.get(row.currency) ?? 0) + row.expenseMinor,
    );
  }
  const windowExpense = aggregateToBase(expenseByCurrency, basis);

  const avgMonthlyExpenseMinor = windowExpense.baseMinor / EMERGENCY_FUND_WINDOW_MONTHS;
  const complete = liquidAssets.complete && windowExpense.complete;
  return {
    months: complete && avgMonthlyExpenseMinor > 0
      ? liquidAssets.baseMinor / avgMonthlyExpenseMinor
      : null,
    baseCurrency: basis.baseCurrency,
    liquidAssets,
    windowExpense,
    avgMonthlyExpenseMinor,
    complete,
    stale: liquidAssets.stale || windowExpense.stale,
    confidence: weakestConfidence([liquidAssets.confidence, windowExpense.confidence]),
  };
}
