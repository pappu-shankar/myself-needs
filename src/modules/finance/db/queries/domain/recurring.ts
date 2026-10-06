import { and, count, eq, isNotNull, isNull } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import { getDb } from "@/modules/core/db/client";
import { recurringRules } from "../../schema/domain/recurring-rules";
import { accounts } from "../../schema/domain/accounts";
import { categories } from "../../schema/domain/categories";
import { transactions } from "../../schema/domain/transactions";

export type NewRecurringRule = typeof recurringRules.$inferInsert;

const toAccount = alias(accounts, "recurring_to_account");

export function insertRecurringRule(entry: NewRecurringRule) {
  return getDb().insert(recurringRules).values(entry).returning().get();
}

export function getRecurringRuleById(id: number) {
  return getDb().select().from(recurringRules).where(eq(recurringRules.id, id)).get();
}

export function listRecurringRules() {
  return getDb()
    .select({
      id: recurringRules.id,
      type: recurringRules.type,
      accountId: recurringRules.accountId,
      accountName: accounts.name,
      toAccountId: recurringRules.toAccountId,
      toAccountName: toAccount.name,
      categoryId: recurringRules.categoryId,
      categoryName: categories.name,
      amount: recurringRules.amountMinor,
      frequency: recurringRules.frequency,
      startDate: recurringRules.startDate,
      endDate: recurringRules.endDate,
      note: recurringRules.note,
      linkedGoalId: recurringRules.linkedGoalId,
    })
    .from(recurringRules)
    .leftJoin(accounts, eq(recurringRules.accountId, accounts.id))
    .leftJoin(toAccount, eq(recurringRules.toAccountId, toAccount.id))
    .leftJoin(categories, eq(recurringRules.categoryId, categories.id))
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
      .where(and(eq(transactions.recurringRuleId, ruleId), isNull(transactions.periodStart)))
      .get()?.value ?? 0
  );
}

/** The exact period_start values this rule has an explicitly-tagged confirmation for. */
export function listLoggedPeriodStartsForRule(ruleId: number): string[] {
  return getDb()
    .select({ periodStart: transactions.periodStart })
    .from(transactions)
    .where(and(eq(transactions.recurringRuleId, ruleId), isNotNull(transactions.periodStart)))
    .all()
    .map((row) => row.periodStart as string);
}
