import { and, eq, gte, lt, sql } from "drizzle-orm";
import { getDb } from "@/modules/core/db/client";
import { transactions } from "../../schema/domain/transactions";
import { categories } from "../../schema/domain/categories";
import type { Currency } from "../../schema/currency";
import { live } from "../lifecycle";

export interface MonthlyIncomeExpense {
  month: string;
  /** Minor units. Mixed-currency vaults get one row per currency. */
  incomeMinor: number;
  expenseMinor: number;
  currency: Currency;
}

/** One row per YYYY-MM in [startDate, endDate) that has at least one transaction — months with none are simply absent. */
export function getMonthlyIncomeExpense(
  startDate: string,
  endDate: string,
): MonthlyIncomeExpense[] {
  return getDb()
    .select({
      month: sql<string>`substr(${transactions.date}, 1, 7)`,
      currency: transactions.currency,
      incomeMinor:
        sql<number>`COALESCE(SUM(CASE WHEN ${transactions.type} = 'income' THEN ${transactions.amountMinor} ELSE 0 END), 0)`.mapWith(
          Number,
        ),
      expenseMinor:
        sql<number>`COALESCE(SUM(CASE WHEN ${transactions.type} = 'expense' THEN ${transactions.amountMinor} ELSE 0 END), 0)`.mapWith(
          Number,
        ),
    })
    .from(transactions)
    .where(
      and(
        gte(transactions.date, startDate),
        lt(transactions.date, endDate),
        live(transactions.voidedAt),
      ),
    )
    .groupBy(sql`substr(${transactions.date}, 1, 7)`, transactions.currency)
    .orderBy(sql`substr(${transactions.date}, 1, 7)`, transactions.currency)
    .all();
}

export interface CategoryBreakdownRow {
  categoryId: number;
  categoryName: string;
  /** Minor units of `currency`. */
  totalMinor: number;
  currency: Currency;
}

export function getExpenseByCategory(startDate: string, endDate: string): CategoryBreakdownRow[] {
  return getDb()
    .select({
      categoryId: categories.id,
      categoryName: categories.name,
      currency: transactions.currency,
      totalMinor: sql<number>`SUM(${transactions.amountMinor})`.mapWith(Number),
    })
    .from(transactions)
    .innerJoin(categories, eq(transactions.categoryId, categories.id))
    .where(
      and(
        eq(transactions.type, "expense"),
        gte(transactions.date, startDate),
        lt(transactions.date, endDate),
        live(transactions.voidedAt),
      ),
    )
    .groupBy(categories.id, transactions.currency)
    .orderBy(sql`SUM(${transactions.amountMinor}) DESC`)
    .all();
}
