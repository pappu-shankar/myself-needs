import { beforeEach, afterEach, describe, expect, it } from "vitest";
import { setupTestDb, teardownTestDb } from "@/test/db";
import { addMonths, todayIso } from "@/lib/dates";
import { getFinanceSnapshot } from "./snapshot";
import { currentFiscalYear } from "../../utility/fiscal-year";
import {
  regimeVerdictRule,
  rateArbitrageRule,
  idleCashRule,
  budgetHeadroomRule,
  debtPriorityRule,
  eightyCHeadroomRule,
} from "./advocate";
import { createAccount } from "../accounts";
import { createCategory } from "../categories";
import { createTransaction } from "../transactions";
import { createHolding, createCashFlow } from "../investments";
import { createBudget } from "../budgets";
import { getDb } from "@/modules/core/db/client";
import { loanTerms } from "../../../db/schema/domain/loan-terms";

beforeEach(setupTestDb);
afterEach(teardownTestDb);

function todayStr() {
  return todayIso();
}
function monthsAgo(n: number) {
  return addMonths(todayIso(), -n);
}
/** April 1st of the financial year "today" falls in. */
function currentFyStart(): string {
  return currentFiscalYear().start;
}

/** Migration 0028 moved the rate off `finance_accounts` into the terms tables,
 * and no service or action writes them yet — so the fixture inserts directly. */
function setLoanTerms(accountId: number, rateBps: number) {
  getDb().insert(loanTerms).values({ accountId, rateBps }).run();
}

/** A liability account carrying an amount owed. The opening balance is passed
 * already negative so the test states the sign convention it depends on rather
 * than relying on the service to negate it. */
function createLoan(name: string, owedMinor: number) {
  return createAccount({
    name,
    type: "loan",
    kind: "liability",
    normalBalance: "credit",
    openingBalanceMinor: -Math.abs(owedMinor),
  });
}

describe("regimeVerdictRule", () => {
  it("fires with a savings figure when the two regimes' tax bills differ", () => {
    const checking = createAccount({ name: "Checking", type: "checking" });
    const salary = createCategory({ name: "Salary", type: "income" });
    createTransaction({
      type: "income",
      accountId: checking.id,
      categoryId: salary.id,
      amountMinor: 200_000_000, // ₹20,00,000
      date: currentFyStart(),
    });

    const insights = regimeVerdictRule(getFinanceSnapshot());

    expect(insights).toHaveLength(1);
    expect(insights[0].category).toBe("advocate");
  });

  it("formats the savings figure in the statutory currency, not as a bare number", () => {
    const checking = createAccount({ name: "Checking", type: "checking" });
    const salary = createCategory({ name: "Salary", type: "income" });
    createTransaction({
      type: "income",
      accountId: checking.id,
      categoryId: salary.id,
      amountMinor: 200_000_000,
      date: currentFyStart(),
    });

    const [insight] = regimeVerdictRule(getFinanceSnapshot());

    expect(insight.message).toContain("₹");
  });

  it("does not fire when there's no income (both regimes owe nothing, so savings is 0)", () => {
    expect(regimeVerdictRule(getFinanceSnapshot())).toHaveLength(0);
  });
});

describe("rateArbitrageRule", () => {
  it("fires when a liability's rate exceeds an FD/RD holding's rate", () => {
    const loan = createLoan("Car Loan", 10_000_000);
    setLoanTerms(loan.id, 1200); // 12%
    const fd = createHolding({ type: "fd", name: "Bank FD", rateBps: 600 });

    const insights = rateArbitrageRule(getFinanceSnapshot());

    expect(insights).toEqual([
      expect.objectContaining({ id: `rate-arbitrage:${loan.id}:${fd.id}` }),
    ]);
  });

  it("compares against the lowest-rate FD/RD, not the first by name", () => {
    const loan = createLoan("Car Loan", 10_000_000);
    setLoanTerms(loan.id, 900);
    createHolding({ type: "fd", name: "A High FD", rateBps: 800 });
    const low = createHolding({ type: "rd", name: "Z Low RD", rateBps: 550 });

    expect(rateArbitrageRule(getFinanceSnapshot())).toEqual([
      expect.objectContaining({ id: `rate-arbitrage:${loan.id}:${low.id}` }),
    ]);
  });

  it("states both rates as percentages even though they are stored in basis points", () => {
    const loan = createLoan("Car Loan", 10_000_000);
    setLoanTerms(loan.id, 900);
    createHolding({ type: "rd", name: "Low RD", rateBps: 550 });

    const [insight] = rateArbitrageRule(getFinanceSnapshot());

    expect(insight.message).toContain("9%");
    expect(insight.message).toContain("5.5%");
  });

  it("does not fire when the FD/RD rate is at or above the liability's rate", () => {
    const loan = createLoan("Car Loan", 10_000_000);
    setLoanTerms(loan.id, 500);
    createHolding({ type: "fd", name: "Bank FD", rateBps: 800 });

    expect(rateArbitrageRule(getFinanceSnapshot())).toHaveLength(0);
  });

  it("does not fire for a liability with no recorded rate", () => {
    createLoan("Car Loan", 10_000_000);
    createHolding({ type: "fd", name: "Bank FD", rateBps: 600 });

    expect(rateArbitrageRule(getFinanceSnapshot())).toHaveLength(0);
  });
});

