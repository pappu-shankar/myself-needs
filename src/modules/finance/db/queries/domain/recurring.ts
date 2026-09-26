import { count, eq } from "drizzle-orm";
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
      amount: recurringRules.amount,
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

/** How many real transactions have confirmed an occurrence of this rule so far. */
export function countLoggedForRule(ruleId: number): number {
  return (
    getDb()
      .select({ value: count() })
      .from(transactions)
      .where(eq(transactions.recurringRuleId, ruleId))
      .get()?.value ?? 0
  );
}
