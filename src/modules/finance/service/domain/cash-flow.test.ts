import { beforeEach, afterEach, describe, expect, it } from "vitest";
import { setupTestDb, teardownTestDb } from "@/test/db";
import { getCashFlowStatement } from "./cash-flow";
import { createAccount } from "./accounts";
import { createCategory } from "./categories";
import { createTransaction, voidTransaction } from "./transactions";
import { createHolding, recordCashFlow, voidCashFlow } from "./investments";
import { toUnitsScaled } from "../utility/units";

beforeEach(setupTestDb);
afterEach(teardownTestDb);

const PERIOD = ["2026-03-01", "2026-04-01"] as const;

describe("three-way cash flow", () => {
  it("hand-verified: separates asset purchases and debt repayment from spending", () => {
    // The scenario from the PRD's own argument, scaled down. Earn ₹1,20,000,
    // spend ₹40,000, repay ₹35,000 of loan principal, put ₹14,000 into a fund.
    // Plain category totals would report an ₹80,000 surplus; the investable
    // surplus is ₹85,000 − nothing, and what is actually free is far less.
    const bank = createAccount({
      name: "Bank",
      type: "savings",
      currency: "INR",
      openingBalanceMinor: 0,
    });
    const loan = createAccount({
      name: "Home loan",
      type: "loan",
      currency: "INR",
      openingBalanceMinor: 5_000_000,
    });
    const salary = createCategory({ name: "Salary", type: "income" });
    const rent = createCategory({ name: "Rent", type: "expense" });

    createTransaction({
      type: "income",
      accountId: bank.id,
      categoryId: salary.id,
      amountMinor: 12_000_000,
      date: "2026-03-01",
    });
    createTransaction({
      type: "expense",
      accountId: bank.id,
      categoryId: rent.id,
      amountMinor: 4_000_000,
      date: "2026-03-05",
    });
    // An EMI: a transfer into the liability account. Financing, not spending.
    createTransaction({
      type: "transfer",
      accountId: bank.id,
      toAccountId: loan.id,
      amountMinor: 3_500_000,
      date: "2026-03-07",
    });
    const fund = createHolding({
      type: "mutual_fund_domestic",
      name: "Index fund",
      currency: "INR",
    });
    recordCashFlow({
      holdingId: fund.id,
      date: "2026-03-10",
      amountMinor: 1_400_000,
      unitsScaled: toUnitsScaled(100),
      flowType: "contribution",
    });

    const s = getCashFlowStatement(...PERIOD);

    expect(s.operating.inflow.baseMinor).toBe(12_000_000);
    expect(s.operating.outflow.baseMinor).toBe(4_000_000);
    expect(s.operating.netMinor).toBe(8_000_000);

    // The fund purchase is investing, not spending — putting it in "spending"
    // would misread saving as consumption.
    expect(s.investing.outflow.baseMinor).toBe(1_400_000);
    expect(s.operating.outflow.baseMinor).not.toBe(4_000_000 + 1_400_000);

    // The EMI is financing, not spending.
    expect(s.financing.outflow.baseMinor).toBe(3_500_000);

    // Earned ₹1,20,000, lived on ₹40,000, serviced ₹35,000 of debt: ₹45,000
    // was free to put to work.
    expect(s.netInvestableSurplusMinor).toBe(8_000_000 - 3_500_000);
    expect(s.disposition.investedMinor).toBe(1_400_000);
    expect(s.disposition.spentMinor).toBe(4_000_000);
    expect(s.complete).toBe(true);
  });

  it("excludes a transfer between the user's own asset accounts from all three", () => {
    // A transfer is never spending, nets to zero in net worth, and counting
    // either leg would double-count one movement.
    const a = createAccount({
      name: "Savings",
      type: "savings",
      currency: "INR",
      openingBalanceMinor: 1_000_000,
    });
    const b = createAccount({
      name: "Current",
      type: "checking",
      currency: "INR",
      openingBalanceMinor: 0,
    });
    createTransaction({
      type: "transfer",
      accountId: a.id,
      toAccountId: b.id,
      amountMinor: 500_000,
      date: "2026-03-09",
    });

    const s = getCashFlowStatement(...PERIOD);

    expect(s.operating.inflow.baseMinor).toBe(0);
    expect(s.operating.outflow.baseMinor).toBe(0);
    expect(s.investing.outflow.baseMinor).toBe(0);
    expect(s.financing.outflow.baseMinor).toBe(0);
  });

  it("counts a dividend as operating income, not an investing inflow", () => {
    // A dividend is a return *on* the asset, not a change in how much is
    // owned. Counting it as investing would overstate investing inflow and
    // understate earnings at the same time.
    const holding = createHolding({ type: "equity", name: "Acme", currency: "INR" });
    recordCashFlow({
      holdingId: holding.id,
      date: "2026-03-12",
      amountMinor: 250_000,
      flowType: "dividend",
    });

    const s = getCashFlowStatement(...PERIOD);

    expect(s.investing.inflow.baseMinor).toBe(0);
  });

  it("reports an unexplained remainder rather than forcing the reconciliation to zero", () => {
    // Income arrives, nothing is spent, and no account records receiving it —
    // which is what an unlogged transfer out looks like. A reconciliation that
    // always balanced exactly would hide it.
    const bank = createAccount({
      name: "Bank",
      type: "savings",
      currency: "INR",
      openingBalanceMinor: 0,
      excludeFromNetWorth: false,
    });
    const salary = createCategory({ name: "Salary", type: "income" });
    createTransaction({
      type: "income",
      accountId: bank.id,
      categoryId: salary.id,
      amountMinor: 1_000_000,
      date: "2026-03-02",
    });
    // Then it leaves to somewhere the ledger does not model as a destination.
    const holding = createHolding({ type: "gold", name: "Coins", currency: "INR" });
    recordCashFlow({
      holdingId: holding.id,
      date: "2026-03-20",
      amountMinor: 1_000_000,
      unitsScaled: toUnitsScaled(10),
      flowType: "contribution",
    });

    const s = getCashFlowStatement(...PERIOD);

    // The ₹10,000 came in and ₹10,000 went into gold, but the bank balance
    // also rose by ₹10,000 because the gold purchase is not a transaction
    // against it. The residual names that gap instead of hiding it.
    expect(s.disposition.savedMinor).toBe(1_000_000);
    expect(s.disposition.investedMinor).toBe(1_000_000);
    expect(s.disposition.unexplainedMinor).toBe(-1_000_000);
  });

  it("treats a charge on a credit card as a financing inflow, not income", () => {
    // Drawing on a card is borrowing. It must not read as earning.
    const card = createAccount({
      name: "Card",
      type: "credit_card",
      currency: "INR",
      openingBalanceMinor: 0,
    });
    const salary = createCategory({ name: "Refund", type: "income" });
    createTransaction({
      type: "income",
      accountId: card.id,
      categoryId: salary.id,
      amountMinor: 200_000,
      date: "2026-03-14",
    });

    const s = getCashFlowStatement(...PERIOD);

    expect(s.financing.inflow.baseMinor).toBe(200_000);
  });

  it("excludes a voided transaction from every side", () => {
    const bank = createAccount({
      name: "Bank",
      type: "savings",
      currency: "INR",
      openingBalanceMinor: 0,
    });
    const salary = createCategory({ name: "Salary", type: "income" });
    const income = createTransaction({
      type: "income",
      accountId: bank.id,
      categoryId: salary.id,
      amountMinor: 5_000_000,
      date: "2026-03-02",
    });
    expect(getCashFlowStatement(...PERIOD).operating.inflow.baseMinor).toBe(5_000_000);

    voidTransaction(income.id, "Never received");

    expect(getCashFlowStatement(...PERIOD).operating.inflow.baseMinor).toBe(0);
  });

  it("excludes a voided investment contribution from investing", () => {
    const fund = createHolding({ type: "mutual_fund_domestic", name: "Fund", currency: "INR" });
    const flow = recordCashFlow({
      holdingId: fund.id,
      date: "2026-03-10",
      amountMinor: 1_400_000,
      unitsScaled: toUnitsScaled(100),
      flowType: "contribution",
    });
    expect(getCashFlowStatement(...PERIOD).investing.outflow.baseMinor).toBe(1_400_000);

    voidCashFlow(flow.id, "Entered twice");

    expect(getCashFlowStatement(...PERIOD).investing.outflow.baseMinor).toBe(0);
  });
});
