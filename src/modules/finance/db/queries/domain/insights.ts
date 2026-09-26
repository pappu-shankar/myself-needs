import { and, eq, isNull, ne, sql } from "drizzle-orm";
import { getDb } from "@/modules/core/db/client";
import { dismissedInsights } from "../../schema/domain/insights";
import { transactions } from "../../schema/domain/transactions";
import { accounts } from "../../schema/domain/accounts";

export function listDismissedInsightIds(): Set<string> {
  const rows = getDb().select({ id: dismissedInsights.id }).from(dismissedInsights).all();
  return new Set(rows.map((r) => r.id));
}

export function dismissInsight(id: string) {
  return getDb().insert(dismissedInsights).values({ id }).onConflictDoNothing().returning().get();
}

export interface DuplicateGroup {
  accountId: number;
  accountName: string;
  amount: number;
  date: string;
  count: number;
}

/** Same account + amount + date + type, more than once — a likely double-entry. */
export function findDuplicateTransactionGroups(): DuplicateGroup[] {
  return getDb()
    .select({
      accountId: transactions.accountId,
      accountName: accounts.name,
      amount: transactions.amount,
      date: transactions.date,
      count: sql<number>`COUNT(*)`,
    })
    .from(transactions)
    .innerJoin(accounts, eq(transactions.accountId, accounts.id))
    .groupBy(transactions.accountId, transactions.amount, transactions.date, transactions.type)
    .having(sql`COUNT(*) > 1`)
    .all();
}

/** Income/expense transactions with no category — transfers are legitimately uncategorized, so they're excluded. */
export function countUncategorizedTransactions(): number {
  return (
    getDb()
      .select({ value: sql<number>`COUNT(*)` })
      .from(transactions)
      .where(and(ne(transactions.type, "transfer"), isNull(transactions.categoryId)))
      .get()?.value ?? 0
  );
}
