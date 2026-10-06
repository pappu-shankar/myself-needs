import { createTransaction } from "./transactions";
import {
  archiveRecurringRule,
  countLegacyLoggedForRule,
  deleteRecurringRule,
  getRecurringRuleById,
  insertRecurringRule,
  listLoggedPeriodStartsForRule,
  listRecurringRules,
  pauseRecurringRule,
  recurringRuleHasConfirmations,
  recurringRuleHasLinkedPolicy,
  updateRecurringRule,
  type NewRecurringRule,
} from "../../db/queries/domain/recurring";
import type { LifecycleScope } from "../../db/queries/lifecycle";
import type { RecurringFrequency } from "../../types";
import type { Currency } from "../../db/schema/currency";
import { todayIso } from "@/lib/dates";
import { DomainError } from "@/modules/core/errors";

function validateRecurringRule(entry: NewRecurringRule): void {
  if (entry.type === "transfer" && entry.toAccountId === entry.accountId) {
    throw new DomainError("A recurring transfer needs a different destination account.");
  }
  if (!Number.isInteger(entry.amountMinor) || entry.amountMinor <= 0) {
    throw new DomainError("A recurring amount must be greater than zero.");
  }
  // A cross-currency rule states both legs for the same reason a
  // cross-currency transfer does: the schedule cannot know what rate the bank
  // will apply, so the pair is what the user expects to move, and the
  // confirmation records what actually moved.
  if ((entry.toCurrency == null) !== (entry.toAmountMinor == null)) {
    throw new DomainError(
      "A cross-currency recurring rule needs both the amount sent and received.",
    );
  }
}

export function createRecurringRule(entry: NewRecurringRule) {
  validateRecurringRule(entry);
  return insertRecurringRule(entry);
}

/** One rule, for the action layer: the currencies to convert a typed amount
 * with come from the rule, not from an assumption. */
export function getRecurringRule(id: number) {
  return getRecurringRuleById(id) ?? null;
}

export function getRecurringRules(scope: LifecycleScope = {}) {
  return listRecurringRules(scope);
}

/** Adds `months` (clamping the day to the target month's length, e.g. the 31st of a 30-day month becomes the 30th). */
function addMonths(dateStr: string, months: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const totalMonths = m - 1 + months;
  const targetYear = y + Math.floor(totalMonths / 12);
  const targetMonth0 = ((totalMonths % 12) + 12) % 12;
  const lastDayOfTargetMonth = new Date(Date.UTC(targetYear, targetMonth0 + 1, 0)).getUTCDate();
  const day = Math.min(d, lastDayOfTargetMonth);
  return new Date(Date.UTC(targetYear, targetMonth0, day)).toISOString().slice(0, 10);
}

function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

const MONTHS_PER_PERIOD: Record<Exclude<RecurringFrequency, "weekly">, number> = {
  monthly: 1,
  quarterly: 3,
  half_yearly: 6,
  yearly: 12,
};

function periodStartFor(startDate: string, frequency: RecurringFrequency, n: number): string {
  if (frequency === "weekly") return addDays(startDate, 7 * n);
  return addMonths(startDate, MONTHS_PER_PERIOD[frequency] * n);
}

const MAX_PERIODS = 10_000; // safety cap against a malformed/ancient start_date looping forever

/**
 * Every period-start date from `startDate` up to (and including) `today`,
 * stopping at `endDate` if set. Just the schedule — whether each one has
 * already been logged is a separate question (see `getDueWorklist`).
 */
function generatePeriodStarts(
  rule: { startDate: string; frequency: RecurringFrequency; endDate: string | null },
  today: string,
): string[] {
  const periods: string[] = [];
  for (let n = 0; n < MAX_PERIODS; n++) {
    const periodStart = periodStartFor(rule.startDate, rule.frequency, n);
    if (periodStart > today) break;
    if (rule.endDate && periodStart > rule.endDate) break;
    periods.push(periodStart);
  }
  return periods;
}

function formatPeriodLabel(periodStart: string, frequency: RecurringFrequency): string {
  if (frequency === "weekly") return `week of ${periodStart}`;
  const [year, month] = periodStart.split("-").map(Number);
  if (frequency === "yearly") return `${year}`;
  const monthName = new Date(Date.UTC(year, month - 1, 1)).toLocaleString("en-US", {
    month: "short",
    timeZone: "UTC",
  });
  return `${monthName} ${year}`;
}

export interface DueRecurringItem {
  ruleId: number;
  label: string;
  periodStart: string;
  type: "income" | "expense" | "transfer";
  accountName: string | null;
  toAccountName: string | null;
  categoryName: string | null;
  /** Minor units of `currency` — the rule's own currency, which is the source
   * account's. */
  suggestedAmountMinor: number;
  currency: Currency;
  /** Set only for a cross-currency rule: the expected incoming leg, which the
   * confirmation may correct to what the bank actually credited. */
  suggestedToAmountMinor: number | null;
  toCurrency: Currency | null;
  suggestedNote: string | null;
}

