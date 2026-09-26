import { beforeEach, afterEach, describe, expect, it } from "vitest";
import { setupTestDb, teardownTestDb } from "@/test/db";
import {
  createAccount,
  getAccount,
  getAccountBalanceById,
  getAccounts,
  getTotalBalance,
} from "./accounts";
import { createTransaction } from "./transactions";
import { createCategory } from "./categories";

beforeEach(setupTestDb);
afterEach(teardownTestDb);

describe("accounts service", () => {
  it("stores an asset account's opening balance as given", () => {
    const account = createAccount({ name: "Checking", type: "checking", openingBalance: 1000 });

    expect(account.openingBalance).toBe(1000);
  });

  it("negates a liability account's opening balance so it's stored as amount owed (negative)", () => {
    const creditCard = createAccount({
      name: "Credit Card",
      type: "credit_card",
      openingBalance: 500,
    });
    const loan = createAccount({ name: "Home Loan", type: "loan", openingBalance: 200000 });

    expect(creditCard.openingBalance).toBe(-500);
    expect(loan.openingBalance).toBe(-200000);
  });

  it("defaults opening balance to 0 when omitted", () => {
    const account = createAccount({ name: "Cash", type: "cash" });
    expect(account.openingBalance).toBe(0);
  });

  it("computes account balance as opening balance plus income/expense/transfer effects", () => {
    const checking = createAccount({ name: "Checking", type: "checking", openingBalance: 1000 });
    const savings = createAccount({ name: "Savings", type: "savings", openingBalance: 0 });
    const salary = createCategory({ name: "Salary", type: "income" });
    const groceries = createCategory({ name: "Groceries", type: "expense" });

    createTransaction({
      type: "income",
      accountId: checking.id,
      categoryId: salary.id,
      amount: 500,
      date: "2026-01-05",
    });
    createTransaction({
      type: "expense",
      accountId: checking.id,
      categoryId: groceries.id,
      amount: 200,
      date: "2026-01-10",
    });
    createTransaction({
      type: "transfer",
      accountId: checking.id,
      toAccountId: savings.id,
      amount: 300,
      date: "2026-01-15",
    });

    expect(getAccountBalanceById(checking.id)).toBe(1000 + 500 - 200 - 300);
    expect(getAccountBalanceById(savings.id)).toBe(300);
  });

  it("restricts asOfDate balance to transactions on or before that date", () => {
    const checking = createAccount({ name: "Checking", type: "checking", openingBalance: 0 });
    const salary = createCategory({ name: "Salary", type: "income" });

    createTransaction({
      type: "income",
      accountId: checking.id,
      categoryId: salary.id,
      amount: 100,
      date: "2026-01-05",
    });
    createTransaction({
      type: "income",
      accountId: checking.id,
      categoryId: salary.id,
      amount: 50,
      date: "2026-01-20",
    });

    expect(getAccountBalanceById(checking.id, "2026-01-05")).toBe(100);
    expect(getAccountBalanceById(checking.id, "2026-01-19")).toBe(100);
    expect(getAccountBalanceById(checking.id)).toBe(150);
  });

  it("returns 0 for an unknown account id", () => {
    expect(getAccountBalanceById(999)).toBe(0);
  });

  it("sums asset and liability balances into a signed net total", () => {
    const checking = createAccount({ name: "Checking", type: "checking", openingBalance: 1000 });
    createAccount({ name: "Credit Card", type: "credit_card", openingBalance: 300 });

    expect(getTotalBalance()).toBe(1000 - 300);
    void checking;
  });

  it("lists accounts with computed balances, sorted by name", () => {
    createAccount({ name: "Zeta", type: "cash", openingBalance: 10 });
    createAccount({ name: "Alpha", type: "cash", openingBalance: 20 });

    const accounts = getAccounts();

    expect(accounts.map((a) => a.name)).toEqual(["Alpha", "Zeta"]);
    expect(accounts.map((a) => a.balance)).toEqual([20, 10]);
  });

  it("fetches an account by id, or null when missing", () => {
    const created = createAccount({ name: "Checking", type: "checking", openingBalance: 100 });

    expect(getAccount(created.id)).toMatchObject({ name: "Checking", openingBalance: 100 });
    expect(getAccount(created.id + 999)).toBeNull();
  });
});
