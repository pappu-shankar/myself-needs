import { beforeEach, afterEach, describe, expect, it } from "vitest";
import { setupTestDb, teardownTestDb } from "@/test/db";
import { addMonths, todayIso } from "@/lib/dates";
import { getFinanceSnapshot } from "./snapshot";
import { createAccount } from "../accounts";
import { createCategory } from "../categories";
import { createTransaction } from "../transactions";
import { createHolding, createValuation } from "../investments";
import { createBudget } from "../budgets";
import { createInsurancePolicy } from "../insurance";
import { createRecurringRule } from "../recurring";

beforeEach(setupTestDb);
afterEach(teardownTestDb);

function monthsAgo(n: number) {
  return addMonths(todayIso(), -n);
}
function todayStr() {
  return todayIso();
}

describe("getFinanceSnapshot", () => {
  it("composes every finance sub-service into one snapshot reflecting current DB state", () => {
    const checking = createAccount({ name: "Checking", type: "checking", openingBalance: 5000 });
    const category = createCategory({ name: "Groceries", type: "expense" });
    createTransaction({
      type: "expense",
      accountId: checking.id,
      categoryId: category.id,
      amount: 100,
      date: todayStr(),
    });
    createTransaction({
      type: "expense",
      accountId: checking.id,
      categoryId: category.id,
      amount: 100,
      date: todayStr(),
    });
    createTransaction({ type: "expense", accountId: checking.id, amount: 50, date: todayStr() });
    // Emergency-fund coverage averages the last 3 *complete* months, so the
    // rows above (dated today) fall outside it and it needs history to divide by.
    createTransaction({
      type: "expense",
      accountId: checking.id,
      categoryId: category.id,
      amount: 100,
      date: monthsAgo(1),
    });

    const holding = createHolding({ type: "equity", name: "Acme Corp" });
    createValuation({ holdingId: holding.id, date: todayStr(), pricePerUnit: 100 });

    createBudget({ categoryId: category.id, monthlyLimit: 1000, effectiveFrom: monthsAgo(2) });

    createInsurancePolicy({
      type: "health",
      provider: "Acme Insurance",
      name: "Family Floater",
      premiumAmount: 5000,
      premiumFrequency: "yearly",
      startDate: monthsAgo(12),
      renewalDate: todayStr(),
    });

    createRecurringRule({
      type: "expense",
      accountId: checking.id,
      categoryId: category.id,
      amount: 500,
      frequency: "monthly",
      startDate: monthsAgo(1),
    });

    const snapshot = getFinanceSnapshot();

    expect(snapshot.today).toBe(todayStr());
    expect(snapshot.accounts.some((a) => a.name === "Checking")).toBe(true);
    expect(snapshot.holdings).toHaveLength(1);
    expect(snapshot.holdings[0]).toMatchObject({ name: "Acme Corp", basis: "valuation" });
    expect(snapshot.budgets.some((b) => b.categoryName === "Groceries")).toBe(true);
    expect(typeof snapshot.emergencyFundMonths).toBe("number");
    expect(snapshot.insurancePolicies).toHaveLength(1);
    expect(snapshot.dueWorklist.length).toBeGreaterThan(0);
    expect(snapshot.eightyC).toMatchObject({ used: 0, limit: 150000 });
    expect(snapshot.eightyD).toMatchObject({ limit: 25000 });
    expect(snapshot.regime).toHaveProperty("betterRegime");
    expect(snapshot.capitalGains).toHaveProperty("totalTax");
    expect(snapshot.taxSettings.eightyCLimit).toBe(150000);
    expect(snapshot.fy.label).toMatch(/^\d{4}-\d{2}$/);
    // duplicate-transaction group only matches the two identical categorized transactions, not the third (uncategorized, different amount)
    expect(snapshot.duplicateGroups).toHaveLength(1);
    expect(snapshot.duplicateGroups[0]).toMatchObject({ count: 2, amount: 100 });
    expect(snapshot.uncategorizedCount).toBe(1);
    expect(snapshot.settings).toMatchObject({
      staleValuationDays: 90,
      recurringPileupThreshold: 3,
    });
  });
});