/**
 * Rule-periods between each rule's start_date and today that don't yet have
 * a matching logged transaction. Each confirmation tags its transaction with
 * the exact `period_start` (YYYY-MM-DD) of the period it settles, so a
 * period is "due" unless a transaction already carries that same
 * `(recurring_rule_id, period_start)` pair — the unique index on that pair
 * is what makes a double-submit/two-tabs confirm fail at the DB instead of
 * silently marking a different (usually future) period as logged.
 *
 * Legacy fallback: transactions confirmed before the `period_start` column
 * existed have `period_start = NULL`. The old confirm flow always settled
 * the *oldest* unlogged period regardless of which date the user picked, so
 * for each rule, `NULL`-period-start count identifies a contiguous prefix of
 * the earliest N scheduled periods as already settled — that prefix is
 * skipped here too, so nothing already logged before this feature shipped
 * reappears as due. Periods beyond that legacy prefix are checked by exact
 * `period_start` match instead, which also allows a later period to be
 * confirmed before an earlier one without misfiring the count.
 *
 * No auto-logging, no notifications — this is only surfaced when the
 * finance section is open. See docs/prd/finance/recurring-transactions.md.
 */
export function getDueWorklist(today = todayIso()): DueRecurringItem[] {
  const rules = listRecurringRules();
  const items: DueRecurringItem[] = [];

  for (const rule of rules) {
    // A paused rule produces nothing. Archived rules never reach here — the
    // listing already excludes them — but pausing is the *reversible* state and
    // has to be honoured separately, or pausing would do nothing at all.
    if (rule.pausedAt) continue;
    const periods = generatePeriodStarts(rule, today);
    const legacyCount = countLegacyLoggedForRule(rule.id);
    const loggedPeriods = new Set(listLoggedPeriodStartsForRule(rule.id));
    const due = periods.filter((periodStart, index) => {
      if (index < legacyCount) return false;
      return !loggedPeriods.has(periodStart);
    });

    if (due.length === 0) continue;

    // `listRecurringRules` joins the display names but not the currency
    // columns, so the stored row is re-read once per rule that actually has
    // something due — money without its currency cannot be formatted at all.
    const row = getRecurringRuleById(rule.id);
    if (!row) continue;

    const subject =
      rule.note ||
      (rule.type === "transfer" ? `Transfer to ${rule.toAccountName}` : rule.categoryName) ||
      "Recurring";

    for (const periodStart of due) {
      items.push({
        ruleId: rule.id,
        label: `${subject} — ${formatPeriodLabel(periodStart, rule.frequency)}`,
        periodStart,
        type: rule.type,
        accountName: rule.accountName,
        toAccountName: rule.toAccountName,
        categoryName: rule.categoryName,
        suggestedAmountMinor: rule.amountMinor,
        currency: row.currency,
        suggestedToAmountMinor: row.toAmountMinor,
        toCurrency: row.toCurrency as Currency | null,
        suggestedNote: rule.note,
      });
    }
  }

  return items.sort((a, b) => a.periodStart.localeCompare(b.periodStart));
}

export interface ConfirmRecurringInput {
  ruleId: number;
  /** The due date (YYYY-MM-DD) of the period being settled — from the due worklist, not freely chosen; re-verified against it below. */
  periodStart: string;
  /** Minor units of the rule's currency. */
  amountMinor: number;
  /** Required when the rule is cross-currency: what actually landed in the
   * destination account. Omitting it is rejected by `createTransaction`
   * rather than back-filled from a rate the bank did not use. */
  toAmountMinor?: number | null;
  date: string;
  note: string | null;
}

function isUniqueConstraintViolation(err: unknown): boolean {
  for (let current = err; current instanceof Error; current = current.cause as Error | undefined) {
    const code = (current as { code?: unknown }).code;
    if (code === "SQLITE_CONSTRAINT_UNIQUE" || code === "SQLITE_CONSTRAINT_PRIMARYKEY") return true;
  }
  return false;
}

/**
 * Creates the real transaction for one confirmed due period, tagged with the
 * period it settles. The client sends which period it's confirming, but that's
 * only ever a hint for the pre-filled form — this re-derives today's real due
 * worklist and rejects anything not actually in it (already logged, or not
 * due yet), so a stale form or a tampered request can't log a future period
 * early or relog a settled one. The unique `(recurring_rule_id, period_start)`
 * index is the final backstop against a race between two concurrent confirms
 * of the same period (double submit, two tabs) — mapped to a friendly error
 * instead of a raw constraint failure.
 */
export function confirmRecurringOccurrence(input: ConfirmRecurringInput) {
  const rule = getRecurringRuleById(input.ruleId);
  if (!rule) throw new DomainError("Recurring rule not found");

  const isDue = getDueWorklist().some(
    (item) => item.ruleId === rule.id && item.periodStart === input.periodStart,
  );
  if (!isDue) {
    throw new DomainError("This period is not due, or has already been logged.");
  }

  try {
    return createTransaction({
      type: rule.type,
      accountId: rule.accountId,
      toAccountId: rule.toAccountId,
      categoryId: rule.categoryId,
      amountMinor: input.amountMinor,
      toAmountMinor: input.toAmountMinor ?? null,
      date: input.date,
      note: input.note,
      recurringRuleId: rule.id,
      periodStart: input.periodStart,
    });
  } catch (err) {
    if (isUniqueConstraintViolation(err)) {
      throw new DomainError("This period has already been logged.");
    }
    throw err;
  }
}

