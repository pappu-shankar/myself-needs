import {
  countTransactions,
  insertTransaction,
  listRecentTransactions,
  listTransactionsByCursor,
  type NewTransaction,
  type TransactionsCursorPageParams,
} from "../../db/queries/domain/transactions";
import { getAccountByIdRow } from "../../db/queries/domain/accounts";
import { getCategoryByIdRow } from "../../db/queries/domain/categories";
import { DomainError } from "@/modules/core/errors";

function assertIsoDate(value: unknown): asserts value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new DomainError("Transaction date must be a valid calendar date.");
  }
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new DomainError("Transaction date must be a valid calendar date.");
  }
}

function validateTransaction(entry: NewTransaction): void {
  if (!Number.isFinite(entry.amount) || entry.amount <= 0) {
    throw new DomainError("Transaction amount must be greater than zero.");
  }
  assertIsoDate(entry.date);

  if (!getAccountByIdRow(entry.accountId)) {
    throw new DomainError("The source account no longer exists.");
  }

  if (entry.type === "transfer") {
    if (entry.toAccountId == null || entry.toAccountId === entry.accountId) {
      throw new DomainError("A transfer needs a different destination account.");
    }
    if (entry.categoryId != null) {
      throw new DomainError("Transfers cannot have a category.");
    }
    if (!getAccountByIdRow(entry.toAccountId)) {
      throw new DomainError("The destination account no longer exists.");
    }
    return;
  }

  if (entry.toAccountId != null) {
    throw new DomainError("Only transfers can have a destination account.");
  }
  if (entry.categoryId == null) return;

  const category = getCategoryByIdRow(entry.categoryId);
  if (!category) throw new DomainError("The selected category no longer exists.");
  if (category.type !== entry.type) {
    throw new DomainError("The category does not match the transaction type.");
  }
}

export function getTransactionsPage(params: TransactionsCursorPageParams = {}, pageSize?: number) {
  return listTransactionsByCursor(params, pageSize);
}

/** Whether any transaction has ever been logged — for "getting started" style checks. */
export function getHasAnyTransactions() {
  return hasAnyTransactions();
}

export function getRecentTransactions(limit = 5) {
  return listRecentTransactions(limit);
}

export function createTransaction(entry: NewTransaction) {
  validateTransaction(entry);
  return insertTransaction(entry);
}
