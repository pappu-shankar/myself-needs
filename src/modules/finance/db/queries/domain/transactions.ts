import { and, asc, count, desc, eq, gt, lt, or } from "drizzle-orm";
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

/** Position in the `(date DESC, id DESC)` ordering that keyset pagination pages around. */
export interface TransactionsCursor {
  date: string;
  id: number;
}

export interface TransactionsCursorPageParams extends TransactionsPageFilters {
  /** Fetch the page strictly older than this cursor (paging forward in time-desc order). */
  before?: TransactionsCursor;
  /** Fetch the page strictly newer than this cursor (paging back toward the top). Mutually exclusive with `before`. */
  after?: TransactionsCursor;
}

export interface TransactionRow {
  id: number;
  type: "income" | "expense" | "transfer";
  accountId: number;
  accountName: string | null;
  toAccountId: number | null;
  toAccountName: string | null;
  categoryId: number | null;
  categoryName: string | null;
  amount: number;
  date: string;
  note: string | null;
}

export interface TransactionsCursorPage {
  /** Always in `(date DESC, id DESC)` order regardless of which cursor was used to fetch it. */
  rows: TransactionRow[];
  /** Whether an "Older" link should be shown. */
  hasOlder: boolean;
  /** Whether a "Newer" link should be shown. */
  hasNewer: boolean;
}

function baseSelectQuery() {
  return getDb()
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
    .leftJoin(categories, eq(transactions.categoryId, categories.id));
}

function accountFilterCondition(filters: TransactionsPageFilters) {
  return filters.accountId != null
    ? or(
        eq(transactions.accountId, filters.accountId),
        eq(transactions.toAccountId, filters.accountId),
      )
    : undefined;
}

/** Strictly after `cursor` in `(date ASC, id ASC)` order — i.e. strictly before it in `(date DESC, id DESC)` order. */
function afterCursor(cursor: TransactionsCursor) {
  return or(
    gt(transactions.date, cursor.date),
    and(eq(transactions.date, cursor.date), gt(transactions.id, cursor.id)),
  );
}

/** Strictly before `cursor` in `(date DESC, id DESC)` order. */
function beforeCursor(cursor: TransactionsCursor) {
  return or(
    lt(transactions.date, cursor.date),
    and(eq(transactions.date, cursor.date), lt(transactions.id, cursor.id)),
  );
}

/**
 * Keyset (cursor) pagination ordered by `(date DESC, id DESC)` — never
 * "fetch everything and slice in JS", and unlike offset pagination a page
 * stays stable while new transactions are added ahead of it. Fetches one
 * extra row past `pageSize` to know whether another page exists without a
 * separate COUNT query. See docs/architecture/data-model.md.
 */
export function listTransactionsByCursor(
  params: TransactionsCursorPageParams,
  pageSize = 50,
): TransactionsCursorPage {
  const accountCond = accountFilterCondition(params);

  if (params.after) {
    // Walking toward the top: fetch ascending (the immediate next-newer rows),
    // then reverse back to the standard newest-first display order.
    const rows = baseSelectQuery()
      .where(and(accountCond, afterCursor(params.after)))
      .orderBy(asc(transactions.date), asc(transactions.id))
      .limit(pageSize + 1)
      .all();
    const hasNewer = rows.length > pageSize;
    return { rows: rows.slice(0, pageSize).reverse(), hasOlder: true, hasNewer };
  }

  if (params.before) {
    const rows = baseSelectQuery()
      .where(and(accountCond, beforeCursor(params.before)))
      .orderBy(desc(transactions.date), desc(transactions.id))
      .limit(pageSize + 1)
      .all();
    const hasOlder = rows.length > pageSize;
    return { rows: rows.slice(0, pageSize), hasOlder, hasNewer: true };
  }

  const rows = baseSelectQuery()
    .where(accountCond)
    .orderBy(desc(transactions.date), desc(transactions.id))
    .limit(pageSize + 1)
    .all();
  const hasOlder = rows.length > pageSize;
  return { rows: rows.slice(0, pageSize), hasOlder, hasNewer: false };
}

/** Total transaction count (optionally filtered) — a separate, cheap COUNT query, decoupled from any page's LIMIT/OFFSET. */
export function countTransactions(filters: TransactionsPageFilters = {}): number {
  return (
    getDb()
      .select({ value: count() })
      .from(transactions)
      .where(accountFilterCondition(filters))
      .get()?.value ?? 0
  );
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
