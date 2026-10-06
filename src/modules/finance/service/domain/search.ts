import type { SearchResult } from "@/types/search";
import { formatMoney } from "@/lib/format";
import {
  searchAccounts,
  searchCategories,
  searchInsurancePolicies,
  searchInvestmentHoldings,
  searchRecurringRules,
  searchSchemeTemplates,
  searchTransactions,
} from "../../db/queries/domain/search";

export function searchFinance(query: string): SearchResult[] {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const results: SearchResult[] = [];

  for (const account of searchAccounts(trimmed)) {
    results.push({
      type: "account",
      id: account.id,
      label: account.name,
      subtitle: account.type,
      href: "/finance/accounts",
    });
  }

  for (const category of searchCategories(trimmed)) {
    results.push({
      type: "category",
      id: category.id,
      label: category.name,
      subtitle: category.type,
      href: "/finance/categories",
    });
  }

  for (const transaction of searchTransactions(trimmed)) {
    results.push({
      type: "transaction",
      id: transaction.id,
      label: transaction.note ?? "",
      // Formatted with its own currency rather than a hardcoded ₹: the amount
      // is minor units, so printing it raw showed paise as rupees.
      subtitle: `${formatMoney({ minor: transaction.amountMinor, currency: transaction.currency })} · ${transaction.date}`,
      href: "/finance/transactions",
    });
  }

  for (const rule of searchRecurringRules(trimmed)) {
    results.push({
      type: "recurring_rule",
      id: rule.id,
      label: rule.note ?? "",
      subtitle: `${rule.frequency} · ${formatMoney({ minor: rule.amountMinor, currency: rule.currency })}`,
      href: "/finance/recurring",
    });
  }

  const lowerQuery = trimmed.toLowerCase();
  for (const policy of searchInsurancePolicies(trimmed)) {
    const nameMatches = policy.name.toLowerCase().includes(lowerQuery);
    results.push({
      type: "insurance",
      id: policy.id,
      label: nameMatches ? policy.name : policy.provider,
      subtitle: nameMatches ? policy.provider : policy.name,
      href: "/finance/insurance",
    });
  }

  for (const holding of searchInvestmentHoldings(trimmed)) {
    results.push({
      type: "holding",
      id: holding.id,
      label: holding.name,
      subtitle: holding.type,
      href: "/finance/investments/holdings",
    });
  }

  for (const template of searchSchemeTemplates(trimmed)) {
    results.push({
      type: "scheme_template",
      id: template.id,
      label: template.name,
      href: "/finance/investments/scheme-templates",
    });
  }

  return results;
}
