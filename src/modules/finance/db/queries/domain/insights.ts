import { and, eq, isNull, ne, sql } from "drizzle-orm";
import { getDb } from "@/modules/core/db/client";
import { dismissedInsights } from "../../schema/domain/insights";
import { transactions } from "../../schema/domain/transactions";
import { accounts } from "../../schema/domain/accounts";
import { live } from "../lifecycle";
import type { Currency } from "../../schema/currency";

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
  amountMinor: number;
  currency: Currency;
  date: string;
  count: number;
}

/** Same account + amount + date + type, more than once — a likely double-entry. */
export function findDuplicateTransactionGroups(): DuplicateGroup[] {
  return getDb()
    .select({
      accountId: transactions.accountId,
      accountName: accounts.name,
      amountMinor: transactions.amountMinor,
      currency: transactions.currency,
      date: transactions.date,
      count: sql<number>`COUNT(*)`,
    })
    .from(transactions)
    .innerJoin(accounts, eq(transactions.accountId, accounts.id))
    .where(live(transactions.voidedAt))
    .groupBy(transactions.accountId, transactions.amountMinor, transactions.date, transactions.type)
    .having(sql`COUNT(*) > 1`)
    .all();
}

/** Income/expense transactions with no category — transfers are legitimately uncategorized, so they're excluded. */
export function countUncategorizedTransactions(): number {
  return (
    getDb()
      .select({ value: sql<number>`COUNT(*)` })
      .from(transactions)
      .where(
        and(
          ne(transactions.type, "transfer"),
          isNull(transactions.categoryId),
          live(transactions.voidedAt),
        ),
      )
      .get()?.value ?? 0
  );
}
