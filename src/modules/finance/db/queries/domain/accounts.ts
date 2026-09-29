import { eq, sql } from "drizzle-orm";
import { getDb } from "@/modules/core/db/client";
import { accounts } from "../../schema/domain/accounts";
import { transactions } from "../../schema/domain/transactions";
import { paiseToRupees, rupeesToPaise } from "../../schema/money";

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
 * Net effect (in paise) of every transaction on each account, in one grouped
 * query: income adds, expense and outgoing transfer subtract (via
 * account_id), incoming transfer adds (via to_account_id). Summed as integers,
 * so balances are exact. `asOfDate` (YYYY-MM-DD) limits it to transactions
 * on/before that date. Never stored — see docs/architecture/data-model.md.
 */
function transactionDeltasByAccount(asOfDate?: string): Map<number, number> {
  const dateFilter = asOfDate ? sql`WHERE date <= ${asOfDate}` : sql``;
  const rows = getDb().all<{ accountId: number; deltaPaise: number }>(sql`
    SELECT account_id AS accountId, SUM(delta) AS deltaPaise FROM (
      SELECT ${transactions.accountId} AS account_id, ${transactions.date} AS date,
        CASE WHEN ${transactions.type} = 'income' THEN ${transactions.amount} ELSE -${transactions.amount} END AS delta
      FROM ${transactions}
      UNION ALL
      SELECT ${transactions.toAccountId}, ${transactions.date}, ${transactions.amount}
      FROM ${transactions}
      WHERE ${transactions.type} = 'transfer' AND ${transactions.toAccountId} IS NOT NULL
    ) ${dateFilter}
    GROUP BY account_id
  `);
  return new Map(rows.map((row) => [row.accountId, Number(row.deltaPaise)]));
}

function balanceOf(openingBalance: number, deltaPaise: number | undefined): number {
  return paiseToRupees(rupeesToPaise(openingBalance) + (deltaPaise ?? 0));
}

/** Balance of one account: opening balance + every transaction touching it.
 * `asOfDate`, when given, gives the point-in-time balance. */
export function getAccountBalance(accountId: number, asOfDate?: string): number {
  const account = getAccountByIdRow(accountId);
  if (!account) return 0;
  return balanceOf(account.openingBalance, transactionDeltasByAccount(asOfDate).get(accountId));
}

export function listAccountsWithBalances(asOfDate?: string) {
  const deltas = transactionDeltasByAccount(asOfDate);
  return listAccounts().map((account) => ({
    ...account,
    balance: balanceOf(account.openingBalance, deltas.get(account.id)),
  }));
}

/** Sum of balances across the given accounts as of a date, computed exactly. */
export function getAccountsTotal(accountIds: number[], asOfDate?: string): number {
  const deltas = transactionDeltasByAccount(asOfDate);
  const ids = new Set(accountIds);
  let totalPaise = 0;
  for (const account of listAccounts()) {
    if (!ids.has(account.id)) continue;
    totalPaise += rupeesToPaise(account.openingBalance) + (deltas.get(account.id) ?? 0);
  }
  return paiseToRupees(totalPaise);
}
