import { and, count, eq, isNotNull, isNull } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import { getDb } from "@/modules/core/db/client";
import { recurringRules } from "../../schema/domain/recurring-rules";
import { accounts } from "../../schema/domain/accounts";
import { categories } from "../../schema/domain/categories";
import { transactions } from "../../schema/domain/transactions";
import { insurancePolicies } from "../../schema/domain/insurance-policies";
import { live } from "../lifecycle";
import { unarchived, type LifecycleScope } from "../lifecycle";

export type NewRecurringRule = typeof recurringRules.$inferInsert;

const toAccount = alias(accounts, "recurring_to_account");

export function insertRecurringRule(entry: NewRecurringRule) {
  return getDb().insert(recurringRules).values(entry).returning().get();
}

export function getRecurringRuleById(id: number) {
  return getDb().select().from(recurringRules).where(eq(recurringRules.id, id)).get();
}

/** Rules still in use. An archived rule is retained — confirmed transactions
 * reference it — but produces no due periods and stays out of listings. */
export function listRecurringRules(scope: LifecycleScope = {}) {
  const query = getDb()
    .select({
      id: recurringRules.id,
      type: recurringRules.type,
      accountId: recurringRules.accountId,
      accountName: accounts.name,
      toAccountId: recurringRules.toAccountId,
      toAccountName: toAccount.name,
      categoryId: recurringRules.categoryId,
      categoryName: categories.name,
      /** Minor units, named so. Aliasing it as `amount` made a ₹2,500 rule
       * render as 250,000.00 in the recurring table, and type-checked. */
      amountMinor: recurringRules.amountMinor,
      currency: recurringRules.currency,
      toAmountMinor: recurringRules.toAmountMinor,
      toCurrency: recurringRules.toCurrency,
      frequency: recurringRules.frequency,
      startDate: recurringRules.startDate,
      endDate: recurringRules.endDate,
      note: recurringRules.note,
      linkedGoalId: recurringRules.linkedGoalId,
      /** Selected so `getDueWorklist` can skip a paused rule — pausing that
       * still produced due periods would be indistinguishable from not pausing. */
      pausedAt: recurringRules.pausedAt,
    })
    .from(recurringRules)
    .leftJoin(accounts, eq(recurringRules.accountId, accounts.id))
    .leftJoin(toAccount, eq(recurringRules.toAccountId, toAccount.id))
    .leftJoin(categories, eq(recurringRules.categoryId, categories.id));
  return (scope.includeArchived ? query : query.where(unarchived(recurringRules.archivedAt)))
    .orderBy(recurringRules.startDate)
    .all();
}

/**
 * How many of this rule's logged transactions predate the `period_start`
 * column (`period_start IS NULL`) — see `getDueWorklist` in
 * service/domain/recurring.ts for how this is used as a legacy fallback.
 */
export function countLegacyLoggedForRule(ruleId: number): number {
  return (
    getDb()
      .select({ value: count() })
      .from(transactions)
      .where(
        and(
          eq(transactions.recurringRuleId, ruleId),
          isNull(transactions.periodStart),
          live(transactions.voidedAt),
        ),
      )
      .get()?.value ?? 0
  );
}

/**
 * The exact period_start values this rule has an explicitly-tagged, still-live
 * confirmation for.
 *
 * Voided confirmations are excluded, which is what lets a wrongly-confirmed
 * period come back to the due worklist. Without the filter the period stayed
 * reported as confirmed forever: the user could neither re-confirm it nor see
 * that it needed attention.
 */
export function listLoggedPeriodStartsForRule(ruleId: number): string[] {
  return getDb()
    .select({ periodStart: transactions.periodStart })
    .from(transactions)
    .where(
      and(
        eq(transactions.recurringRuleId, ruleId),
        isNotNull(transactions.periodStart),
        live(transactions.voidedAt),
      ),
    )
    .all()
    .map((row) => row.periodStart as string);
}

/* ── Write paths: edit in place, pause, archive, delete ──────────────────────
 * A rule is a descriptive row — it describes a schedule, it is not itself a
 * ledger entry — so it is edited in place. The confirmed transactions it
 * produced are separate, immutable rows and are never rewritten by an edit. */

export function updateRecurringRule(id: number, patch: Partial<Omit<NewRecurringRule, "id">>) {
  return getDb()
    .update(recurringRules)
    .set(patch)
    .where(eq(recurringRules.id, id))
    .returning()
    .get();
}

/**
 * Pause and archive are different states and both are kept.
 *
 * **Pausing** (`paused_at`) suspends future due periods on a rule that is still
 * current — a SIP stopped for three months, rent while subletting. The rule
 * stays in listings and pickers and is expected to resume.
 * **Archiving** (`archived_at`) retires the rule: the arrangement has ended,
 * and it drops out of listings and pickers entirely.
 *
 * Collapsing the two would lose that distinction in both directions: a resumed
 * rule would have to be un-retired from a list it is no longer in, and a
 * retired one would keep showing up as "paused" forever.
 */
export function pauseRecurringRule(id: number, pausedAt: string | null) {
  return getDb()
    .update(recurringRules)
    .set({ pausedAt })
    .where(eq(recurringRules.id, id))
    .returning()
    .get();
}

/** `null` un-archives. */
export function archiveRecurringRule(id: number, archivedAt: string | null) {
  return getDb()
    .update(recurringRules)
    .set({ archivedAt })
    .where(eq(recurringRules.id, id))
    .returning()
    .get();
}

/**
 * Whether this rule has any confirmed transaction behind it.
 *
 * Counts **voided** rows too: a voided confirmation still carries
 * `(recurring_rule_id, period_start)`, which is what tells the due worklist the
 * period was settled, and it is still part of the correction trail. Deleting the
 * rule from under it would orphan both.
 */
export function recurringRuleHasConfirmations(id: number): boolean {
  return (
    getDb()
      .select({ id: transactions.id })
      .from(transactions)
      .where(eq(transactions.recurringRuleId, id))
      .get() !== undefined
  );
}

/** Whether an insurance policy points at this rule for its premium schedule. */
export function recurringRuleHasLinkedPolicy(id: number): boolean {
  return (
    getDb()
      .select({ id: insurancePolicies.id })
      .from(insurancePolicies)
      .where(eq(insurancePolicies.recurringRuleId, id))
      .get() !== undefined
  );
}

/** Only reached for a rule nothing references — the service checks first. */
export function deleteRecurringRule(id: number) {
  getDb().delete(recurringRules).where(eq(recurringRules.id, id)).run();
}
