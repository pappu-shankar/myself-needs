import { getExpenseByCategory, getMonthlyIncomeExpense } from "../../db/queries/domain/reports";
import { listAccountsWithBalances } from "../../db/queries/domain/accounts";

function monthStart(monthsAgo: number): string {
  const today = new Date();
  return new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - monthsAgo, 1))
    .toISOString()
    .slice(0, 10);
}

/** Exclusive end bound — the first day of the month after the current one, so the current (partial) month is included. */
function nextMonthStart(): string {
  const today = new Date();
  return new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 1))
    .toISOString()
    .slice(0, 10);
}

export interface IncomeExpenseReport {
  trend: { month: string; income: number; expense: number }[];
  categoryBreakdown: { categoryId: number; categoryName: string; total: number }[];
  /** (income − expense) / income over the same window as `trend`; null if there was no income. */
  savingsRate: number | null;
}

/** Reuses existing income/expense transactions and categories — no new schema. See docs/prd/finance/reports-allocation.md. */
export function getIncomeExpenseReport(months = 6): IncomeExpenseReport {
  const startDate = monthStart(months - 1);
  const endDate = nextMonthStart();

  const trend = getMonthlyIncomeExpense(startDate, endDate);
  const categoryBreakdown = getExpenseByCategory(startDate, endDate);

  const totalIncome = trend.reduce((sum, r) => sum + r.income, 0);
  const totalExpense = trend.reduce((sum, r) => sum + r.expense, 0);
  const savingsRate = totalIncome > 0 ? (totalIncome - totalExpense) / totalIncome : null;

  return { trend, categoryBreakdown, savingsRate };
}

const EMERGENCY_FUND_WINDOW_MONTHS = 3;
const LIQUID_ACCOUNT_TYPES = new Set(["checking", "savings", "cash"]);

/** Liquid assets ÷ trailing-3-month average monthly expense = months of coverage. Null if there's no expense history to divide by. */
export function getEmergencyFundMonths(): number | null {
  const liquidAssets = listAccountsWithBalances()
    .filter((a) => LIQUID_ACCOUNT_TYPES.has(a.type))
    .reduce((sum, a) => sum + a.balance, 0);

  const startDate = monthStart(EMERGENCY_FUND_WINDOW_MONTHS - 1);
  const endDate = nextMonthStart();
  const trend = getMonthlyIncomeExpense(startDate, endDate);
  const totalExpense = trend.reduce((sum, r) => sum + r.expense, 0);
  const avgMonthlyExpense = totalExpense / EMERGENCY_FUND_WINDOW_MONTHS;

  if (avgMonthlyExpense <= 0) return null;
  return liquidAssets / avgMonthlyExpense;
}
