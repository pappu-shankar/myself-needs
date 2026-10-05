import { beforeEach, afterEach, describe, expect, it } from "vitest";
import { setupTestDb, teardownTestDb } from "@/test/db";
import { addDays, addMonths, todayIso } from "@/lib/dates";
import { getFinanceSnapshot } from "./snapshot";
import { currentFiscalYear } from "../../utility/fiscal-year";
import {
  contributionLimitsRule,
  ltcgApproachingRule,
  creditUtilizationRule,
  insuranceLapseRule,
} from "./compliance";
import { createAccount } from "../accounts";
import { createHolding, createCashFlow } from "../investments";
import { createInsurancePolicy } from "../insurance";
import { createRecurringRule } from "../recurring";
import { createTransaction } from "../transactions";

beforeEach(setupTestDb);
afterEach(teardownTestDb);

function daysAgo(n: number) {
  return addDays(todayIso(), -n);
}
function monthsAgo(n: number) {
  return addMonths(todayIso(), -n);
}
function todayStr() {
  return todayIso();
}
/** April 1st of the financial year "today" falls in. */
function currentFyStart(): string {
  return currentFiscalYear().start;
}

describe("contributionLimitsRule", () => {
  it("fires one insight per section (80C, 80D) once that section's contributions reach its limit", () => {
    const elss = createHolding({ type: "equity", name: "ELSS Fund", is80cEligible: true });
    createCashFlow({
      holdingId: elss.id,
      date: currentFyStart(),
      amount: -160000,
      flowType: "contribution",
    });

    const account = createAccount({ name: "Checking", type: "checking" });
    const rule = createRecurringRule({
      type: "expense",
      accountId: account.id,
      amount: 30000,
      frequency: "yearly",
      startDate: currentFyStart(),
    });
    createInsurancePolicy({
      type: "health",
      provider: "Acme",
      name: "Floater",
      premiumAmount: 30000,
      premiumFrequency: "yearly",
      startDate: currentFyStart(),
      is80dEligible: true,
      recurringRuleId: rule.id,
    });
    createTransaction({
      type: "expense",
      accountId: account.id,
      amount: 30000,
      date: currentFyStart(),
      recurringRuleId: rule.id,
    });

    const snapshot = getFinanceSnapshot();
    const insights = contributionLimitsRule(snapshot);

    expect(insights.map((i) => i.id).sort()).toEqual(
      [
        `80c-limit-reached:FY ${snapshot.fy.label}`,
        `80d-limit-reached:FY ${snapshot.fy.label}`,
      ].sort(),
    );
  });

  it("does not fire when neither section has reached its limit", () => {
    expect(contributionLimitsRule(getFinanceSnapshot())).toHaveLength(0);
  });
});

describe("ltcgApproachingRule", () => {
  it("fires when equity LTCG is within the approaching threshold of the exemption but not yet taxed", () => {
    const holding = createHolding({ type: "equity", name: "Acme Corp" });
    createCashFlow({
      holdingId: holding.id,
      date: monthsAgo(13),
      amount: -100000,
      flowType: "contribution",
    });
    createCashFlow({
      holdingId: holding.id,
      date: todayStr(),
      amount: 220000,
      flowType: "redemption",
    });

    const insights = ltcgApproachingRule(getFinanceSnapshot());

    expect(insights).toHaveLength(1);
    expect(insights[0].id).toMatch(/^ltcg-approaching:/);
  });

  it("does not fire with no capital gains history", () => {
    expect(ltcgApproachingRule(getFinanceSnapshot())).toHaveLength(0);
  });
});

describe("creditUtilizationRule", () => {
  it("fires when a credit card's utilization is at or above the threshold (default 30%)", () => {
    const card = createAccount({
      name: "Credit Card",
      type: "credit_card",
      openingBalance: 6000,
      creditLimit: 10000,
    });

    const insights = creditUtilizationRule(getFinanceSnapshot());

    expect(insights).toEqual([expect.objectContaining({ id: `credit-utilization:${card.id}:60` })]);
  });

  it("does not fire below the threshold", () => {
    createAccount({
      name: "Credit Card",
      type: "credit_card",
      openingBalance: 1000,
      creditLimit: 10000,
    });
    expect(creditUtilizationRule(getFinanceSnapshot())).toHaveLength(0);
  });
});

describe("insuranceLapseRule", () => {
  it("fires for a past-renewal policy with no linked recurring rule (critical)", () => {
    const policy = createInsurancePolicy({
      type: "health",
      provider: "Acme",
      name: "Floater",
      premiumAmount: 5000,
      premiumFrequency: "yearly",
      startDate: monthsAgo(12),
      renewalDate: daysAgo(10),
    });

    const insights = insuranceLapseRule(getFinanceSnapshot());

    expect(insights).toEqual([
      expect.objectContaining({
        id: `insurance-lapse:${policy.id}:${daysAgo(10)}`,
        severity: "critical",
      }),
    ]);
  });

  it("does not fire when the renewal date hasn't passed yet", () => {
    createInsurancePolicy({
      type: "health",
      provider: "Acme",
      name: "Floater",
      premiumAmount: 5000,
      premiumFrequency: "yearly",
      startDate: monthsAgo(12),
      renewalDate: daysAgo(-30),
    });

    expect(insuranceLapseRule(getFinanceSnapshot())).toHaveLength(0);
  });
});
