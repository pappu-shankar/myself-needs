import { beforeEach, afterEach, describe, expect, it } from "vitest";
import { setupTestDb, teardownTestDb } from "@/test/db";
import { addDays, todayIso } from "@/lib/dates";
import { getInsights, dismissInsightById } from "./engine";
import { createAccount } from "../accounts";
import { createCategory } from "../categories";
import { createTransaction } from "../transactions";
import { createInsurancePolicy } from "../insurance";

beforeEach(setupTestDb);
afterEach(teardownTestDb);

function daysAgo(n: number) {
  return addDays(todayIso(), -n);
}
function todayStr() {
  return todayIso();
}

describe("getInsights", () => {
  it("runs every registered rule and sorts results critical, then warning, then info", () => {
    createInsurancePolicy({
      type: "health",
      provider: "Acme",
      name: "Floater",
      premiumAmountMinor: 500000,
      premiumFrequency: "yearly",
      startDate: daysAgo(400),
      renewalDate: daysAgo(10),
    });

    const wallet = createAccount({ name: "Wallet", type: "cash", openingBalanceMinor: 0 });
    const category = createCategory({ name: "Misc", type: "expense" });
    createTransaction({
      type: "expense",
      accountId: wallet.id,
      categoryId: category.id,
      amountMinor: 5000,
      date: todayStr(),
    });

    const insights = getInsights();

    const severityOrder: Record<string, number> = { critical: 0, warning: 1, info: 2 };
    const sequence = insights.map((i) => severityOrder[i.severity]);
    expect(sequence).toEqual([...sequence].sort((a, b) => a - b));
    // insurance lapse (critical), implausible balance (warning), and the default 80C headroom nudge (info) all fire together
    expect(insights.some((i) => i.severity === "critical")).toBe(true);
    expect(insights.some((i) => i.severity === "warning")).toBe(true);
    expect(insights.some((i) => i.severity === "info")).toBe(true);
  });

  it("excludes a dismissed insight by its exact id", () => {
    const wallet = createAccount({ name: "Wallet", type: "cash", openingBalanceMinor: 0 });
    const category = createCategory({ name: "Misc", type: "expense" });
    createTransaction({
      type: "expense",
      accountId: wallet.id,
      categoryId: category.id,
      amountMinor: 5000,
      date: todayStr(),
    });

    const before = getInsights();
    const target = before.find((i) => i.id === `implausible-balance:${wallet.id}`);
    expect(target).toBeDefined();

    dismissInsightById(target!.id);

    const after = getInsights();
    expect(after.find((i) => i.id === target!.id)).toBeUndefined();
  });
});
