import { like, or } from "drizzle-orm";
import { getDb } from "@/modules/core/db/client";
import { accounts } from "../../schema/domain/accounts";
import { categories } from "../../schema/domain/categories";
import { transactions } from "../../schema/domain/transactions";
import { recurringRules } from "../../schema/domain/recurring-rules";
import { insurancePolicies } from "../../schema/domain/insurance-policies";
import { investmentHoldings } from "../../schema/domain/investment-holdings";
import { schemeTemplates } from "../../schema/domain/scheme-templates";

const RESULT_LIMIT = 5;

export function searchAccounts(query: string) {
  return getDb()
    .select()
    .from(accounts)
    .where(like(accounts.name, `%${query}%`))
    .limit(RESULT_LIMIT)
    .all();
}

export function searchCategories(query: string) {
  return getDb()
    .select()
    .from(categories)
    .where(like(categories.name, `%${query}%`))
    .limit(RESULT_LIMIT)
    .all();
}

export function searchTransactions(query: string) {
  return getDb()
    .select()
    .from(transactions)
    .where(like(transactions.note, `%${query}%`))
    .limit(RESULT_LIMIT)
    .all();
}

export function searchRecurringRules(query: string) {
  return getDb()
    .select()
    .from(recurringRules)
    .where(like(recurringRules.note, `%${query}%`))
    .limit(RESULT_LIMIT)
    .all();
}

export function searchInsurancePolicies(query: string) {
  return getDb()
    .select()
    .from(insurancePolicies)
    .where(
      or(
        like(insurancePolicies.name, `%${query}%`),
        like(insurancePolicies.provider, `%${query}%`),
      ),
    )
    .limit(RESULT_LIMIT)
    .all();
}

export function searchInvestmentHoldings(query: string) {
  return getDb()
    .select()
    .from(investmentHoldings)
    .where(like(investmentHoldings.name, `%${query}%`))
    .limit(RESULT_LIMIT)
    .all();
}

export function searchSchemeTemplates(query: string) {
  return getDb()
    .select()
    .from(schemeTemplates)
    .where(like(schemeTemplates.name, `%${query}%`))
    .limit(RESULT_LIMIT)
    .all();
}
