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

/**
 * Validates the entry and returns it with both currencies pinned to the
 * accounts they belong to.
 *
 * Currency is a property of the account (decision 6), so it is derived here
 * rather than trusted from the caller — a transaction whose `currency` differed
 * from its account's would make that account's balance a sum of two
 * denominations. A caller may still state it, and a disagreement is an error
 * rather than a silent overwrite.
 */
function normalizeTransaction(entry: NewTransaction): NewTransaction {
  if (!Number.isInteger(entry.amountMinor) || entry.amountMinor <= 0) {
    throw new DomainError("Transaction amount must be greater than zero.");
  }
  assertIsoDate(entry.date);

  const account = getAccountByIdRow(entry.accountId);
  if (!account) {
    throw new DomainError("The source account no longer exists.");
  }
  if (entry.currency != null && entry.currency !== account.currency) {
    throw new DomainError("A transaction must be in its account's currency.");
  }

  if (entry.type === "transfer") {
    if (entry.toAccountId == null || entry.toAccountId === entry.accountId) {
      throw new DomainError("A transfer needs a different destination account.");
    }
    if (entry.categoryId != null) {
      throw new DomainError("Transfers cannot have a category.");
    }
    const toAccount = getAccountByIdRow(entry.toAccountId);
    if (!toAccount) {
      throw new DomainError("The destination account no longer exists.");
    }
    if (entry.toCurrency != null && entry.toCurrency !== toAccount.currency) {
      throw new DomainError("A transfer must land in the destination account's currency.");
    }

    // A cross-currency transfer carries both legs, so the rate that actually
    // applied is implied by the two amounts and never needs a lookup — the
    // truth is what the bank did, not what a daily reference rate says. That
    // makes the incoming amount required, not optional: deriving it from a
    // rate would record a figure the bank never moved. Conversely a
    // same-currency transfer must not carry a second leg, or the two sides
    // could disagree about one movement.
    const crossCurrency = account.currency !== toAccount.currency;
    if (crossCurrency) {
      if (entry.toAmountMinor == null) {
        throw new DomainError(
          "A transfer between accounts in different currencies needs the amount received.",
        );
      }
      if (!Number.isInteger(entry.toAmountMinor) || entry.toAmountMinor <= 0) {
        throw new DomainError("The amount received must be greater than zero.");
      }
    } else if (entry.toAmountMinor != null) {
      throw new DomainError(
        "A transfer between accounts in the same currency moves a single amount.",
      );
    }

    return {
      ...entry,
      currency: account.currency,
      toCurrency: crossCurrency ? toAccount.currency : null,
      toAmountMinor: crossCurrency ? entry.toAmountMinor : null,
    };
  }

  if (entry.toAccountId != null) {
    throw new DomainError("Only transfers can have a destination account.");
  }
  if (entry.toAmountMinor != null || entry.toCurrency != null) {
    throw new DomainError("Only transfers can have a destination amount.");
  }

  const normalized: NewTransaction = { ...entry, currency: account.currency };
  if (entry.categoryId == null) return normalized;

  const category = getCategoryByIdRow(entry.categoryId);
  if (!category) throw new DomainError("The selected category no longer exists.");
  if (category.type !== entry.type) {
    throw new DomainError("The category does not match the transaction type.");
  }
  return normalized;
}

export function getTransactionsPage(params: TransactionsCursorPageParams = {}, pageSize?: number) {
  return listTransactionsByCursor(params, pageSize);
}

export function getTransactionsCount() {
  return countTransactions();
}

/** Whether any transaction has ever been logged — for "getting started" style checks. */
export function getHasAnyTransactions() {
  return getTransactionsCount() > 0;
}

export function getRecentTransactions(limit = 5) {
  return listRecentTransactions(limit);
}

export function createTransaction(entry: NewTransaction) {
  return insertTransaction(normalizeTransaction(entry));
}
