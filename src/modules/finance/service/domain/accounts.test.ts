import { beforeEach, afterEach, describe, expect, it } from "vitest";
import { setupTestDb, teardownTestDb } from "@/test/db";
import {
  createAccount,
  getAccount,
  getAccountBalanceMinorById,
  getAccountTerms,
  getAccounts,
  getNetWorth,
  getNetWorthByCurrency,
} from "./accounts";
import { createTransaction } from "./transactions";
import { createCategory } from "./categories";

beforeEach(setupTestDb);
afterEach(teardownTestDb);

describe("accounts service", () => {
  it("stores an asset account's opening balance as given", () => {
    const account = createAccount({
      name: "Checking",
      type: "checking",
      openingBalanceMinor: 100_000,
    });

    expect(account.openingBalanceMinor).toBe(100_000);
  });

  it("negates a liability account's opening balance so it's stored as amount owed (negative)", () => {
    const creditCard = createAccount({
      name: "Credit Card",
      type: "credit_card",
      openingBalanceMinor: 50_000,
    });
    const loan = createAccount({
      name: "Home Loan",
      type: "loan",
      openingBalanceMinor: 20_000_000,
    });

    expect(creditCard.openingBalanceMinor).toBe(-50_000);
    expect(loan.openingBalanceMinor).toBe(-20_000_000);
  });

  it("defaults opening balance to 0 when omitted", () => {
    const account = createAccount({ name: "Cash", type: "cash" });
    expect(account.openingBalanceMinor).toBe(0);
  });

  it("rejects an opening balance that is not whole minor units", () => {
    expect(() =>
      createAccount({ name: "Checking", type: "checking", openingBalanceMinor: 100.5 }),
    ).toThrow(/whole number of minor units/);
  });

  it("stamps kind, normal balance and liquidity from the account type", () => {
    const checking = createAccount({ name: "Checking", type: "checking" });
    const loan = createAccount({ name: "Home Loan", type: "loan" });
    const investment = createAccount({ name: "Brokerage", type: "investment" });
    const dad = createAccount({ name: "Dad owes me", type: "receivable" });

    // Left to the column defaults a liability would be kind='asset' /
    // normalBalance='debit' — a pair the DB CHECK accepts while every
    // kind-based sum reads the loan as an asset.
    expect(checking).toMatchObject({ kind: "asset", normalBalance: "debit", liquidity: "liquid" });
    expect(loan).toMatchObject({ kind: "liability", normalBalance: "credit" });
    expect(investment.liquidity).toBe("semi_liquid");
    expect(dad.liquidity).toBe("illiquid");
  });

  it("rejects a kind and normal balance that disagree, as a user-facing error", () => {
    expect(() =>
      createAccount({
        name: "Odd",
        type: "checking",
        kind: "liability",
        normalBalance: "debit",
      }),
    ).toThrow(/kind and normal balance must agree/);
  });

  it("writes loan terms to the loan-terms satellite, pinned to the account's currency", () => {
    const loan = createAccount({
      name: "Home Loan",
      type: "loan",
      currency: "USD",
      openingBalanceMinor: 20_000_000,
      loanTerms: {
        originalAmountMinor: 25_000_000,
        rateBps: 850,
        rateType: "floating",
        tenureMonths: 240,
        emiMinor: 217_000,
      },
    });

    expect(getAccountTerms(loan.id).loan).toMatchObject({
      accountId: loan.id,
      originalAmountMinor: 25_000_000,
      rateBps: 850,
      tenureMonths: 240,
      emiMinor: 217_000,
      // A limit denominated differently from the balance it bounds could never
      // be compared against it, so the satellite takes the account's currency.
      currency: "USD",
    });
    expect(getAccountTerms(loan.id).credit).toBeNull();
  });

  it("writes credit terms for a card or revolving facility", () => {
    const card = createAccount({
      name: "Credit Card",
      type: "credit_card",
      creditTerms: { creditLimitMinor: 5_000_010, aprBps: 4200, statementDay: 5, dueDay: 25 },
    });

    expect(getAccountTerms(card.id).credit).toMatchObject({
      creditLimitMinor: 5_000_010,
      aprBps: 4200,
      statementDay: 5,
      dueDay: 25,
      currency: "INR",
    });
  });

  it("refuses terms that do not belong to the account's type", () => {
    expect(() =>
      createAccount({
        name: "Checking",
        type: "checking",
        loanTerms: { originalAmountMinor: 1000 },
      }),
    ).toThrow(/Only a loan account/);
    expect(() =>
      createAccount({ name: "Home Loan", type: "loan", creditTerms: { creditLimitMinor: 1000 } }),
    ).toThrow(/Only a credit card or revolving credit/);
  });

  it("computes account balance as opening balance plus income/expense/transfer effects", () => {
    const checking = createAccount({
      name: "Checking",
      type: "checking",
      openingBalanceMinor: 100_000,
    });
    const savings = createAccount({ name: "Savings", type: "savings", openingBalanceMinor: 0 });
    const salary = createCategory({ name: "Salary", type: "income" });
    const groceries = createCategory({ name: "Groceries", type: "expense" });

    createTransaction({
      type: "income",
      accountId: checking.id,
      categoryId: salary.id,
      amountMinor: 50_000,
      date: "2026-01-05",
    });
    createTransaction({
      type: "expense",
      accountId: checking.id,
      categoryId: groceries.id,
      amountMinor: 20_000,
      date: "2026-01-10",
    });
    createTransaction({
      type: "transfer",
      accountId: checking.id,
      toAccountId: savings.id,
      amountMinor: 30_000,
      date: "2026-01-15",
    });

    expect(getAccountBalanceMinorById(checking.id)).toBe(100_000 + 50_000 - 20_000 - 30_000);
    expect(getAccountBalanceMinorById(savings.id)).toBe(30_000);
  });

  it("credits the destination account's own leg of a cross-currency transfer", () => {
    const inr = createAccount({ name: "HDFC", type: "savings", openingBalanceMinor: 1_000_000 });
    const usd = createAccount({
      name: "Wise USD",
      type: "savings",
      currency: "USD",
      openingBalanceMinor: 0,
    });

    createTransaction({
      type: "transfer",
      accountId: inr.id,
      toAccountId: usd.id,
      amountMinor: 830_000, // ₹8,300.00 out
      toAmountMinor: 10_000, // $100.00 in — what the bank actually credited
      date: "2026-01-20",
    });

    expect(getAccountBalanceMinorById(inr.id)).toBe(1_000_000 - 830_000);
    expect(getAccountBalanceMinorById(usd.id)).toBe(10_000);
  });

  it("restricts asOfDate balance to transactions on or before that date", () => {
    const checking = createAccount({ name: "Checking", type: "checking", openingBalanceMinor: 0 });
    const salary = createCategory({ name: "Salary", type: "income" });

    createTransaction({
      type: "income",
      accountId: checking.id,
      categoryId: salary.id,
      amountMinor: 10_000,
      date: "2026-01-05",
    });
    createTransaction({
      type: "income",
      accountId: checking.id,
      categoryId: salary.id,
      amountMinor: 5_000,
      date: "2026-01-20",
    });

    expect(getAccountBalanceMinorById(checking.id, "2026-01-05")).toBe(10_000);
    expect(getAccountBalanceMinorById(checking.id, "2026-01-19")).toBe(10_000);
    expect(getAccountBalanceMinorById(checking.id)).toBe(15_000);
  });

  it("returns 0 for an unknown account id", () => {
    expect(getAccountBalanceMinorById(999)).toBe(0);
  });

  it("sums asset and liability balances into a signed net total per currency", () => {
    createAccount({ name: "Checking", type: "checking", openingBalanceMinor: 100_000 });
    createAccount({ name: "Credit Card", type: "credit_card", openingBalanceMinor: 30_000 });

    // Was a single `getTotalBalance()` number; a total that crosses currencies
    // cannot be one number, so the signed net is now per currency.
    expect(getNetWorthByCurrency()).toEqual(new Map([["INR", 100_000 - 30_000]]));
  });

  it("keeps a dollar balance out of the rupee subtotal", () => {
    createAccount({ name: "Checking", type: "checking", openingBalanceMinor: 100_000 });
    createAccount({
      name: "Wise USD",
      type: "savings",
      currency: "USD",
      openingBalanceMinor: 25_000,
    });

    expect(getNetWorthByCurrency()).toEqual(
      new Map([
        ["INR", 100_000],
        ["USD", 25_000],
      ]),
    );
  });

  it("excludes accounts flagged out of net worth", () => {
    createAccount({ name: "Checking", type: "checking", openingBalanceMinor: 100_000 });
    createAccount({
      name: "Dad owes me",
      type: "receivable",
      openingBalanceMinor: 500_000,
      excludeFromNetWorth: true,
    });

    expect(getNetWorthByCurrency()).toEqual(new Map([["INR", 100_000]]));
  });

  it("converts net worth to the base currency and reports an unresolvable currency rather than dropping it", () => {
    createAccount({ name: "Checking", type: "checking", openingBalanceMinor: 100_000 });
    createAccount({
      name: "Wise USD",
      type: "savings",
      currency: "USD",
      openingBalanceMinor: 25_000,
    });

    const withoutRates = getNetWorth({ asOf: "2026-01-10" });
    expect(withoutRates.baseCurrency).toBe("INR");
    // The dollars are not converted at 1 and not silently dropped: the total
    // is short and `complete` says so.
    expect(withoutRates.baseMinor).toBe(100_000);
    expect(withoutRates.complete).toBe(false);
    expect(withoutRates.byCurrency.find((c) => c.currency === "USD")?.baseMinor).toBeNull();

    const withRates = getNetWorth({
      asOf: "2026-01-10",
      rates: [
        { base: "USD", quote: "INR", date: "2026-01-09", rateScaled: 83_00000000, source: "test" },
      ],
    });
    expect(withRates.complete).toBe(true);
    expect(withRates.baseMinor).toBe(100_000 + 25_000 * 83);
  });

  it("lists accounts with computed balances, sorted by name", () => {
    createAccount({ name: "Zeta", type: "cash", openingBalanceMinor: 1_000 });
    createAccount({ name: "Alpha", type: "cash", openingBalanceMinor: 2_000 });

    const accounts = getAccounts();

    expect(accounts.map((a) => a.name)).toEqual(["Alpha", "Zeta"]);
    expect(accounts.map((a) => a.balanceMinor)).toEqual([2_000, 1_000]);
  });

  it("fetches an account by id, or null when missing", () => {
    const created = createAccount({
      name: "Checking",
      type: "checking",
      openingBalanceMinor: 10_000,
    });

    expect(getAccount(created.id)).toMatchObject({
      name: "Checking",
      openingBalanceMinor: 10_000,
    });
    expect(getAccount(created.id + 999)).toBeNull();
  });
});
