import {
  insertTransaction,
  listRecentTransactions,
  listTransactionsPage,
  type NewTransaction,
  type TransactionsPageFilters,
} from "../../db/queries/domain/transactions";

export function getTransactionsPage(page: number, filters?: TransactionsPageFilters) {
  return listTransactionsPage(page, undefined, filters);
}

export function getRecentTransactions(limit = 5) {
  return listRecentTransactions(limit);
}

export function createTransaction(entry: NewTransaction) {
  return insertTransaction(entry);
}
