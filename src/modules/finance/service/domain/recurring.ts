import { createTransaction } from "./transactions";
import {
  countLoggedForRule,
  getRecurringRuleById,
  insertRecurringRule,
  listRecurringRules,
  type NewRecurringRule,
} from "../../db/queries/domain/recurring";
import type { RecurringFrequency } from "../../types";
import { todayIso } from "@/lib/dates";
import { DomainError } from "@/modules/core/errors";

export function createRecurringRule(entry: NewRecurringRule) {
  return insertRecurringRule(entry);
}

export function getRecurringRules() {
  return listRecurringRules();
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
  suggestedAmount: number;
  suggestedNote: string | null;
}

/**
 * Rule-periods between each rule's start_date and today that don't yet have
 * a matching logged transaction — the oldest N periods for a rule are
 * considered "logged" once N real transactions have been confirmed against
 * it (via `recurring_rule_id`), regardless of the exact date the user picked
 * when confirming (they can edit it). No auto-logging, no notifications —
 * this is only surfaced when the finance section is open. See
 * docs/prd/finance/recurring-transactions.md.
 */
export function getDueWorklist(today = todayIso()): DueRecurringItem[] {
  const rules = listRecurringRules();
  const items: DueRecurringItem[] = [];

  for (const rule of rules) {
    const periods = generatePeriodStarts(rule, today);
    const loggedCount = countLoggedForRule(rule.id);
    const due = periods.slice(loggedCount);

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
        suggestedAmount: rule.amount,
        suggestedNote: rule.note,
      });
    }
  }

  return items.sort((a, b) => a.periodStart.localeCompare(b.periodStart));
}

export interface ConfirmRecurringInput {
  ruleId: number;
  amount: number;
  date: string;
  note: string | null;
}

/** Creates the real transaction for one confirmed due period, tagged so it counts against the rule going forward. */
export function confirmRecurringOccurrence(input: ConfirmRecurringInput) {
  const rule = getRecurringRuleById(input.ruleId);
  if (!rule) throw new DomainError("Recurring rule not found");

  return createTransaction({
    type: rule.type,
    accountId: rule.accountId,
    toAccountId: rule.toAccountId,
    categoryId: rule.categoryId,
    amount: input.amount,
    date: input.date,
    note: input.note,
    recurringRuleId: rule.id,
  });
}
