import {
  getAccountByIdRow,
  getAccountBalance,
  insertAccount,
  listAccountsWithBalances,
  type NewAccount,
} from "../../db/queries/domain/accounts";

/**
 * Sign convention: asset accounts (checking/savings/cash/investment/receivable)
 * carry a positive balance; liability accounts (credit_card/loan) carry a *negative*
 * balance representing the amount owed. This means `getTotalBalance` sums
 * correctly to a net figure with no special-casing, and a "payment" toward a
 * liability is simply a transfer into it (adding a positive amount moves a
 * negative balance toward zero) while a "charge" is an expense against it
 * (subtracting moves it further negative). `createAccount` below negates
 * `openingBalance` for liability types so callers always pass a positive
 * "amount owed" and the stored sign convention stays consistent.
 */
const LIABILITY_TYPES = new Set(["credit_card", "loan"]);

export function getAccounts() {
  return listAccountsWithBalances();
}

export function getAccountBalanceById(id: number, asOfDate?: string) {
  return getAccountBalance(id, asOfDate);
}

export function getTotalBalance() {
  return listAccountsWithBalances()
    .filter((a) => !a.excludeFromNetWorth)
    .reduce((sum, a) => sum + a.balance, 0);
}

export function getAccount(id: number) {
  return getAccountByIdRow(id) ?? null;
}

export function createAccount(entry: NewAccount) {
  const openingBalance = entry.openingBalance ?? 0;
  const normalized: NewAccount = {
    ...entry,
    openingBalance: LIABILITY_TYPES.has(entry.type) ? -Math.abs(openingBalance) : openingBalance,
  };
  return insertAccount(normalized);
}
