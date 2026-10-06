import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { getDb } from "@/modules/core/db/client";
import { goals } from "../../schema/domain/goals";
import { investmentHoldings } from "../../schema/domain/investment-holdings";
import { recurringRules } from "../../schema/domain/recurring-rules";
import { unarchived, type LifecycleScope } from "../lifecycle";

export type NewGoal = typeof goals.$inferInsert;

export function insertGoal(entry: NewGoal) {
  return getDb().insert(goals).values(entry).returning().get();
}

export function updateGoal(id: number, patch: Partial<Omit<NewGoal, "id">>) {
  return getDb().update(goals).set(patch).where(eq(goals.id, id)).returning().get();
}

export function getGoalById(id: number) {
  return getDb().select().from(goals).where(eq(goals.id, id)).get();
}

/**
 * Funding order: essential, then important, then lifestyle; earliest target
 * date first within a tier, and a goal with no date last.
 *
 * Ordered in SQL so the funding waterfall, the list view and the alert engine
 * all see one order — a priority order that differs between views is worse than
 * having none, because the user cannot tell which one the money followed.
 *
 * An explicit CASE rather than the enum's text order: 'essential' <
 * 'important' < 'lifestyle' happens to sort correctly alphabetically today,
 * and depending on that would break silently the first time a tier is renamed.
 */
const PRIORITY_RANK = sql`CASE ${goals.priority}
    WHEN 'essential' THEN 0
    WHEN 'important' THEN 1
    ELSE 2
  END`;

/** SQLite sorts NULLs first, which would put an undated goal ahead of a dated
 * one in the same tier. */
const DATE_RANK = sql`CASE WHEN ${goals.targetDate} IS NULL THEN 1 ELSE 0 END`;

export function listGoals(scope: LifecycleScope = {}) {
  const query = getDb().select().from(goals);
  return (scope.includeArchived ? query : query.where(unarchived(goals.archivedAt)))
    .orderBy(PRIORITY_RANK, DATE_RANK, asc(goals.targetDate), asc(goals.id))
    .all();
}

/** Marks a goal archived rather than deleting it: holdings and recurring rules
 * reference it by foreign key, and history that pointed at a goal should not
 * lose what it was funding. */
export function archiveGoal(id: number, archivedAt: string) {
  return getDb().update(goals).set({ archivedAt }).where(eq(goals.id, id)).returning().get();
}

/** Whether anything still references this goal. A delete is refused when
 * something does, which is why archive exists. */
export function goalHasReferences(id: number): boolean {
  const holding = getDb()
    .select({ id: investmentHoldings.id })
    .from(investmentHoldings)
    .where(eq(investmentHoldings.linkedGoalId, id))
    .get();
  if (holding) return true;
  const rule = getDb()
    .select({ id: recurringRules.id })
    .from(recurringRules)
    .where(eq(recurringRules.linkedGoalId, id))
    .get();
  return rule !== undefined;
}

export function deleteGoal(id: number) {
  getDb().delete(goals).where(eq(goals.id, id)).run();
}

/** The recurring rules contributing to a goal — what is actually being paid in,
 * to show beside what the funding calculation says is required. Paused rules
 * are excluded: they produce no due periods, so they contribute nothing. */
export function listRecurringRulesForGoal(goalId: number) {
  return getDb()
    .select()
    .from(recurringRules)
    .where(
      and(
        eq(recurringRules.linkedGoalId, goalId),
        unarchived(recurringRules.archivedAt),
        isNull(recurringRules.pausedAt),
      ),
    )
    .all();
}
