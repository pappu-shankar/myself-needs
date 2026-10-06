import { beforeEach, afterEach, describe, expect, it } from "vitest";
import { setupTestDb, teardownTestDb } from "@/test/db";
import { sql } from "drizzle-orm";
import { getDb } from "@/modules/core/db/client";
import {
  archiveAccountById,
  createAccount,
  deleteAccountById,
  editAccount,
  getAccount,
  getAccountBalanceMinorById,
  getAccountTerms,
  getAccounts,
  getNetWorth,
  getNetWorthByCurrency,
  unarchiveAccountById,
} from "./accounts";
import { createTransaction } from "./transactions";
import { createCategory } from "./categories";
import { createRecurringRule } from "./recurring";

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

describe("editAccount", () => {
  it("edits descriptive fields in place rather than producing a second account", () => {
    const account = createAccount({ name: "Chekcing", type: "checking" });

    const edited = editAccount(account.id, { name: "Checking" });

    expect(edited.id).toBe(account.id);
    expect(edited.name).toBe("Checking");
    expect(getAccounts()).toHaveLength(1);
  });

  it("throws when the account is missing", () => {
    expect(() => editAccount(999, { name: "Nope" })).toThrow(/no longer exists/);
  });

  it("recomputes kind and normal balance when the type changes, so the DB CHECK can't be hit", () => {
    const account = createAccount({ name: "Wallet", type: "cash" });

    const edited = editAccount(account.id, { type: "credit_card" });

    expect(edited.kind).toBe("liability");
    expect(edited.normalBalance).toBe("credit");
    expect(edited.liquidity).toBe("liquid");
  });

  it("recomputes liquidity on a type change so a loan re-typed as savings stops reading as cash", () => {
    const account = createAccount({ name: "Brokerage", type: "investment" });
    expect(account.liquidity).toBe("semi_liquid");

    expect(editAccount(account.id, { type: "savings" }).liquidity).toBe("liquid");
  });

  it("re-applies the kind/normal-balance agreement rule as a user-facing error", () => {
    const account = createAccount({ name: "Checking", type: "checking" });

    expect(() => editAccount(account.id, { kind: "liability", normalBalance: "debit" })).toThrow(
      /kind and normal balance must agree/,
    );
  });

  it("re-signs the opening balance when the kind flips on an account with no history", () => {
    const account = createAccount({
      name: "Checking",
      type: "checking",
      openingBalanceMinor: 5000,
    });

    expect(editAccount(account.id, { type: "credit_card" }).openingBalanceMinor).toBe(-5000);
  });

  it("negates a new opening balance for a liability, exactly as create does", () => {
    const card = createAccount({ name: "Card", type: "credit_card", openingBalanceMinor: 1000 });

    expect(editAccount(card.id, { openingBalanceMinor: 2500 }).openingBalanceMinor).toBe(-2500);
  });

  it("re-applies the whole-minor-units rule to an edited opening balance", () => {
    const account = createAccount({ name: "Checking", type: "checking" });

    expect(() => editAccount(account.id, { openingBalanceMinor: 100.5 })).toThrow(
      /whole number of minor units/,
    );
  });

  it("re-applies the terms-satellite type rule", () => {
    const account = createAccount({ name: "Checking", type: "checking" });

    expect(() => editAccount(account.id, { loanTerms: { rateBps: 800 } })).toThrow(
      /Only a loan account takes loan terms/,
    );
  });

  it("replaces the terms satellite and pins it to the account's currency", () => {
    const loan = createAccount({ name: "Home Loan", type: "loan", currency: "INR" });

    editAccount(loan.id, { loanTerms: { rateBps: 865, emiMinor: 4_500_000 } });

    expect(getAccountTerms(loan.id).loan).toMatchObject({
      rateBps: 865,
      emiMinor: 4_500_000,
      currency: "INR",
    });
  });

  it("allows a currency change while the account has no transactions", () => {
    const account = createAccount({ name: "Checking", type: "checking", currency: "INR" });

    expect(editAccount(account.id, { currency: "USD" }).currency).toBe("USD");
  });

  it("refuses a currency change once the account has any transaction", () => {
    const account = createAccount({
      name: "Checking",
      type: "checking",
      currency: "INR",
      openingBalanceMinor: 100_000,
    });
    const category = createCategory({ name: "Rent", type: "expense" });
    createTransaction({
      type: "expense",
      accountId: account.id,
      categoryId: category.id,
      amountMinor: 25_000,
      date: "2026-03-01",
    });

    expect(() => editAccount(account.id, { currency: "USD" })).toThrow(/currency can't be changed/);
    expect(getAccount(account.id)!.currency).toBe("INR");
  });

  it("refuses an asset↔liability type change once the account has any transaction", () => {
    const account = createAccount({ name: "Checking", type: "checking" });
    const category = createCategory({ name: "Rent", type: "expense" });
    createTransaction({
      type: "expense",
      accountId: account.id,
      categoryId: category.id,
      amountMinor: 25_000,
      date: "2026-03-01",
    });

    expect(() => editAccount(account.id, { type: "credit_card" })).toThrow(
      /between an asset and a liability/,
    );
    // A type change that keeps the kind is still fine.
    expect(editAccount(account.id, { type: "savings" }).type).toBe("savings");
  });
});

describe("archiveAccountById", () => {
  it("hides the account from listings without moving any balance or net-worth figure", () => {
    const checking = createAccount({
      name: "Checking",
      type: "checking",
      currency: "INR",
      openingBalanceMinor: 100_000,
    });
    const savings = createAccount({
      name: "Savings",
      type: "savings",
      currency: "INR",
      openingBalanceMinor: 500_000,
    });
    const category = createCategory({ name: "Rent", type: "expense" });
    createTransaction({
      type: "expense",
      accountId: checking.id,
      categoryId: category.id,
      amountMinor: 25_000,
      date: "2026-03-01",
    });

    const savingsBalanceBefore = getAccountBalanceMinorById(savings.id);
    const checkingBalanceBefore = getAccountBalanceMinorById(checking.id);
    const netWorthBefore = getNetWorthByCurrency().get("INR");

    archiveAccountById(checking.id);

    // The archived account leaves the picker/listing...
    expect(getAccounts().map((a) => a.id)).toEqual([savings.id]);
    // ...and no figure was restated. Its own balance still computes from the
    // same transactions, and the account that remains is untouched: archiving
    // is a visibility change, not an edit to history.
    expect(getAccountBalanceMinorById(checking.id)).toBe(checkingBalanceBefore);
    expect(getAccountBalanceMinorById(savings.id)).toBe(savingsBalanceBefore);
    // And net worth does not move at all. Archiving is a visibility change, so
    // retiring a row the user was finished *looking at* must not appear to
    // destroy the money in it — `exclude_from_net_worth` is the explicit,
    // opt-in way to leave something out of the total.
    expect(getNetWorthByCurrency().get("INR")).toBe(netWorthBefore);
    expect(getNetWorthByCurrency().get("INR")).toBe(checkingBalanceBefore + savingsBalanceBefore);
  });

  it("round-trips through unarchive", () => {
    const account = createAccount({ name: "Checking", type: "checking" });

    expect(archiveAccountById(account.id).archivedAt).not.toBeNull();
    expect(getAccounts()).toHaveLength(0);

    expect(unarchiveAccountById(account.id).archivedAt).toBeNull();
    expect(getAccounts()).toHaveLength(1);
  });

  it("throws when the account is missing", () => {
    expect(() => archiveAccountById(999)).toThrow(/no longer exists/);
    expect(() => unarchiveAccountById(999)).toThrow(/no longer exists/);
  });
});

describe("deleteAccountById", () => {
  it("deletes an account nothing references, along with its terms satellite", () => {
    const loan = createAccount({
      name: "Car Loan",
      type: "loan",
      loanTerms: { rateBps: 900 },
    });

    deleteAccountById(loan.id);

    expect(getAccount(loan.id)).toBeNull();
    expect(getAccountTerms(loan.id).loan).toBeNull();
  });

  it("refuses to delete an account with a transaction, and names archiving instead", () => {
    const account = createAccount({ name: "Checking", type: "checking" });
    const category = createCategory({ name: "Rent", type: "expense" });
    createTransaction({
      type: "expense",
      accountId: account.id,
      categoryId: category.id,
      amountMinor: 25_000,
      date: "2026-03-01",
    });

    expect(() => deleteAccountById(account.id)).toThrow(/Archive it instead/);
    expect(getAccount(account.id)).not.toBeNull();
  });

  it("refuses to delete the destination account of a transfer", () => {
    const from = createAccount({ name: "Checking", type: "checking" });
    const to = createAccount({ name: "Savings", type: "savings" });
    createTransaction({
      type: "transfer",
      accountId: from.id,
      toAccountId: to.id,
      amountMinor: 50_000,
      date: "2026-03-01",
    });

    expect(() => deleteAccountById(to.id)).toThrow(/can't be deleted/);
  });

  it("refuses to delete an account a voided transaction still references", () => {
    const account = createAccount({ name: "Checking", type: "checking" });
    const category = createCategory({ name: "Rent", type: "expense" });
    const transaction = createTransaction({
      type: "expense",
      accountId: account.id,
      categoryId: category.id,
      amountMinor: 25_000,
      date: "2026-03-01",
    });
    getDb().run(
      sql`UPDATE finance_transactions SET voided_at = '2026-03-02', void_reason = 'typo' WHERE id = ${transaction.id}`,
    );

    // A void is a correction trail, not a deletion: the row still names this
    // account, so deleting it would leave the trail pointing at nothing.
    expect(() => deleteAccountById(account.id)).toThrow(/can't be deleted/);
  });

  it("refuses to delete an account a recurring rule references", () => {
    const account = createAccount({ name: "Checking", type: "checking" });
    const category = createCategory({ name: "Rent", type: "expense" });
    createRecurringRule({
      type: "expense",
      accountId: account.id,
      categoryId: category.id,
      amountMinor: 100_000,
      currency: "INR",
      frequency: "monthly",
      startDate: "2026-01-01",
    });

    expect(() => deleteAccountById(account.id)).toThrow(/can't be deleted/);
  });

  it("throws when the account is missing", () => {
    expect(() => deleteAccountById(999)).toThrow(/no longer exists/);
  });
});
