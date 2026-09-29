import { beforeEach, afterEach, describe, expect, it } from "vitest";
import { setupTestDb, teardownTestDb } from "@/test/db";
import { createTransaction, getRecentTransactions, getTransactionsPage } from "./transactions";
import { createAccount } from "./accounts";
import { createCategory } from "./categories";

beforeEach(setupTestDb);
afterEach(teardownTestDb);

describe("transactions service", () => {
  it("creates a transaction and returns the persisted row", () => {
    const account = createAccount({ name: "Checking", type: "checking" });
    const category = createCategory({ name: "Groceries", type: "expense" });

    const transaction = createTransaction({
      type: "expense",
      accountId: account.id,
      categoryId: category.id,
      amount: 45.5,
      date: "2026-02-01",
      note: "Weekly shop",
    });

    expect(transaction).toMatchObject({
      type: "expense",
      accountId: account.id,
      categoryId: category.id,
      amount: 45.5,
      note: "Weekly shop",
    });
  });

  it("rejects transaction states that violate finance invariants", () => {
    const checking = createAccount({ name: "Checking", type: "checking" });
    const savings = createAccount({ name: "Savings", type: "savings" });
    const income = createCategory({ name: "Salary", type: "income" });
    const expense = createCategory({ name: "Groceries", type: "expense" });

    expect(() =>
      createTransaction({
        type: "expense",
        accountId: checking.id,
        categoryId: income.id,
        amount: 10,
        date: "2026-02-01",
      }),
    ).toThrow("category does not match");
    expect(() =>
      createTransaction({
        type: "transfer",
        accountId: checking.id,
        toAccountId: savings.id,
        categoryId: expense.id,
        amount: 10,
        date: "2026-02-01",
      }),
    ).toThrow("Transfers cannot have a category");
    expect(() =>
      createTransaction({
        type: "expense",
        accountId: checking.id,
        categoryId: expense.id,
        amount: 10,
        date: "2026-02-31",
      }),
    ).toThrow("valid calendar date");
  });

  it("joins account, transfer destination account, and category names for a page of transactions", () => {
    const checking = createAccount({ name: "Checking", type: "checking" });
    const savings = createAccount({ name: "Savings", type: "savings" });
    const groceries = createCategory({ name: "Groceries", type: "expense" });

    createTransaction({
      type: "expense",
      accountId: checking.id,
      categoryId: groceries.id,
      amount: 20,
      date: "2026-02-01",
    });
    createTransaction({
      type: "transfer",
      accountId: checking.id,
      toAccountId: savings.id,
      amount: 100,
      date: "2026-02-02",
    });

    const page = getTransactionsPage(0);

    expect(page.total).toBe(2);
    expect(page.page).toBe(0);
    expect(page.rows).toHaveLength(2);

    const transfer = page.rows.find((r) => r.type === "transfer");
    expect(transfer).toMatchObject({ accountName: "Checking", toAccountName: "Savings" });

    const expense = page.rows.find((r) => r.type === "expense");
    expect(expense).toMatchObject({ accountName: "Checking", categoryName: "Groceries" });
  });

  it("orders a page newest-first by date then id, and paginates by 50 per page", () => {
    const account = createAccount({ name: "Checking", type: "checking" });
    const category = createCategory({ name: "Misc", type: "expense" });

    for (let i = 0; i < 55; i++) {
      const day = String((i % 28) + 1).padStart(2, "0");
      createTransaction({
        type: "expense",
        accountId: account.id,
        categoryId: category.id,
        amount: 1,
        date: `2026-01-${day}`,
      });
    }

    const firstPage = getTransactionsPage(0);
    const secondPage = getTransactionsPage(1);

    expect(firstPage.total).toBe(55);
    expect(firstPage.rows).toHaveLength(50);
    expect(secondPage.rows).toHaveLength(5);

    const dates = firstPage.rows.map((r) => r.date);
    const sortedDesc = [...dates].sort().reverse();
    expect(dates).toEqual(sortedDesc);
  });

  it("filters a page to just one account's transactions, matching either side of a transfer", () => {
    const checking = createAccount({ name: "Checking", type: "checking" });
    const savings = createAccount({ name: "Savings", type: "savings" });
    const dad = createAccount({ name: "Accounts receivable — Dad", type: "receivable" });
    const groceries = createCategory({ name: "Groceries", type: "expense" });
    const repayment = createCategory({ name: "Repayment", type: "income" });

    createTransaction({
      type: "expense",
      accountId: checking.id,
      categoryId: groceries.id,
      amount: 20,
      date: "2026-02-01",
    });
    createTransaction({
      type: "transfer",
      accountId: checking.id,
      toAccountId: savings.id,
      amount: 100,
      date: "2026-02-02",
    });
    createTransaction({
      type: "income",
      accountId: dad.id,
      categoryId: repayment.id,
      amount: 500,
      date: "2026-02-03",
    });

    const savingsPage = getTransactionsPage(0, { accountId: savings.id });
    expect(savingsPage.total).toBe(1);
    expect(savingsPage.rows).toHaveLength(1);
    expect(savingsPage.rows[0]).toMatchObject({
      type: "transfer",
      accountName: "Checking",
      toAccountName: "Savings",
    });

    const dadPage = getTransactionsPage(0, { accountId: dad.id });
    expect(dadPage.total).toBe(1);
    expect(dadPage.rows[0]).toMatchObject({ accountName: "Accounts receivable — Dad" });
  });

  it("returns the most recent transactions up to the given limit, default 5", () => {
    const account = createAccount({ name: "Checking", type: "checking" });
    const category = createCategory({ name: "Misc", type: "expense" });

    for (let i = 1; i <= 7; i++) {
      createTransaction({
        type: "expense",
        accountId: account.id,
        categoryId: category.id,
        amount: i,
        date: `2026-01-0${i}`,
      });
    }

    expect(getRecentTransactions()).toHaveLength(5);
    expect(getRecentTransactions(3)).toHaveLength(3);

    const mostRecent = getRecentTransactions(1)[0];
    expect(mostRecent).toMatchObject({ date: "2026-01-07", amount: 7 });
  });
});
