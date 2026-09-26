import { desc, eq, or, count } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import { getDb } from "@/modules/core/db/client";
import { transactions } from "../../schema/domain/transactions";
import { accounts } from "../../schema/domain/accounts";
import { categories } from "../../schema/domain/categories";

export type NewTransaction = typeof transactions.$inferInsert;

const toAccount = alias(accounts, "to_account");

export interface TransactionsPageFilters {
  /** Matches either side of a transfer, not just the source, so an account's history shows money in and out. */
  accountId?: number;
}

/** Paginated, joined with account/category names for display — never
 * "fetch everything and slice in JS". See docs/architecture/data-model.md. */
export function listTransactionsPage(
  page: number,
  pageSize = 50,
  filters: TransactionsPageFilters = {},
) {
  const where =
    filters.accountId != null
      ? or(
          eq(transactions.accountId, filters.accountId),
          eq(transactions.toAccountId, filters.accountId),
        )
      : undefined;

  const rows = getDb()
    .select({
      id: transactions.id,
      type: transactions.type,
      accountId: transactions.accountId,
      accountName: accounts.name,
      toAccountId: transactions.toAccountId,
      toAccountName: toAccount.name,
      categoryId: transactions.categoryId,
      categoryName: categories.name,
      amount: transactions.amount,
      date: transactions.date,
      note: transactions.note,
    })
    .from(transactions)
    .leftJoin(accounts, eq(transactions.accountId, accounts.id))
    .leftJoin(toAccount, eq(transactions.toAccountId, toAccount.id))
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(where)
    .orderBy(desc(transactions.date), desc(transactions.id))
    .limit(pageSize)
    .offset(page * pageSize)
    .all();

  const total =
    getDb().select({ value: count() }).from(transactions).where(where).get()?.value ?? 0;

  return { rows, total, page, pageSize };
}

export function listRecentTransactions(limit = 5) {
  return getDb()
    .select({
      id: transactions.id,
      type: transactions.type,
      accountName: accounts.name,
      categoryName: categories.name,
      amount: transactions.amount,
      date: transactions.date,
    })
    .from(transactions)
    .leftJoin(accounts, eq(transactions.accountId, accounts.id))
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .orderBy(desc(transactions.date), desc(transactions.id))
    .limit(limit)
    .all();
}

export function insertTransaction(entry: NewTransaction) {
  return getDb().insert(transactions).values(entry).returning().get();
}
