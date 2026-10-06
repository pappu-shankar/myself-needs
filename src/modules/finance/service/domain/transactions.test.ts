import { beforeEach, afterEach, describe, expect, it } from "vitest";
import { setupTestDb, teardownTestDb } from "@/test/db";
import {
  correctTransaction,
  createTransaction,
  getHasAnyTransactions,
  getRecentTransactions,
  getTransaction,
  getTransactionCorrectionTrail,
  getTransactionsPage,
  voidTransaction,
} from "./transactions";
import { getAccountBalanceMinor } from "../../db/queries/domain/accounts";
import { createRecurringRule } from "./recurring";
import { listLoggedPeriodStartsForRule } from "../../db/queries/domain/recurring";
import { todayIso } from "@/lib/dates";
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
      [...created]
        .map((t) => t.id)
        .sort((a, b) => b - a)
        .slice(0, 3),
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

describe("void and correct", () => {
  function setup() {
    const checking = createAccount({ name: "Checking", type: "checking" });
    const savings = createAccount({ name: "Savings", type: "savings" });
    const groceries = createCategory({ name: "Groceries", type: "expense" });
    const salary = createCategory({ name: "Salary", type: "income" });
    return { checking, savings, groceries, salary };
  }

  it("voids a transaction, keeps it readable with its reason, and drops it from the balance", () => {
    const { checking, groceries } = setup();
    const entry = createTransaction({
      type: "expense",
      accountId: checking.id,
      categoryId: groceries.id,
      amountMinor: 50000,
      date: "2026-02-01",
    });
    expect(getAccountBalanceMinor(checking.id)).toBe(-50000);

    const voided = voidTransaction(entry.id, "  Duplicate of the card charge  ");
    expect(voided.voidedAt).toBe(todayIso());
    // Trimmed, so a reason of nothing but whitespace can't pass as stated.
    expect(voided.voidReason).toBe("Duplicate of the card charge");
    expect(voided.supersededById).toBeNull();

    expect(getAccountBalanceMinor(checking.id)).toBe(0);
    expect(getTransactionsPage().rows).toEqual([]);
    const trail = getTransactionsPage({ includeVoided: true }).rows;
    expect(trail).toHaveLength(1);
    expect(trail[0]).toMatchObject({
      id: entry.id,
      voidReason: "Duplicate of the card charge",
      supersededById: null,
    });
  });

  it("refuses a void with no stated reason, and a second void of the same row", () => {
    const { checking, groceries } = setup();
    const entry = createTransaction({
      type: "expense",
      accountId: checking.id,
      categoryId: groceries.id,
      amountMinor: 50000,
      date: "2026-02-01",
    });

    expect(() => voidTransaction(entry.id, "   ")).toThrow("Say why");
    expect(() => voidTransaction(entry.id + 999, "gone")).toThrow("no longer exists");

    voidTransaction(entry.id, "Wrong account");
    expect(() => voidTransaction(entry.id, "Wrong account again")).toThrow("already been reversed");
    // The first reason stands rather than being overwritten by the second try.
    expect(getTransaction(entry.id)?.voidReason).toBe("Wrong account");
  });

  it("corrects a typo so the balance equals what the right row would have given", () => {
    const { checking, groceries } = setup();
    const wrong = createTransaction({
      type: "expense",
      accountId: checking.id,
      categoryId: groceries.id,
      amountMinor: 500000, // 5,000 typed instead of 500
      date: "2026-02-01",
      note: "Weekly shop",
    });

    const { voided, replacement } = correctTransaction(
      wrong.id,
      {
        type: "expense",
        accountId: checking.id,
        categoryId: groceries.id,
        amountMinor: 50000,
        date: "2026-02-01",
        note: "Weekly shop",
      },
      "Amount typed with an extra zero",
    );

    // The whole point: the number lands where it would have had the right row
    // been entered first, with no trace of the mistake in the figure.
    expect(getAccountBalanceMinor(checking.id)).toBe(-50000);
    expect(replacement.amountMinor).toBe(50000);
    expect(replacement.voidedAt).toBeNull();

    // The link points forward, from the mistake to the fix, on the voided row.
    expect(voided.supersededById).toBe(replacement.id);
    expect(voided.voidedAt).toBe(todayIso());
    expect(replacement.supersededById).toBeNull();

    const live = getTransactionsPage().rows;
    expect(live.map((row) => row.id)).toEqual([replacement.id]);
    const trail = getTransactionCorrectionTrail(wrong.id);
    expect(trail?.row.id).toBe(wrong.id);
    expect(trail?.row.voidReason).toBe("Amount typed with an extra zero");
    expect(trail?.replacement?.id).toBe(replacement.id);
    // Nothing follows the replacement, so the chain ends there.
    expect(getTransactionCorrectionTrail(replacement.id)?.replacement).toBeNull();
  });

  it("moves both accounts back when a corrected transfer changes amount", () => {
    const { checking, savings } = setup();
    const wrong = createTransaction({
      type: "transfer",
      accountId: checking.id,
      toAccountId: savings.id,
      amountMinor: 900000,
      date: "2026-02-01",
    });
    expect(getAccountBalanceMinor(checking.id)).toBe(-900000);
    expect(getAccountBalanceMinor(savings.id)).toBe(900000);

    correctTransaction(
      wrong.id,
      {
        type: "transfer",
        accountId: checking.id,
        toAccountId: savings.id,
        amountMinor: 90000,
        date: "2026-02-01",
      },
      "Transferred 900, not 9,000",
    );

    // Both legs of the UNION must have honoured the void, or the destination
    // keeps the 9,000 it was never actually sent.
    expect(getAccountBalanceMinor(checking.id)).toBe(-90000);
    expect(getAccountBalanceMinor(savings.id)).toBe(90000);
  });

  it("runs the replacement through the same validation a create would", () => {
    const { checking, groceries, salary } = setup();
    const entry = createTransaction({
      type: "expense",
      accountId: checking.id,
      categoryId: groceries.id,
      amountMinor: 50000,
      date: "2026-02-01",
    });

    // A category of the wrong type is refused for a correction exactly as it
    // is for a create — a correction is not a side door past the rules.
    expect(() =>
      correctTransaction(
        entry.id,
        {
          type: "expense",
          accountId: checking.id,
          categoryId: salary.id,
          amountMinor: 50000,
          date: "2026-02-01",
        },
        "Wrong category",
      ),
    ).toThrow("category does not match");

    // And the refusal rolled the void back with it: a voided row with no
    // replacement would be a reversal the user never asked for.
    expect(getTransaction(entry.id)?.voidedAt).toBeNull();
    expect(getAccountBalanceMinor(checking.id)).toBe(-50000);
  });

  it("refuses to fork a chain, reuse an id, or be born reversed", () => {
    const { checking, groceries } = setup();
    const first = createTransaction({
      type: "expense",
      accountId: checking.id,
      categoryId: groceries.id,
      amountMinor: 50000,
      date: "2026-02-01",
    });
    const replacementEntry = {
      type: "expense" as const,
      accountId: checking.id,
      categoryId: groceries.id,
      amountMinor: 40000,
      date: "2026-02-01",
    };

    expect(() =>
      correctTransaction(first.id, { ...replacementEntry, id: first.id }, "self"),
    ).toThrow("cannot reuse an existing id");
    expect(() =>
      correctTransaction(first.id, { ...replacementEntry, voidedAt: "2026-02-02" }, "pre-voided"),
    ).toThrow("already reversed");
    expect(() => correctTransaction(first.id, replacementEntry, "  ")).toThrow("Say why");

    const { replacement } = correctTransaction(first.id, replacementEntry, "Wrong amount");

    // Correcting the already-corrected row again would leave two rows claiming
    // to replace it, so the trail would no longer read as one chain.
    expect(() => correctTransaction(first.id, replacementEntry, "again")).toThrow(
      "already been corrected",
    );
    // Correcting the replacement is the supported way to keep going.
    const second = correctTransaction(
      replacement.id,
      { ...replacementEntry, amountMinor: 30000 },
      "Still wrong",
    );
    expect(second.voided.supersededById).toBe(second.replacement.id);
    expect(getAccountBalanceMinor(checking.id)).toBe(-30000);
  });

  it("corrects a recurring-generated transaction in place, keeping its period", () => {
    const { checking, groceries } = setup();
    const rule = createRecurringRule({
      type: "expense",
      accountId: checking.id,
      categoryId: groceries.id,
      amountMinor: 250000,
      frequency: "monthly",
      startDate: "2026-01-01",
    });
    const confirmed = createTransaction({
      type: "expense",
      accountId: checking.id,
      categoryId: groceries.id,
      amountMinor: 250000,
      date: "2026-01-01",
      recurringRuleId: rule.id,
      periodStart: "2026-01-01",
    });

    // Before migration 0030 this was impossible: the partial unique index on
    // (recurring_rule_id, period_start) did not exclude voided rows, so the
    // replacement collided with the very row it replaced. The index now carries
    // `AND voided_at IS NULL`.
    const { voided, replacement } = correctTransaction(
      confirmed.id,
      {
        type: "expense",
        accountId: checking.id,
        categoryId: groceries.id,
        amountMinor: 260000,
        date: "2026-01-01",
        recurringRuleId: rule.id,
        periodStart: "2026-01-01",
      },
      "Rent went up",
    );

    expect(voided.voidedAt).toBe(todayIso());
    expect(voided.supersededById).toBe(replacement.id);
    expect(getAccountBalanceMinor(checking.id)).toBe(-260000);

    // The period stays confirmed: the correction keeps the link, so the due
    // worklist must not offer the period again mid-correction.
    expect(listLoggedPeriodStartsForRule(rule.id)).toEqual(["2026-01-01"]);
  });

  it("returns a voided period to the due worklist when nothing replaces it", () => {
    const { checking, groceries } = setup();
    const rule = createRecurringRule({
      type: "expense",
      accountId: checking.id,
      categoryId: groceries.id,
      amountMinor: 250000,
      frequency: "monthly",
      startDate: "2026-01-01",
    });
    const confirmed = createTransaction({
      type: "expense",
      accountId: checking.id,
      categoryId: groceries.id,
      amountMinor: 250000,
      date: "2026-01-01",
      recurringRuleId: rule.id,
      periodStart: "2026-01-01",
    });
    expect(listLoggedPeriodStartsForRule(rule.id)).toEqual(["2026-01-01"]);

    voidTransaction(confirmed.id, "Never actually paid");

    // A reversed confirmation must stop occupying the slot, or the period is
    // reported as settled forever and can neither be re-confirmed nor flagged.
    expect(listLoggedPeriodStartsForRule(rule.id)).toEqual([]);

    // And re-confirming it works, which the old index predicate prevented.
    const again = createTransaction({
      type: "expense",
      accountId: checking.id,
      categoryId: groceries.id,
      amountMinor: 250000,
      date: "2026-01-05",
      recurringRuleId: rule.id,
      periodStart: "2026-01-01",
    });
    expect(again.id).not.toBe(confirmed.id);
    expect(listLoggedPeriodStartsForRule(rule.id)).toEqual(["2026-01-01"]);
  });
});
