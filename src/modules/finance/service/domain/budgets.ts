import { upsertBudget, listBudgetsForMonth, type NewBudget } from "../../db/queries/domain/budgets";
import type { Currency } from "../../db/schema/currency";
import { aggregateToBase, type MoneyAggregate } from "../utility/aggregate";
import { resolveConversionBasis, type BaseConversionOptions } from "./accounts";
import { todayIso } from "@/lib/dates";
import { DomainError } from "@/modules/core/errors";

/** Setting a budget for a category/effective-date pair that already exists
 * updates its limit rather than erroring or creating a second row for the
 * same category — see `upsertBudget`. */
export function createBudget(entry: NewBudget) {
  if (!Number.isInteger(entry.monthlyLimitMinor) || entry.monthlyLimitMinor < 0) {
    throw new DomainError("A budget limit must be a whole number of minor units, and not negative.");
  }
  return upsertBudget(entry);
}

/** `month` as "YYYY-MM"; defaults to the current month. */
export function getBudgetsForMonth(month?: string) {
  const monthStart = month ? `${month}-01` : `${todayIso().slice(0, 7)}-01`;
  const [year, monthNum] = monthStart.split("-").map(Number);
  // monthNum is 1-indexed (e.g. 8 for August); Date.UTC's month param is
  // 0-indexed, so passing it directly lands one month ahead — exactly the
  // "first day of next month" boundary this needs, with year rollover handled
  // for free by Date's normalization (month 12 in December becomes January).
  const monthEnd = new Date(Date.UTC(year, monthNum, 1)).toISOString().slice(0, 10);

  return listBudgetsForMonth(monthStart, monthEnd);
}

/**
 * Spend recorded in several currencies, compared against a budget by
 * converting **into the budget's currency** — not into the base currency.
 *
 * The limit is a promise the user made in a specific currency (groceries in
 * INR, a UK-travel category in GBP). Comparing in the base currency would make
 * an on-target budget appear to overrun whenever the base moved against it.
 * See docs/prd/finance/budgets.md § Currency.
 *
 * The result is a `MoneyAggregate` whose `baseCurrency` is the budget's own
 * currency, so an unresolvable rate shows up as `complete: false` rather than
 * as spend that silently went missing from the comparison.
 */
export function getBudgetSpend(
  spendByCurrency: ReadonlyMap<Currency, number>,
  budgetCurrency: Currency,
  options: Omit<BaseConversionOptions, "baseCurrency"> = {},
): MoneyAggregate {
  // `baseCurrency` is overridden with the budget's own: this is the one
  // aggregate in the module that does not report in the vault's base.
  const basis = resolveConversionBasis(options);
  return aggregateToBase(spendByCurrency, { ...basis, baseCurrency: budgetCurrency });
}