/* ── Edit in place, pause, archive, delete (decision 17) ─────────────────────
 * A rule describes a schedule; it is not a ledger entry. Editing it changes
 * what future periods will suggest and never rewrites a confirmed transaction,
 * which is its own immutable row.
 *
 * Three retire-ish states, deliberately distinct:
 *  - **pause** — temporarily stop producing due periods; the rule stays in
 *    listings and is expected to resume.
 *  - **archive** — the arrangement has ended; the rule leaves listings and
 *    pickers, and its confirmed history stays exactly as it is.
 *  - **delete** — only for a rule nothing references at all. */

/**
 * Edits a rule in place, re-running the same validation `createRecurringRule`
 * applies to the merged row.
 *
 * `start_date` and `frequency` are refused once the rule has confirmed
 * transactions. Those two are what the period schedule is *derived* from, and
 * each confirmation is keyed to the exact `period_start` it settled — move the
 * schedule and the settled keys no longer line up with any generated period, so
 * periods already paid for reappear in the due worklist while the transaction
 * that paid them sits under a period that no longer exists. That is a rewrite of
 * confirmed history by side effect, which the PRD's "edit future occurrences
 * only" exists to prevent. End the rule and start a new one instead.
 */
export function editRecurringRule(id: number, patch: Partial<Omit<NewRecurringRule, "id">>) {
  const existing = getRecurringRuleById(id);
  if (!existing) throw new DomainError("Recurring rule not found");

  const merged = { ...existing, ...patch } as NewRecurringRule;
  validateRecurringRule(merged);

  const scheduleMoved =
    (patch.startDate !== undefined && patch.startDate !== existing.startDate) ||
    (patch.frequency !== undefined && patch.frequency !== existing.frequency);
  if (scheduleMoved && recurringRuleHasConfirmations(id)) {
    throw new DomainError(
      "This rule already has confirmed transactions, so its start date and frequency can't be " +
        "changed — the periods already logged are keyed to the current schedule. Set an end " +
        "date on this rule and create a new one for the new schedule instead.",
    );
  }

  // Same reason as an account's: the rule's amount is stored in minor units of
  // this currency, so re-denominating it silently restates every suggestion the
  // rule has made and will make.
  if (patch.currency !== undefined && patch.currency !== existing.currency) {
    if (recurringRuleHasConfirmations(id)) {
      throw new DomainError(
        "This rule already has confirmed transactions, so its currency can't be changed. " +
          "Archive it and create a new rule in the other currency instead.",
      );
    }
  }

  return updateRecurringRule(id, patch);
}

/** Stops future due periods without retiring the rule. Reversible with
 * `resumeRecurringRuleById`; nothing already confirmed is touched. */
export function pauseRecurringRuleById(id: number) {
  if (!getRecurringRuleById(id)) throw new DomainError("Recurring rule not found");
  return pauseRecurringRule(id, todayIso());
}

export function resumeRecurringRuleById(id: number) {
  if (!getRecurringRuleById(id)) throw new DomainError("Recurring rule not found");
  return pauseRecurringRule(id, null);
}

/**
 * Retires the rule: it leaves listings, pickers and the due worklist, while
 * every transaction it produced keeps counting. Distinct from pausing — see the
 * block comment above.
 */
export function archiveRecurringRuleById(id: number) {
  if (!getRecurringRuleById(id)) throw new DomainError("Recurring rule not found");
  return archiveRecurringRule(id, todayIso());
}

export function unarchiveRecurringRuleById(id: number) {
  if (!getRecurringRuleById(id)) throw new DomainError("Recurring rule not found");
  return archiveRecurringRule(id, null);
}

/**
 * Hard-deletes a rule, and **refuses** when a confirmed transaction or an
 * insurance policy references it.
 *
 * A transaction tagged with a deleted rule loses the only record of which
 * schedule it settled, which also loses the `(rule, period_start)` key the due
 * worklist uses to know the period is done.
 */
export function deleteRecurringRuleById(id: number) {
  if (!getRecurringRuleById(id)) throw new DomainError("Recurring rule not found");
  if (recurringRuleHasConfirmations(id)) {
    throw new DomainError(
      "This rule already has confirmed transactions, so it can't be deleted. Archive it " +
        "instead — it will stop appearing anywhere and the logged history stays intact.",
    );
  }
  if (recurringRuleHasLinkedPolicy(id)) {
    throw new DomainError(
      "An insurance policy uses this rule for its premium schedule, so it can't be deleted. " +
        "Unlink it from the policy first, or archive it instead.",
    );
  }
  deleteRecurringRule(id);
}
