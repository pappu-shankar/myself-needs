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

describe("regimeVerdictRule", () => {
  it("fires with a savings figure when the two regimes' tax bills differ", () => {
    const checking = createAccount({ name: "Checking", type: "checking" });
    const salary = createCategory({ name: "Salary", type: "income" });
    createTransaction({
      type: "income",
      accountId: checking.id,
      categoryId: salary.id,
      amount: 2000000,
      date: currentFyStart(),
    });

    const insights = regimeVerdictRule(getFinanceSnapshot());

    expect(insights).toHaveLength(1);
    expect(insights[0].category).toBe("advocate");
  });

  it("does not fire when there's no income (both regimes owe nothing, so savings is 0)", () => {
    expect(regimeVerdictRule(getFinanceSnapshot())).toHaveLength(0);
  });
});

describe("rateArbitrageRule", () => {
  it("fires when a liability's rate exceeds an FD/RD holding's rate", () => {
    const loan = createAccount({
      name: "Car Loan",
      type: "loan",
      openingBalance: 100000,
      interestRate: 12,
    });
    const fd = createHolding({ type: "fd", name: "Bank FD", interestRate: 6 });

    const insights = rateArbitrageRule(getFinanceSnapshot());

    expect(insights).toEqual([
      expect.objectContaining({ id: `rate-arbitrage:${loan.id}:${fd.id}` }),
    ]);
  });

  it("compares against the lowest-rate FD/RD, not the first by name", () => {
    const loan = createAccount({
      name: "Car Loan",
      type: "loan",
      openingBalance: 100000,
      interestRate: 9,
    });
    createHolding({ type: "fd", name: "A High FD", interestRate: 8 });
    const low = createHolding({ type: "rd", name: "Z Low RD", interestRate: 5.5 });

    expect(rateArbitrageRule(getFinanceSnapshot())).toEqual([
      expect.objectContaining({ id: `rate-arbitrage:${loan.id}:${low.id}` }),
    ]);
  });

  it("does not fire when the FD/RD rate is at or above the liability's rate", () => {
    createAccount({ name: "Car Loan", type: "loan", openingBalance: 100000, interestRate: 5 });
    createHolding({ type: "fd", name: "Bank FD", interestRate: 8 });

    expect(rateArbitrageRule(getFinanceSnapshot())).toHaveLength(0);
  });
});

describe("idleCashRule", () => {
  it("fires when liquid cash covers far more months than the idle-cash multiple (default 6)", () => {
    createAccount({ name: "Savings", type: "savings", openingBalance: 1000000 });
    const checking = createAccount({ name: "Checking", type: "checking" });
    const category = createCategory({ name: "Misc", type: "expense" });
    createTransaction({
      type: "expense",
      accountId: checking.id,
      categoryId: category.id,
      amount: 1000,
      // Inside the emergency-fund window: that is the last 3 *complete* months,
      // so an expense dated today would not be counted at all.
      date: monthsAgo(1),
    });

    const insights = idleCashRule(getFinanceSnapshot());

    expect(insights).toHaveLength(1);
    expect(insights[0].category).toBe("advocate");
  });

  it("does not fire when there's no expense history to compute a months-of-coverage figure", () => {
    createAccount({ name: "Savings", type: "savings", openingBalance: 1000000 });
    expect(idleCashRule(getFinanceSnapshot())).toHaveLength(0);
  });
});

describe("budgetHeadroomRule", () => {
  it("fires for a budget spent well under the headroom threshold (<=30% used by default)", () => {
    const category = createCategory({ name: "Dining", type: "expense" });
    const account = createAccount({ name: "Checking", type: "checking" });
    createBudget({
      categoryId: category.id,
      monthlyLimit: 1000,
      effectiveFrom: `${todayStr().slice(0, 7)}-01`,
    });
    createTransaction({
      type: "expense",
      accountId: account.id,
      categoryId: category.id,
      amount: 100,
      date: todayStr(),
    });

    const insights = budgetHeadroomRule(getFinanceSnapshot());

    expect(insights).toHaveLength(1);
  });

  it("does not fire when spend is above the headroom threshold", () => {
    const category = createCategory({ name: "Dining", type: "expense" });
    const account = createAccount({ name: "Checking", type: "checking" });
    createBudget({
      categoryId: category.id,
      monthlyLimit: 1000,
      effectiveFrom: `${todayStr().slice(0, 7)}-01`,
    });
    createTransaction({
      type: "expense",
      accountId: account.id,
      categoryId: category.id,
      amount: 800,
      date: todayStr(),
    });

    expect(budgetHeadroomRule(getFinanceSnapshot())).toHaveLength(0);
  });
});

describe("debtPriorityRule", () => {
  it("fires once for the highest-interest-rate liability account", () => {
    createAccount({
      name: "Credit Card",
      type: "credit_card",
      openingBalance: 5000,
      interestRate: 36,
    });
    const loan = createAccount({
      name: "Car Loan",
      type: "loan",
      openingBalance: 100000,
      interestRate: 40,
    });

    const insights = debtPriorityRule(getFinanceSnapshot());

    expect(insights).toEqual([expect.objectContaining({ id: `debt-priority:${loan.id}:40` })]);
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
  });

  it("does not fire once 80C contributions reach the limit", () => {
    const holding = createHolding({ type: "equity", name: "ELSS Fund", is80cEligible: true });
    createCashFlow({
      holdingId: holding.id,
      date: currentFyStart(),
      amount: -160000,
      flowType: "contribution",
    });

    expect(eightyCHeadroomRule(getFinanceSnapshot())).toHaveLength(0);
  });
});
