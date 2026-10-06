import { and, eq, gte, lt, max, sql } from "drizzle-orm";
import { getDb } from "@/modules/core/db/client";
import { budgets } from "../../schema/domain/budgets";
import { categories } from "../../schema/domain/categories";
import { transactions } from "../../schema/domain/transactions";
import { live } from "../lifecycle";
import type { Currency } from "../../schema/currency";

export type NewBudget = typeof budgets.$inferInsert;

/**
 * `(category_id, effective_from)` is unique — setting a budget again for the
 * same category and effective date (e.g. the "Add budget" form defaults
 * `effectiveFrom` to today, so doing it twice in one day is easy) updates the
 * existing row's limit instead of failing. See docs/prd/finance/budgets.md.
 */
export function upsertBudget(entry: NewBudget) {
  return getDb()
    .insert(budgets)
    .values(entry)
    .onConflictDoUpdate({
      target: [budgets.categoryId, budgets.effectiveFrom],
      set: { monthlyLimitMinor: entry.monthlyLimitMinor },
    })
    .returning()
    .get();
}

/**
 * One row per category with a budget effective on/before the month of
 * `monthStart` — its most recently set limit. Compared at month granularity
 * (not exact date) so a budget added on any day of a month counts as effective
 * for that whole month, including one set for the current month after the 1st.
 * See docs/prd/finance/budgets.md.
 */
export function listBudgetsForMonth(monthStart: string) {
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

  return db
    .select({
      categoryId: categories.id,
      categoryName: categories.name,
      monthlyLimitMinor: budgets.monthlyLimitMinor,
      currency: budgets.currency,
      effectiveFrom: budgets.effectiveFrom,
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
    .orderBy(categories.name)
    .all();
}

/**
 * Expense spend in [monthStart, monthEnd), per category **and per currency**.
 *
 * Split by currency, not collapsed into one number: a category can be spent in
 * more than one currency, and adding those together is the cross-currency sum
 * the currency column exists to prevent. It was collapsed here until an
 * architecture-test rule caught it. The caller converts into the *budget's*
 * currency — see `getBudgetSpend`, and decision 8.
 *
 * Actual spend is always computed fresh from transactions, never stored.
 */
export function spendByCategoryAndCurrency(
  monthStart: string,
  monthEnd: string,
): Map<number, Map<Currency, number>> {
  const rows = getDb()
    .select({
      categoryId: transactions.categoryId,
      currency: transactions.currency,
      totalMinor: sql<number>`SUM(${transactions.amountMinor})`.mapWith(Number),
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.type, "expense"),
        gte(transactions.date, monthStart),
        lt(transactions.date, monthEnd),
        live(transactions.voidedAt),
      ),
    )
    .groupBy(transactions.categoryId, transactions.currency)
    .all();

  const byCategory = new Map<number, Map<Currency, number>>();
  for (const row of rows) {
    if (row.categoryId === null) continue;
    const bucket = byCategory.get(row.categoryId) ?? new Map<Currency, number>();
    bucket.set(row.currency, (bucket.get(row.currency) ?? 0) + row.totalMinor);
    byCategory.set(row.categoryId, bucket);
  }
  return byCategory;
}
