import { eq, sql } from "drizzle-orm";
import { getDb } from "@/modules/core/db/client";
import { accounts } from "../../schema/domain/accounts";
import { transactions } from "../../schema/domain/transactions";

export type NewAccount = typeof accounts.$inferInsert;

export function listAccounts() {
  return getDb().select().from(accounts).orderBy(accounts.name).all();
}

export function getAccountByIdRow(id: number) {
  return getDb().select().from(accounts).where(eq(accounts.id, id)).get();
}

export function insertAccount(entry: NewAccount) {
  return getDb().insert(accounts).values(entry).returning().get();
}

/**
 * opening_balance + net effect of every transaction touching this account
 * (income/expense/outgoing-transfer via account_id, incoming-transfer via
 * to_account_id) — computed in one SQL aggregation, never stored. See
 * docs/architecture/data-model.md.
 */
/** `asOfDate` (YYYY-MM-DD), when given, only counts transactions on/before that date — the point-in-time balance used by net-worth history. Omit for the current balance. */
export function getAccountBalance(accountId: number, asOfDate?: string): number {
  const account = getAccountByIdRow(accountId);
  if (!account) return 0;

  const dateFilter = asOfDate ? sql`AND ${transactions.date} <= ${asOfDate}` : sql``;

  const row = getDb()
    .select({
      delta: sql<number>`COALESCE(SUM(
        CASE
          WHEN ${transactions.accountId} = ${accountId} AND ${transactions.type} = 'income' THEN ${transactions.amount}
          WHEN ${transactions.accountId} = ${accountId} AND ${transactions.type} = 'expense' THEN -${transactions.amount}
          WHEN ${transactions.accountId} = ${accountId} AND ${transactions.type} = 'transfer' THEN -${transactions.amount}
          WHEN ${transactions.toAccountId} = ${accountId} AND ${transactions.type} = 'transfer' THEN ${transactions.amount}
          ELSE 0
        END
      ), 0)`,
    })
    .from(transactions)
    .where(
      sql`(${transactions.accountId} = ${accountId} OR ${transactions.toAccountId} = ${accountId}) ${dateFilter}`,
    )
    .get();

  return account.openingBalance + (row?.delta ?? 0);
}

export function listAccountsWithBalances() {
  return listAccounts().map((account) => ({
    ...account,
    balance: getAccountBalance(account.id),
  }));
}
