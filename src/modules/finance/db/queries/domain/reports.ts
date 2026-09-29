import { and, eq, gte, lt, sql } from "drizzle-orm";
import { getDb } from "@/modules/core/db/client";
import { paiseToRupees } from "../../schema/money";
import { transactions } from "../../schema/domain/transactions";
import { categories } from "../../schema/domain/categories";

export interface MonthlyIncomeExpense {
  month: string;
  income: number;
  expense: number;
}

/** One row per YYYY-MM in [startDate, endDate) that has at least one transaction — months with none are simply absent. */
export function getMonthlyIncomeExpense(
  startDate: string,
  endDate: string,
): MonthlyIncomeExpense[] {
  return getDb()
    .select({
      month: sql<string>`substr(${transactions.date}, 1, 7)`,
      income:
        sql<number>`COALESCE(SUM(CASE WHEN ${transactions.type} = 'income' THEN ${transactions.amount} ELSE 0 END), 0)`.mapWith(
          paiseToRupees,
        ),
      expense:
        sql<number>`COALESCE(SUM(CASE WHEN ${transactions.type} = 'expense' THEN ${transactions.amount} ELSE 0 END), 0)`.mapWith(
          paiseToRupees,
        ),
    })
    .from(transactions)
    .where(and(gte(transactions.date, startDate), lt(transactions.date, endDate)))
    .groupBy(sql`substr(${transactions.date}, 1, 7)`)
    .orderBy(sql`substr(${transactions.date}, 1, 7)`)
    .all();
}

export interface CategoryBreakdownRow {
  categoryId: number;
  categoryName: string;
  total: number;
}

export function getExpenseByCategory(startDate: string, endDate: string): CategoryBreakdownRow[] {
  return getDb()
    .select({
      categoryId: categories.id,
      categoryName: categories.name,
      total: sql<number>`SUM(${transactions.amount})`.mapWith(paiseToRupees),
    })
    .from(transactions)
    .innerJoin(categories, eq(transactions.categoryId, categories.id))
    .where(
      and(
        eq(transactions.type, "expense"),
        gte(transactions.date, startDate),
        lt(transactions.date, endDate),
      ),
    )
    .groupBy(categories.id)
    .orderBy(sql`SUM(${transactions.amount}) DESC`)
    .all();
}
