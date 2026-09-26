import { beforeEach, afterEach, describe, expect, it } from "vitest";
import { setupTestDb, teardownTestDb } from "@/test/db";
import { getFinanceSnapshot } from "./snapshot";
import {
  implausibleBalanceRule,
  duplicateTransactionsRule,
  uncategorizedTransactionsRule,
  staleValuationRule,
  recurringPileupRule,
} from "./auditor";
import { createAccount } from "../accounts";
import { createCategory } from "../categories";
import { createTransaction } from "../transactions";
import { createHolding, createValuation } from "../investments";
import { createRecurringRule } from "../recurring";

beforeEach(setupTestDb);
afterEach(teardownTestDb);

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}
function daysAgo(n: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return isoDate(d);
}
function monthsAgo(n: number) {
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() - n);
  return isoDate(d);
}
function todayStr() {
  return isoDate(new Date());
}

describe("implausibleBalanceRule", () => {
  it("fires for a cash account driven negative by transactions", () => {
    const wallet = createAccount({ name: "Wallet", type: "cash", openingBalance: 0 });
    const category = createCategory({ name: "Misc", type: "expense" });
    createTransaction({
      type: "expense",
      accountId: wallet.id,
      categoryId: category.id,
      amount: 50,
      date: todayStr(),
    });

    const insights = implausibleBalanceRule(getFinanceSnapshot());

    expect(insights).toEqual([
      expect.objectContaining({ id: `implausible-balance:${wallet.id}`, severity: "warning" }),
    ]);
  });

  it("does not fire for a positive-balance cash account", () => {
    createAccount({ name: "Wallet", type: "cash", openingBalance: 100 });
    expect(implausibleBalanceRule(getFinanceSnapshot())).toHaveLength(0);
  });
});

describe("duplicateTransactionsRule", () => {
  it("fires for two transactions matching account, amount, date, and type", () => {
    const account = createAccount({ name: "Checking", type: "checking" });
    const category = createCategory({ name: "Rent", type: "expense" });
    createTransaction({
      type: "expense",
      accountId: account.id,
      categoryId: category.id,
      amount: 15000,
      date: todayStr(),
    });
    createTransaction({
      type: "expense",
      accountId: account.id,
      categoryId: category.id,
      amount: 15000,
      date: todayStr(),
    });

    const insights = duplicateTransactionsRule(getFinanceSnapshot());

    expect(insights).toHaveLength(1);
    expect(insights[0].id).toBe(`duplicate-transaction:${account.id}:15000:${todayStr()}`);
  });

  it("does not fire for a single transaction", () => {
    const account = createAccount({ name: "Checking", type: "checking" });
    const category = createCategory({ name: "Rent", type: "expense" });
    createTransaction({
      type: "expense",
      accountId: account.id,
      categoryId: category.id,
      amount: 15000,
      date: todayStr(),
    });

    expect(duplicateTransactionsRule(getFinanceSnapshot())).toHaveLength(0);
  });
});

describe("uncategorizedTransactionsRule", () => {
  it("fires once, counting every uncategorized income/expense transaction", () => {
    const account = createAccount({ name: "Checking", type: "checking" });
    createTransaction({ type: "expense", accountId: account.id, amount: 20, date: todayStr() });
    createTransaction({ type: "income", accountId: account.id, amount: 30, date: todayStr() });

    const insights = uncategorizedTransactionsRule(getFinanceSnapshot());

    expect(insights).toEqual([expect.objectContaining({ id: "uncategorized-transactions:2" })]);
  });

  it("excludes transfers, so an uncategorized transfer alone does not fire", () => {
    const checking = createAccount({ name: "Checking", type: "checking" });
    const savings = createAccount({ name: "Savings", type: "savings" });
    createTransaction({
      type: "transfer",
      accountId: checking.id,
      toAccountId: savings.id,
      amount: 100,
      date: todayStr(),
    });

    expect(uncategorizedTransactionsRule(getFinanceSnapshot())).toHaveLength(0);
  });
});

describe("staleValuationRule", () => {
  it("fires with a :never id for a valuation-basis holding with no valuation recorded", () => {
    const holding = createHolding({ type: "equity", name: "Acme Corp" });

    const insights = staleValuationRule(getFinanceSnapshot());

    expect(insights).toEqual([
      expect.objectContaining({ id: `stale-valuation:${holding.id}:never` }),
    ]);
  });

  it("fires when the latest valuation is older than the stale-valuation threshold (default 90 days)", () => {
    const holding = createHolding({ type: "equity", name: "Acme Corp" });
    createValuation({ holdingId: holding.id, date: daysAgo(120), pricePerUnit: 50 });

    const insights = staleValuationRule(getFinanceSnapshot());

    expect(insights).toEqual([
      expect.objectContaining({ id: `stale-valuation:${holding.id}:${daysAgo(120)}` }),
    ]);
  });

  it("does not fire when the latest valuation is recent", () => {
    const holding = createHolding({ type: "equity", name: "Acme Corp" });
    createValuation({ holdingId: holding.id, date: daysAgo(10), pricePerUnit: 50 });

    expect(staleValuationRule(getFinanceSnapshot())).toHaveLength(0);
  });
});

describe("recurringPileupRule", () => {
  it("fires once unconfirmed due periods reach the pileup threshold (default 3)", () => {
    const account = createAccount({ name: "Checking", type: "checking" });
    const category = createCategory({ name: "Rent", type: "expense" });
    const rule = createRecurringRule({
      type: "expense",
      accountId: account.id,
      categoryId: category.id,
      amount: 1000,
      frequency: "monthly",
      startDate: monthsAgo(6),
    });

    const insights = recurringPileupRule(getFinanceSnapshot());

    expect(insights).toHaveLength(1);
    expect(insights[0].id).toMatch(new RegExp(`^recurring-pileup:${rule.id}:`));
  });

  it("does not fire below the threshold", () => {
    const account = createAccount({ name: "Checking", type: "checking" });
    const category = createCategory({ name: "Rent", type: "expense" });
    createRecurringRule({
      type: "expense",
      accountId: account.id,
      categoryId: category.id,
      amount: 1000,
      frequency: "monthly",
      startDate: monthsAgo(1),
    });

    expect(recurringPileupRule(getFinanceSnapshot())).toHaveLength(0);
  });
});
