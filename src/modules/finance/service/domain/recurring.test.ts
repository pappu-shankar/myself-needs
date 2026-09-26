import { beforeEach, afterEach, describe, expect, it } from "vitest";
import { setupTestDb, teardownTestDb } from "@/test/db";
import {
  confirmRecurringOccurrence,
  createRecurringRule,
  getDueWorklist,
  getRecurringRules,
} from "./recurring";
import { createAccount } from "./accounts";
import { createCategory } from "./categories";

beforeEach(setupTestDb);
afterEach(teardownTestDb);

describe("recurring service", () => {
  it("creates a rule and lists it", () => {
    const account = createAccount({ name: "Checking", type: "checking", openingBalance: 0 });
    const category = createCategory({ name: "Rent", type: "expense" });

    const rule = createRecurringRule({
      type: "expense",
      accountId: account.id,
      categoryId: category.id,
      amount: 1000,
      frequency: "monthly",
      startDate: "2026-01-15",
      note: "Rent",
    });

    expect(getRecurringRules().map((r) => r.id)).toContain(rule.id);
  });

  it("generates monthly periods up to today, clamping day-of-month across shorter months", () => {
    const account = createAccount({ name: "Checking", type: "checking", openingBalance: 0 });
    const category = createCategory({ name: "Rent", type: "expense" });
    const rule = createRecurringRule({
      type: "expense",
      accountId: account.id,
      categoryId: category.id,
      amount: 1000,
      frequency: "monthly",
      startDate: "2026-01-31",
      note: "Rent",
    });

    // Feb 2026 has 28 days (2026 isn't a leap year), so the 31st clamps to the 28th;
    // March has 31 days, so it's unclamped again from the *original* start date's day, not the drifted one.
    const due = getDueWorklist("2026-03-31").filter((i) => i.ruleId === rule.id);

    expect(due.map((i) => i.periodStart)).toEqual(["2026-01-31", "2026-02-28", "2026-03-31"]);
  });

  it("stops generating periods once a period-start passes the rule's endDate", () => {
    const account = createAccount({ name: "Checking", type: "checking", openingBalance: 0 });
    const category = createCategory({ name: "Rent", type: "expense" });
    const rule = createRecurringRule({
      type: "expense",
      accountId: account.id,
      categoryId: category.id,
      amount: 1000,
      frequency: "monthly",
      startDate: "2026-01-15",
      endDate: "2026-02-01",
      note: "Rent",
    });

    const due = getDueWorklist("2026-12-31").filter((i) => i.ruleId === rule.id);

    expect(due.map((i) => i.periodStart)).toEqual(["2026-01-15"]);
  });

  it("generates weekly periods 7 days apart", () => {
    const account = createAccount({ name: "Checking", type: "checking", openingBalance: 0 });
    const category = createCategory({ name: "Groceries", type: "expense" });
    const rule = createRecurringRule({
      type: "expense",
      accountId: account.id,
      categoryId: category.id,
      amount: 50,
      frequency: "weekly",
      startDate: "2026-01-01",
      note: "Groceries",
    });

    const due = getDueWorklist("2026-01-22").filter((i) => i.ruleId === rule.id);

    expect(due.map((i) => i.periodStart)).toEqual([
      "2026-01-01",
      "2026-01-08",
      "2026-01-15",
      "2026-01-22",
    ]);
    expect(due.map((i) => i.label)).toEqual([
      "Groceries — week of 2026-01-01",
      "Groceries — week of 2026-01-08",
      "Groceries — week of 2026-01-15",
      "Groceries — week of 2026-01-22",
    ]);
  });

  it("confirming an occurrence marks off the oldest unlogged period, regardless of which date the user picked", () => {
    const account = createAccount({ name: "Checking", type: "checking", openingBalance: 0 });
    const category = createCategory({ name: "Rent", type: "expense" });
    const rule = createRecurringRule({
      type: "expense",
      accountId: account.id,
      categoryId: category.id,
      amount: 1000,
      frequency: "monthly",
      startDate: "2026-01-15",
      note: "Rent",
    });

    expect(getDueWorklist("2026-04-20").filter((i) => i.ruleId === rule.id)).toHaveLength(4);

    // Confirm using April's date, but the worklist only tracks a *count* of logged
    // transactions against the rule, not which specific period was confirmed — so
    // this still marks off January (the oldest unlogged period), leaving April due.
    confirmRecurringOccurrence({ ruleId: rule.id, amount: 1000, date: "2026-04-15", note: null });

    const due = getDueWorklist("2026-04-20").filter((i) => i.ruleId === rule.id);
    expect(due.map((i) => i.periodStart)).toEqual(["2026-02-15", "2026-03-15", "2026-04-15"]);
  });

  it("confirmRecurringOccurrence throws for an unknown rule id", () => {
    expect(() =>
      confirmRecurringOccurrence({ ruleId: 999, amount: 100, date: "2026-01-01", note: null }),
    ).toThrow("Recurring rule not found");
  });

  it("sorts the due worklist by period start across multiple rules", () => {
    const account = createAccount({ name: "Checking", type: "checking", openingBalance: 0 });
    const rent = createCategory({ name: "Rent", type: "expense" });
    const internet = createCategory({ name: "Internet", type: "expense" });

    createRecurringRule({
      type: "expense",
      accountId: account.id,
      categoryId: rent.id,
      amount: 1000,
      frequency: "monthly",
      startDate: "2026-01-01",
      note: "Rent",
    });
    createRecurringRule({
      type: "expense",
      accountId: account.id,
      categoryId: internet.id,
      amount: 50,
      frequency: "monthly",
      startDate: "2026-01-15",
      note: "Internet",
    });

    const periodStarts = getDueWorklist("2026-01-20").map((i) => i.periodStart);
    expect(periodStarts).toEqual([...periodStarts].sort());
  });
});
