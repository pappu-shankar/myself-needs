import { and, eq, gte, lt, max, sql } from "drizzle-orm";
import { getDb } from "@/modules/core/db/client";
import { budgets } from "../../schema/domain/budgets";
import { categories } from "../../schema/domain/categories";
import { transactions } from "../../schema/domain/transactions";

export type NewBudget = typeof budgets.$inferInsert;

export function insertBudget(entry: NewBudget) {
  return getDb().insert(budgets).values(entry).returning().get();
}

/**
 * One row per category with a budget effective on/before the month of
 * `monthStart` — its most recently set `monthly_limit`, paired with actual
 * expense spend for that category in [monthStart, monthEnd). Compared at
 * month granularity (not exact date) so a budget added on any day of a month
 * counts as effective for that whole month, including one set for the
 * current month after the 1st. Actual spend is always computed fresh from
 * transactions, never stored. See docs/prd/finance/budgets.md.
 */
export function listBudgetsForMonth(monthStart: string, monthEnd: string) {
  const db = getDb();
  const monthPrefix = monthStart.slice(0, 7);

  const latest = db
    .select({
      categoryId: budgets.categoryId,
      maxEffectiveFrom: max(budgets.effectiveFrom).as("max_effective_from"),
    })
    .from(budgets)
    .where(sql`substr(${budgets.effectiveFrom}, 1, 7) <= ${monthPrefix}`)
    .groupBy(budgets.categoryId)
    .as("latest");

  const spend = db
    .select({
      categoryId: transactions.categoryId,
      total: sql<number>`SUM(${transactions.amount})`.as("total"),
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.type, "expense"),
        gte(transactions.date, monthStart),
        lt(transactions.date, monthEnd),
      ),
    )
    .groupBy(transactions.categoryId)
    .as("spend");

  return db
    .select({
      categoryId: categories.id,
      categoryName: categories.name,
      monthlyLimit: budgets.monthlyLimit,
      effectiveFrom: budgets.effectiveFrom,
      actualSpend: sql<number>`COALESCE(${spend.total}, 0)`,
    })
    .from(latest)
    .innerJoin(categories, eq(categories.id, latest.categoryId))
    .innerJoin(
      budgets,
      and(
        eq(budgets.categoryId, latest.categoryId),
        eq(budgets.effectiveFrom, latest.maxEffectiveFrom),
      ),
    )
    .leftJoin(spend, eq(spend.categoryId, categories.id))
    .orderBy(categories.name)
    .all();
}
