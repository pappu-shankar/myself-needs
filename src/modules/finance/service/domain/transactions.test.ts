import { beforeEach, afterEach, describe, expect, it } from "vitest";
import { setupTestDb, teardownTestDb } from "@/test/db";
import {
  createTransaction,
  getHasAnyTransactions,
  getRecentTransactions,
  getTransactionsPage,
} from "./transactions";
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
      amountMinor: 4550,
      date: "2026-02-01",
      note: "Weekly shop",
    });

    expect(transaction).toMatchObject({
      type: "expense",
      accountId: account.id,
      categoryId: category.id,
      amountMinor: 4550,
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
        amountMinor: 1000,
        date: "2026-02-01",
      }),
    ).toThrow("category does not match");
    expect(() =>
      createTransaction({
        type: "transfer",
        accountId: checking.id,
        toAccountId: savings.id,
        categoryId: expense.id,
        amountMinor: 1000,
        date: "2026-02-01",
      }),
    ).toThrow("Transfers cannot have a category");
    expect(() =>
      createTransaction({
        type: "expense",
        accountId: checking.id,
        categoryId: expense.id,
        amountMinor: 1000,
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
      amountMinor: 2000,
      date: "2026-02-01",
    });
    createTransaction({
      type: "transfer",
      accountId: checking.id,
      toAccountId: savings.id,
      amountMinor: 10000,
      date: "2026-02-02",
    });

    const page = getTransactionsPage();

    expect(page.rows).toHaveLength(2);
    expect(page.hasOlder).toBe(false);
    expect(page.hasNewer).toBe(false);

    const transfer = page.rows.find((r) => r.type === "transfer");
    expect(transfer).toMatchObject({ accountName: "Checking", toAccountName: "Savings" });

    const expense = page.rows.find((r) => r.type === "expense");
    expect(expense).toMatchObject({ accountName: "Checking", categoryName: "Groceries" });
  });

  it("orders the default page newest-first by date then id, and keyset-paginates by 50 per page", () => {
    const account = createAccount({ name: "Checking", type: "checking" });
    const category = createCategory({ name: "Misc", type: "expense" });

    for (let i = 0; i < 55; i++) {
      const day = String((i % 28) + 1).padStart(2, "0");
      createTransaction({
        type: "expense",
        accountId: account.id,
        categoryId: category.id,
        amountMinor: 100,
        date: `2026-01-${day}`,
      });
    }

    const firstPage = getTransactionsPage();
    expect(firstPage.rows).toHaveLength(50);
    expect(firstPage.hasOlder).toBe(true);
    expect(firstPage.hasNewer).toBe(false);

    const dates = firstPage.rows.map((r) => r.date);
    expect(dates).toEqual([...dates].sort().reverse());

    // "Older": cursor on the last row of page 1 fetches the remaining 5, and
    // reports no further page.
    const last = firstPage.rows[firstPage.rows.length - 1];
    const secondPage = getTransactionsPage({ before: { date: last.date, id: last.id } });
    expect(secondPage.rows).toHaveLength(5);
    expect(secondPage.hasOlder).toBe(false);
    expect(secondPage.hasNewer).toBe(true);
    // No overlap and no gap between the two pages.
    const firstPageIds = new Set(firstPage.rows.map((r) => r.id));
    expect(secondPage.rows.every((r) => !firstPageIds.has(r.id))).toBe(true);

    // "Newer": cursor on the first row of page 2 walks back to exactly page 1.
    const secondPageFirst = secondPage.rows[0];
    const backToFirstPage = getTransactionsPage({
      after: { date: secondPageFirst.date, id: secondPageFirst.id },
    });
    expect(backToFirstPage.rows.map((r) => r.id)).toEqual(firstPage.rows.map((r) => r.id));
    expect(backToFirstPage.hasNewer).toBe(false);
    expect(backToFirstPage.hasOlder).toBe(true);
  });

  it("breaks ties on the same date by id, and cursor pagination doesn't skip or duplicate same-date rows", () => {
    const account = createAccount({ name: "Checking", type: "checking" });
    const category = createCategory({ name: "Misc", type: "expense" });

    // All on the same date — id descending is the only thing that can order them.
    const created = Array.from({ length: 5 }, (_, i) =>
      createTransaction({
        type: "expense",
        accountId: account.id,
        categoryId: category.id,
        amountMinor: (i + 1) * 100,
        date: "2026-05-01",
      }),
    );

    const firstPage = getTransactionsPage({}, 3);
    expect(firstPage.rows.map((r) => r.id)).toEqual(
      [...created].map((t) => t.id).sort((a, b) => b - a).slice(0, 3),
    );
    expect(firstPage.hasOlder).toBe(true);

    const last = firstPage.rows[firstPage.rows.length - 1];
    const secondPage = getTransactionsPage({ before: { date: last.date, id: last.id } }, 3);
    expect(secondPage.rows).toHaveLength(2);
    expect(secondPage.hasOlder).toBe(false);

    const allIds = [...firstPage.rows, ...secondPage.rows].map((r) => r.id).sort((a, b) => a - b);
    expect(allIds).toEqual(created.map((t) => t.id).sort((a, b) => a - b));
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
      amountMinor: 2000,
      date: "2026-02-01",
    });
    createTransaction({
      type: "transfer",
      accountId: checking.id,
      toAccountId: savings.id,
      amountMinor: 10000,
      date: "2026-02-02",
    });
    createTransaction({
      type: "income",
      accountId: dad.id,
      categoryId: repayment.id,
      amountMinor: 50000,
      date: "2026-02-03",
    });

    const savingsPage = getTransactionsPage({ accountId: savings.id });
    expect(savingsPage.rows).toHaveLength(1);
    expect(savingsPage.rows[0]).toMatchObject({
      type: "transfer",
      accountName: "Checking",
      toAccountName: "Savings",
    });

    const dadPage = getTransactionsPage({ accountId: dad.id });
    expect(dadPage.rows).toHaveLength(1);
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
        amountMinor: i * 100,
        date: `2026-01-0${i}`,
      });
    }

    expect(getRecentTransactions()).toHaveLength(5);
    expect(getRecentTransactions(3)).toHaveLength(3);

    const mostRecent = getRecentTransactions(1)[0];
    expect(mostRecent).toMatchObject({ date: "2026-01-07", amountMinor: 700 });
  });

  it("getHasAnyTransactions reflects whether anything has ever been logged", () => {
    expect(getHasAnyTransactions()).toBe(false);

    const account = createAccount({ name: "Checking", type: "checking" });
    const category = createCategory({ name: "Misc", type: "expense" });
    createTransaction({
      type: "expense",
      accountId: account.id,
      categoryId: category.id,
      amountMinor: 100,
      date: "2026-01-01",
    });

    expect(getHasAnyTransactions()).toBe(true);
  });

  describe("transfers between currencies", () => {
    it("requires the amount received for a cross-currency transfer and stores both legs", () => {
      const inr = createAccount({ name: "INR", type: "checking" });
      const usd = createAccount({ name: "USD", type: "checking", currency: "USD" });

      expect(() =>
        createTransaction({
          type: "transfer",
          accountId: inr.id,
          toAccountId: usd.id,
          amountMinor: 83000,
          date: "2026-02-01",
        }),
      ).toThrow("needs the amount received");

      const transfer = createTransaction({
        type: "transfer",
        accountId: inr.id,
        toAccountId: usd.id,
        amountMinor: 83000,
        toAmountMinor: 1000,
        date: "2026-02-01",
      });
      expect(transfer).toMatchObject({
        currency: "INR",
        amountMinor: 83000,
        toCurrency: "USD",
        toAmountMinor: 1000,
      });
    });

    it("rejects a second leg on a same-currency transfer", () => {
      const checking = createAccount({ name: "Checking", type: "checking" });
      const savings = createAccount({ name: "Savings", type: "savings" });

      expect(() =>
        createTransaction({
          type: "transfer",
          accountId: checking.id,
          toAccountId: savings.id,
          amountMinor: 10000,
          toAmountMinor: 10000,
          date: "2026-02-01",
        }),
      ).toThrow("moves a single amount");
    });
  });
});
