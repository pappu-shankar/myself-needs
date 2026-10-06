import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { setupTestDb, teardownTestDb } from "@/test/db";
import { sql } from "drizzle-orm";
import { getDb } from "@/modules/core/db/client";
import {
  archiveRecurringRuleById,
  confirmRecurringOccurrence,
  createRecurringRule,
  deleteRecurringRuleById,
  editRecurringRule,
  getDueWorklist,
  getRecurringRules,
  pauseRecurringRuleById,
  resumeRecurringRuleById,
  unarchiveRecurringRuleById,
} from "./recurring";
import { createTransaction, getTransaction } from "./transactions";
import { createInsurancePolicy } from "./insurance";
import { createAccount } from "./accounts";
import { createCategory } from "./categories";

beforeEach(setupTestDb);
afterEach(teardownTestDb);

describe("recurring service", () => {
  it("creates a rule and lists it", () => {
    const account = createAccount({ name: "Checking", type: "checking", openingBalanceMinor: 0 });
    const category = createCategory({ name: "Rent", type: "expense" });

    const rule = createRecurringRule({
      type: "expense",
      accountId: account.id,
      categoryId: category.id,
      amountMinor: 100_000,
      frequency: "monthly",
      startDate: "2026-01-15",
      note: "Rent",
    });

    expect(getRecurringRules().map((r) => r.id)).toContain(rule.id);
  });

  it("generates monthly periods up to today, clamping day-of-month across shorter months", () => {
    const account = createAccount({ name: "Checking", type: "checking", openingBalanceMinor: 0 });
    const category = createCategory({ name: "Rent", type: "expense" });
    const rule = createRecurringRule({
      type: "expense",
      accountId: account.id,
      categoryId: category.id,
      amountMinor: 100_000,
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
    const account = createAccount({ name: "Checking", type: "checking", openingBalanceMinor: 0 });
    const category = createCategory({ name: "Rent", type: "expense" });
    const rule = createRecurringRule({
      type: "expense",
      accountId: account.id,
      categoryId: category.id,
      amountMinor: 100_000,
      frequency: "monthly",
      startDate: "2026-01-15",
      endDate: "2026-02-01",
      note: "Rent",
    });

    const due = getDueWorklist("2026-12-31").filter((i) => i.ruleId === rule.id);

    expect(due.map((i) => i.periodStart)).toEqual(["2026-01-15"]);
  });

  it("generates weekly periods 7 days apart", () => {
    const account = createAccount({ name: "Checking", type: "checking", openingBalanceMinor: 0 });
    const category = createCategory({ name: "Groceries", type: "expense" });
    const rule = createRecurringRule({
      type: "expense",
      accountId: account.id,
      categoryId: category.id,
      amountMinor: 5_000,
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

  it("confirming a specific due period marks off only that period, tagging the transaction with it", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-20T00:00:00Z"));

    const account = createAccount({ name: "Checking", type: "checking", openingBalanceMinor: 0 });
    const category = createCategory({ name: "Rent", type: "expense" });
    const rule = createRecurringRule({
      type: "expense",
      accountId: account.id,
      categoryId: category.id,
      amountMinor: 100_000,
      frequency: "monthly",
      startDate: "2026-01-15",
      note: "Rent",
    });

    expect(getDueWorklist().map((i) => i.periodStart)).toEqual([
      "2026-01-15",
      "2026-02-15",
      "2026-03-15",
      "2026-04-15",
    ]);

    // Confirm April specifically, out of order — unlike the old count-based
    // logic (which always settled the oldest unlogged period regardless of
    // which date the user picked), this marks off exactly the period
    // confirmed, leaving the earlier ones still due.
    const transaction = confirmRecurringOccurrence({
      ruleId: rule.id,
      periodStart: "2026-04-15",
      amountMinor: 100_000,
      date: "2026-04-18",
      note: null,
    });
    expect(transaction).toMatchObject({ recurringRuleId: rule.id, periodStart: "2026-04-15" });

    const due = getDueWorklist().map((i) => i.periodStart);
    expect(due).toEqual(["2026-01-15", "2026-02-15", "2026-03-15"]);

    vi.useRealTimers();
  });

  it("rejects double-confirming the same period with a friendly error, on the second attempt", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-20T00:00:00Z"));

    const account = createAccount({ name: "Checking", type: "checking", openingBalanceMinor: 0 });
    const category = createCategory({ name: "Rent", type: "expense" });
    const rule = createRecurringRule({
      type: "expense",
      accountId: account.id,
      categoryId: category.id,
      amountMinor: 100_000,
      frequency: "monthly",
      startDate: "2026-01-15",
      note: "Rent",
    });

    const input = {
      ruleId: rule.id,
      periodStart: "2026-01-15",
      amountMinor: 100_000,
      date: "2026-01-16",
      note: null,
    };
    confirmRecurringOccurrence(input);

    // A double submit / two tabs re-sending the same confirmation — the
    // period is no longer due, so this fails with a user-facing message
    // instead of silently logging a second transaction for it.
    expect(() => confirmRecurringOccurrence(input)).toThrow(/not due|already/i);
    expect(getDueWorklist().filter((i) => i.ruleId === rule.id)).toHaveLength(0);

    vi.useRealTimers();
  });

  it("the (recurring_rule_id, period_start) unique index blocks a duplicate at the DB level even if a caller bypasses the due-list check", () => {
    const account = createAccount({ name: "Checking", type: "checking", openingBalanceMinor: 0 });
    const category = createCategory({ name: "Rent", type: "expense" });
    const rule = createRecurringRule({
      type: "expense",
      accountId: account.id,
      categoryId: category.id,
      amountMinor: 100_000,
      frequency: "monthly",
      startDate: "2026-01-15",
      note: "Rent",
    });

    createTransaction({
      type: "expense",
      accountId: account.id,
      categoryId: category.id,
      amountMinor: 100_000,
      date: "2026-01-15",
      recurringRuleId: rule.id,
      periodStart: "2026-01-15",
    });

    // This is the final backstop for a genuine race between two concurrent
    // confirms of the same period — the due-list pre-check alone can't catch
    // that, since both requests could read "still due" before either commits.
    expect(() =>
      createTransaction({
        type: "expense",
        accountId: account.id,
        categoryId: category.id,
        amountMinor: 100_000,
        date: "2026-01-16",
        recurringRuleId: rule.id,
        periodStart: "2026-01-15",
      }),
    ).toThrow();
  });

  it("rejects confirming a period that is not actually due yet", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-20T00:00:00Z"));

    const account = createAccount({ name: "Checking", type: "checking", openingBalanceMinor: 0 });
    const category = createCategory({ name: "Rent", type: "expense" });
    const rule = createRecurringRule({
      type: "expense",
      accountId: account.id,
      categoryId: category.id,
      amountMinor: 100_000,
      frequency: "monthly",
      startDate: "2026-01-15",
      note: "Rent",
    });

    // Only January is due as of today; a client sending April's date (e.g. a
    // stale form, or a tampered request) must not be trusted.
    expect(() =>
      confirmRecurringOccurrence({
        ruleId: rule.id,
        periodStart: "2026-04-15",
        amountMinor: 100_000,
        date: "2026-04-15",
        note: null,
      }),
    ).toThrow(/not due/i);

    vi.useRealTimers();
  });

  it("legacy rows (period_start = NULL, from before this feature) are skipped via a count-based fallback", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-20T00:00:00Z"));

    const account = createAccount({ name: "Checking", type: "checking", openingBalanceMinor: 0 });
    const category = createCategory({ name: "Rent", type: "expense" });
    const rule = createRecurringRule({
      type: "expense",
      accountId: account.id,
      categoryId: category.id,
      amountMinor: 100_000,
      frequency: "monthly",
      startDate: "2026-01-15",
      note: "Rent",
    });

    // Simulate two confirmations made before the period_start column existed.
    createTransaction({
      type: "expense",
      accountId: account.id,
      categoryId: category.id,
      amountMinor: 100_000,
      date: "2026-01-20",
      recurringRuleId: rule.id,
    });
    createTransaction({
      type: "expense",
      accountId: account.id,
      categoryId: category.id,
      amountMinor: 100_000,
      date: "2026-02-18",
      recurringRuleId: rule.id,
    });

    // The oldest 2 scheduled periods (Jan, Feb) are treated as settled by the
    // legacy count fallback; March and April are still due.
    expect(getDueWorklist().map((i) => i.periodStart)).toEqual(["2026-03-15", "2026-04-15"]);

    // A fresh, period_start-tagged confirmation layers correctly on top of that legacy history.
    confirmRecurringOccurrence({
      ruleId: rule.id,
      periodStart: "2026-04-15",
      amountMinor: 100_000,
      date: "2026-04-20",
      note: null,
    });
    expect(getDueWorklist().map((i) => i.periodStart)).toEqual(["2026-03-15"]);

    vi.useRealTimers();
  });

  it("confirmRecurringOccurrence throws for an unknown rule id", () => {
    expect(() =>
      confirmRecurringOccurrence({
        ruleId: 999,
        periodStart: "2026-01-01",
        amountMinor: 10_000,
        date: "2026-01-01",
        note: null,
      }),
    ).toThrow("Recurring rule not found");
  });

  it("createRecurringRule rejects a recurring transfer whose from and to account are the same", () => {
    const account = createAccount({ name: "Checking", type: "checking", openingBalanceMinor: 0 });

    expect(() =>
      createRecurringRule({
        type: "transfer",
        accountId: account.id,
        toAccountId: account.id,
        amountMinor: 50_000,
        frequency: "monthly",
        startDate: "2026-01-01",
        note: "Self transfer",
      }),
    ).toThrow("different destination account");
  });

  it("sorts the due worklist by period start across multiple rules", () => {
    const account = createAccount({ name: "Checking", type: "checking", openingBalanceMinor: 0 });
    const rent = createCategory({ name: "Rent", type: "expense" });
    const internet = createCategory({ name: "Internet", type: "expense" });

    createRecurringRule({
      type: "expense",
      accountId: account.id,
      categoryId: rent.id,
      amountMinor: 100_000,
      frequency: "monthly",
      startDate: "2026-01-01",
      note: "Rent",
    });
    createRecurringRule({
      type: "expense",
      accountId: account.id,
      categoryId: internet.id,
      amountMinor: 5_000,
      frequency: "monthly",
      startDate: "2026-01-15",
      note: "Internet",
    });

    const periodStarts = getDueWorklist("2026-01-20").map((i) => i.periodStart);
    expect(periodStarts).toEqual([...periodStarts].sort());
  });
  it("the due worklist carries the suggested amount in minor units with its currency", () => {
    const account = createAccount({
      name: "Wise USD",
      type: "savings",
      currency: "USD",
      openingBalanceMinor: 0,
    });
    const category = createCategory({ name: "Hosting", type: "expense" });
    createRecurringRule({
      type: "expense",
      accountId: account.id,
      categoryId: category.id,
      amountMinor: 2_900,
      currency: "USD",
      frequency: "monthly",
      startDate: "2026-01-10",
      note: "Hosting",
    });

    const [first] = getDueWorklist("2026-01-20");

    // An amount without its currency cannot be formatted at all — 2900 is
    // $29.00, not ₹29.00 and not $2,900.
    expect(first).toMatchObject({ suggestedAmountMinor: 2_900, currency: "USD" });
  });

  it("createRecurringRule rejects an amount that is zero, negative or not whole minor units", () => {
    const account = createAccount({ name: "Checking", type: "checking", openingBalanceMinor: 0 });
    const category = createCategory({ name: "Rent", type: "expense" });
    const base = {
      type: "expense",
      accountId: account.id,
      categoryId: category.id,
      frequency: "monthly",
      startDate: "2026-01-01",
      note: "Rent",
    } as const;

    expect(() => createRecurringRule({ ...base, amountMinor: 0 })).toThrow(/greater than zero/);
    expect(() => createRecurringRule({ ...base, amountMinor: -1 })).toThrow(/greater than zero/);
    expect(() => createRecurringRule({ ...base, amountMinor: 100.5 })).toThrow(/greater than zero/);
  });

  it("a cross-currency recurring rule must state both legs", () => {
    const from = createAccount({ name: "HDFC", type: "savings", openingBalanceMinor: 0 });
    const to = createAccount({
      name: "Wise USD",
      type: "savings",
      currency: "USD",
      openingBalanceMinor: 0,
    });

    expect(() =>
      createRecurringRule({
        type: "transfer",
        accountId: from.id,
        toAccountId: to.id,
        amountMinor: 830_000,
        toCurrency: "USD",
        frequency: "monthly",
        startDate: "2026-01-01",
        note: "Monthly USD top-up",
      }),
    ).toThrow(/both the amount sent and received/);

    const rule = createRecurringRule({
      type: "transfer",
      accountId: from.id,
      toAccountId: to.id,
      amountMinor: 830_000,
      toAmountMinor: 10_000,
      toCurrency: "USD",
      frequency: "monthly",
      startDate: "2026-01-01",
      note: "Monthly USD top-up",
    });

    expect(rule).toMatchObject({ toAmountMinor: 10_000, toCurrency: "USD" });
  });

  it("confirming a cross-currency rule records what actually landed, and refuses to guess it", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-20T00:00:00Z"));

    const from = createAccount({ name: "HDFC", type: "savings", openingBalanceMinor: 0 });
    const to = createAccount({
      name: "Wise USD",
      type: "savings",
      currency: "USD",
      openingBalanceMinor: 0,
    });
    const rule = createRecurringRule({
      type: "transfer",
      accountId: from.id,
      toAccountId: to.id,
      amountMinor: 830_000,
      toAmountMinor: 10_000,
      toCurrency: "USD",
      frequency: "monthly",
      startDate: "2026-01-15",
      note: "Monthly USD top-up",
    });

    // Deriving the incoming leg from a reference rate would record a figure
    // the bank never moved, so omitting it is an error rather than a default.
    expect(() =>
      confirmRecurringOccurrence({
        ruleId: rule.id,
        periodStart: "2026-01-15",
        amountMinor: 830_000,
        date: "2026-01-16",
        note: null,
      }),
    ).toThrow(/amount received/);

    const transaction = confirmRecurringOccurrence({
      ruleId: rule.id,
      periodStart: "2026-01-15",
      amountMinor: 831_500,
      toAmountMinor: 9_980, // what the bank actually credited, not 830000/83
      date: "2026-01-16",
      note: null,
    });

    expect(transaction).toMatchObject({
      amountMinor: 831_500,
      currency: "INR",
      toAmountMinor: 9_980,
      toCurrency: "USD",
    });

    vi.useRealTimers();
  });
});

/** A monthly rent rule starting well in the past, so it always has due periods. */
function seedRule(overrides: Partial<Parameters<typeof createRecurringRule>[0]> = {}) {
  const account = createAccount({ name: "Checking", type: "checking", currency: "INR" });
  const category = createCategory({ name: "Rent", type: "expense" });
  const rule = createRecurringRule({
    type: "expense",
    accountId: account.id,
    categoryId: category.id,
    amountMinor: 100_000,
    currency: "INR",
    frequency: "monthly",
    startDate: "2026-01-15",
    note: "Rent",
    ...overrides,
  });
  return { account, category, rule };
}

describe("editRecurringRule", () => {
  it("edits in place rather than producing a second rule", () => {
    const { rule } = seedRule({ note: "Rnt" });

    const edited = editRecurringRule(rule.id, { note: "Rent", amountMinor: 120_000 });

    expect(edited.id).toBe(rule.id);
    expect(edited.note).toBe("Rent");
    expect(edited.amountMinor).toBe(120_000);
    expect(getRecurringRules()).toHaveLength(1);
  });

  it("throws when the rule is missing", () => {
    expect(() => editRecurringRule(999, { note: "Nope" })).toThrow(/not found/);
  });

  it("re-applies the create-time validation to the merged row", () => {
    const { account, rule } = seedRule();

    expect(() => editRecurringRule(rule.id, { amountMinor: 0 })).toThrow(/greater than zero/);
    expect(() => editRecurringRule(rule.id, { amountMinor: 100.5 })).toThrow(/greater than zero/);
    // Type merged from the patch, destination from the stored row: a transfer
    // to the rule's own account is caught just as it is on create.
    expect(() => editRecurringRule(rule.id, { type: "transfer", toAccountId: account.id })).toThrow(
      /different destination account/,
    );
    // Cross-currency legs must stay paired.
    expect(() => editRecurringRule(rule.id, { toCurrency: "USD" })).toThrow(
      /both the amount sent and received/,
    );
  });

  it("changes the amount a future period suggests without touching what is already logged", () => {
    const { rule } = seedRule();
    const firstDue = getDueWorklist("2026-03-20")[0];
    const logged = confirmRecurringOccurrence({
      ruleId: rule.id,
      periodStart: firstDue.periodStart,
      amountMinor: 100_000,
      date: firstDue.periodStart,
      note: "Rent",
    });

    editRecurringRule(rule.id, { amountMinor: 150_000 });

    expect(getTransaction(logged.id)!.amountMinor).toBe(100_000);
    const stillDue = getDueWorklist("2026-03-20");
    expect(stillDue.every((item) => item.suggestedAmountMinor === 150_000)).toBe(true);
    expect(stillDue.some((item) => item.periodStart === firstDue.periodStart)).toBe(false);
  });

  it("refuses a start-date or frequency change once a period has been confirmed", () => {
    const { rule } = seedRule();
    const firstDue = getDueWorklist("2026-03-20")[0];
    confirmRecurringOccurrence({
      ruleId: rule.id,
      periodStart: firstDue.periodStart,
      amountMinor: 100_000,
      date: firstDue.periodStart,
      note: "Rent",
    });

    // Moving the schedule would strand the confirmation's `period_start` on a
    // period that no longer exists, so the period it settled would come back
    // as due — a rewrite of confirmed history by side effect.
    expect(() => editRecurringRule(rule.id, { startDate: "2026-02-01" })).toThrow(
      /start date and frequency can't be changed/,
    );
    expect(() => editRecurringRule(rule.id, { frequency: "quarterly" })).toThrow(
      /start date and frequency can't be changed/,
    );
    // An end date is fine — that is how a rule is wound down.
    expect(editRecurringRule(rule.id, { endDate: "2026-06-30" }).endDate).toBe("2026-06-30");
  });

  it("allows a start-date change while nothing has been confirmed", () => {
    const { rule } = seedRule();

    expect(editRecurringRule(rule.id, { startDate: "2026-02-01" }).startDate).toBe("2026-02-01");
    expect(editRecurringRule(rule.id, { frequency: "quarterly" }).frequency).toBe("quarterly");
  });

  it("refuses a currency change once a period has been confirmed", () => {
    const { rule } = seedRule();
    const firstDue = getDueWorklist("2026-03-20")[0];
    confirmRecurringOccurrence({
      ruleId: rule.id,
      periodStart: firstDue.periodStart,
      amountMinor: 100_000,
      date: firstDue.periodStart,
      note: "Rent",
    });

    expect(() => editRecurringRule(rule.id, { currency: "USD" })).toThrow(
      /currency can't be changed/,
    );
  });
});

describe("pause vs archive", () => {
  it("pausing stops future due periods but keeps the rule listed", () => {
    const { rule } = seedRule();
    expect(getDueWorklist("2026-03-20").length).toBeGreaterThan(0);

    pauseRecurringRuleById(rule.id);

    expect(getDueWorklist("2026-03-20")).toEqual([]);
    // Still a current rule — pausing is reversible and the rule is expected
    // to come back, so it stays visible.
    expect(getRecurringRules().map((r) => r.id)).toEqual([rule.id]);

    resumeRecurringRuleById(rule.id);
    expect(getDueWorklist("2026-03-20").length).toBeGreaterThan(0);
  });

  it("archiving retires the rule: it leaves listings and the due worklist", () => {
    const { rule } = seedRule();

    archiveRecurringRuleById(rule.id);

    expect(getRecurringRules()).toEqual([]);
    expect(getDueWorklist("2026-03-20")).toEqual([]);
    expect(getRecurringRules({ includeArchived: true }).map((r) => r.id)).toEqual([rule.id]);
  });

  it("keeps the two states independent, so neither implies the other", () => {
    const { rule } = seedRule();

    archiveRecurringRuleById(rule.id);
    expect(getRecurringRules({ includeArchived: true })[0].pausedAt).toBeNull();

    unarchiveRecurringRuleById(rule.id);
    pauseRecurringRuleById(rule.id);
    expect(getRecurringRules()[0].pausedAt).not.toBeNull();
    expect(getRecurringRules({ includeArchived: true })[0].id).toBe(rule.id);
  });

  it("leaves confirmed history untouched when a rule is archived", () => {
    const { rule } = seedRule();
    const firstDue = getDueWorklist("2026-03-20")[0];
    const logged = confirmRecurringOccurrence({
      ruleId: rule.id,
      periodStart: firstDue.periodStart,
      amountMinor: 100_000,
      date: firstDue.periodStart,
      note: "Rent",
    });

    archiveRecurringRuleById(rule.id);

    expect(getTransaction(logged.id)).not.toBeNull();
    expect(getTransaction(logged.id)!.recurringRuleId).toBe(rule.id);
  });

  it("throws when the rule is missing", () => {
    expect(() => pauseRecurringRuleById(999)).toThrow(/not found/);
    expect(() => resumeRecurringRuleById(999)).toThrow(/not found/);
    expect(() => archiveRecurringRuleById(999)).toThrow(/not found/);
    expect(() => unarchiveRecurringRuleById(999)).toThrow(/not found/);
  });
});

describe("deleteRecurringRuleById", () => {
  it("deletes a rule nothing references", () => {
    const { rule } = seedRule();

    deleteRecurringRuleById(rule.id);

    expect(getRecurringRules({ includeArchived: true })).toEqual([]);
  });

  it("refuses to delete a rule with a confirmed transaction, and names archiving instead", () => {
    const { rule } = seedRule();
    const firstDue = getDueWorklist("2026-03-20")[0];
    confirmRecurringOccurrence({
      ruleId: rule.id,
      periodStart: firstDue.periodStart,
      amountMinor: 100_000,
      date: firstDue.periodStart,
      note: "Rent",
    });

    expect(() => deleteRecurringRuleById(rule.id)).toThrow(/Archive it instead/);
    expect(getRecurringRules({ includeArchived: true })).toHaveLength(1);
  });

  it("refuses to delete a rule whose only confirmation has been voided", () => {
    const { rule } = seedRule();
    const firstDue = getDueWorklist("2026-03-20")[0];
    const logged = confirmRecurringOccurrence({
      ruleId: rule.id,
      periodStart: firstDue.periodStart,
      amountMinor: 100_000,
      date: firstDue.periodStart,
      note: "Rent",
    });
    getDb().run(
      sql`UPDATE finance_transactions SET voided_at = '2026-03-21', void_reason = 'typo' WHERE id = ${logged.id}`,
    );

    // The voided row still carries (recurring_rule_id, period_start), which is
    // what tells the worklist the period was settled.
    expect(() => deleteRecurringRuleById(rule.id)).toThrow(/can't be deleted/);
  });

  it("refuses to delete a rule an insurance policy uses for its premium schedule", () => {
    const { rule } = seedRule();
    createInsurancePolicy({
      type: "term",
      provider: "LIC",
      name: "Term Plan",
      currency: "INR",
      premiumAmountMinor: 1_250_000,
      premiumFrequency: "yearly",
      startDate: "2026-01-01",
      recurringRuleId: rule.id,
    });

    expect(() => deleteRecurringRuleById(rule.id)).toThrow(/insurance policy uses this rule/);
  });

  it("throws when the rule is missing", () => {
    expect(() => deleteRecurringRuleById(999)).toThrow(/not found/);
  });
});