describe("idleCashRule", () => {
  it("fires when liquid cash covers far more months than the idle-cash multiple (default 6)", () => {
    createAccount({ name: "Savings", type: "savings", openingBalanceMinor: 100_000_000 });
    const checking = createAccount({ name: "Checking", type: "checking" });
    const category = createCategory({ name: "Misc", type: "expense" });
    createTransaction({
      type: "expense",
      accountId: checking.id,
      categoryId: category.id,
      amountMinor: 100_000,
      // Inside the emergency-fund window: that is the last 3 *complete* months,
      // so an expense dated today would not be counted at all.
      date: monthsAgo(1),
    });

    const insights = idleCashRule(getFinanceSnapshot());

    expect(insights).toHaveLength(1);
    expect(insights[0].category).toBe("advocate");
  });

  it("does not fire when there's no expense history to compute a months-of-coverage figure", () => {
    createAccount({ name: "Savings", type: "savings", openingBalanceMinor: 100_000_000 });
    expect(idleCashRule(getFinanceSnapshot())).toHaveLength(0);
  });
});

describe("budgetHeadroomRule", () => {
  it("fires for a budget spent well under the headroom threshold (<=30% used by default)", () => {
    const category = createCategory({ name: "Dining", type: "expense" });
    const account = createAccount({ name: "Checking", type: "checking" });
    createBudget({
      categoryId: category.id,
      monthlyLimitMinor: 100_000, // ₹1,000
      effectiveFrom: `${todayStr().slice(0, 7)}-01`,
    });
    createTransaction({
      type: "expense",
      accountId: account.id,
      categoryId: category.id,
      amountMinor: 10_000, // ₹100 — 10% of the limit
      date: todayStr(),
    });

    const insights = budgetHeadroomRule(getFinanceSnapshot());

    expect(insights).toHaveLength(1);
    expect(insights[0].message).toContain("10%");
    // The limit is formatted in the budget's own currency, not as a bare float.
    expect(insights[0].message).toContain("₹1,000.00");
  });

  it("does not fire when spend is above the headroom threshold", () => {
    const category = createCategory({ name: "Dining", type: "expense" });
    const account = createAccount({ name: "Checking", type: "checking" });
    createBudget({
      categoryId: category.id,
      monthlyLimitMinor: 100_000,
      effectiveFrom: `${todayStr().slice(0, 7)}-01`,
    });
    createTransaction({
      type: "expense",
      accountId: account.id,
      categoryId: category.id,
      amountMinor: 80_000,
      date: todayStr(),
    });

    expect(budgetHeadroomRule(getFinanceSnapshot())).toHaveLength(0);
  });
});

describe("debtPriorityRule", () => {
  it("fires once for the highest-interest-rate liability account", () => {
    const card = createAccount({
      name: "Credit Card",
      type: "credit_card",
      kind: "liability",
      normalBalance: "credit",
      openingBalanceMinor: -500_000,
    });
    setLoanTerms(card.id, 3600);
    const loan = createLoan("Car Loan", 10_000_000);
    setLoanTerms(loan.id, 4000);

    const insights = debtPriorityRule(getFinanceSnapshot());

    // The id carries the rate in basis points — the integer the comparison ran on.
    expect(insights).toEqual([expect.objectContaining({ id: `debt-priority:${loan.id}:4000` })]);
    expect(insights[0].message).toContain("40%");
  });

  it("does not fire when there are no liability accounts", () => {
    createAccount({ name: "Checking", type: "checking" });
    expect(debtPriorityRule(getFinanceSnapshot())).toHaveLength(0);
  });
});

describe("eightyCHeadroomRule", () => {
  it("fires when 80C room remains with the financial year still open (the default state)", () => {
    const insights = eightyCHeadroomRule(getFinanceSnapshot());

    expect(insights).toHaveLength(1);
    expect(insights[0].id).toMatch(/^80c-headroom:/);
    // The full ₹1,50,000 limit is unused, formatted in statutory INR.
    expect(insights[0].message).toContain("₹1,50,000.00");
  });

  it("does not fire once 80C contributions reach the limit", () => {
    const holding = createHolding({ type: "equity", name: "ELSS Fund", is80cEligible: true });
    createCashFlow({
      holdingId: holding.id,
      date: currentFyStart(),
      amountMinor: -16_000_000, // ₹1,60,000 contributed, past the ₹1,50,000 limit
      flowType: "contribution",
    });

    expect(eightyCHeadroomRule(getFinanceSnapshot())).toHaveLength(0);
  });
});
