import type { FinanceSnapshot } from "./snapshot";
import type { Insight } from "./types";
import { formatMoney } from "@/lib/format";

/** Physical cash can't be negative — a negative `cash`-type balance is a data-entry problem, not a real financial state. */
export function implausibleBalanceRule(snapshot: FinanceSnapshot): Insight[] {
  return snapshot.accounts
    .filter((a) => a.type === "cash" && a.balanceMinor < 0)
    .map((a) => ({
      id: `implausible-balance:${a.id}`,
      category: "audit",
      severity: "warning",
      // The magnitude, not the signed value: "a negative balance of -₹500" reads
      // as a double negative.
      message: `"${a.name}" is a cash account with a negative balance of ${formatMoney({ minor: Math.abs(a.balanceMinor), currency: a.currency })} — cash can't go negative, so a transaction here is likely wrong.`,
      link: "/finance/accounts",
    }));
}

export function duplicateTransactionsRule(snapshot: FinanceSnapshot): Insight[] {
  return snapshot.duplicateGroups.map((g) => ({
    // The amount is in minor units, so the id changes for every row that used
    // to carry a rupee float — intended: a content-derived id tracks the fact,
    // and the fact's representation changed.
    id: `duplicate-transaction:${g.accountId}:${g.amountMinor}:${g.date}`,
    category: "audit",
    severity: "warning",
    message: `${g.count} transactions of ${formatMoney({ minor: g.amountMinor, currency: g.currency })} on ${g.date} in "${g.accountName}" — check for a double entry.`,
    link: "/finance/transactions",
  }));
}

export function uncategorizedTransactionsRule(snapshot: FinanceSnapshot): Insight[] {
  if (snapshot.uncategorizedCount === 0) return [];
  return [
    {
      id: `uncategorized-transactions:${snapshot.uncategorizedCount}`,
      category: "audit",
      severity: "info",
      message: `${snapshot.uncategorizedCount} income/expense transaction${snapshot.uncategorizedCount === 1 ? "" : "s"} have no category, which will skew spend-by-category reports.`,
      link: "/finance/transactions",
    },
  ];
}

export function staleValuationRule(snapshot: FinanceSnapshot): Insight[] {
  const insights: Insight[] = [];
  for (const h of snapshot.holdings) {
    if (h.basis !== "valuation") continue;
    if (!h.asOfDate) {
      insights.push({
        id: `stale-valuation:${h.id}:never`,
        category: "audit",
        severity: "info",
        message: `"${h.name}" has never had a valuation recorded, so its current value shows as 0.`,
        link: "/finance/investments/holdings",
      });
      continue;
    }
    const daysSince = Math.floor(
      (Date.parse(snapshot.today) - Date.parse(h.asOfDate)) / (1000 * 60 * 60 * 24),
    );
    if (daysSince >= snapshot.settings.staleValuationDays) {
      insights.push({
        id: `stale-valuation:${h.id}:${h.asOfDate}`,
        category: "audit",
        severity: "info",
        message: `"${h.name}" hasn't had a valuation update in ${daysSince} days.`,
        link: "/finance/investments/holdings",
      });
    }
  }
  return insights;
}

export function recurringPileupRule(snapshot: FinanceSnapshot): Insight[] {
  const countByRule = new Map<number, { count: number; label: string }>();
  for (const item of snapshot.dueWorklist) {
    const existing = countByRule.get(item.ruleId);
    countByRule.set(item.ruleId, { count: (existing?.count ?? 0) + 1, label: item.label });
  }

  const insights: Insight[] = [];
  for (const [ruleId, { count, label }] of countByRule) {
    if (count >= snapshot.settings.recurringPileupThreshold) {
      insights.push({
        id: `recurring-pileup:${ruleId}:${count}`,
        category: "audit",
        severity: "warning",
        message: `${count} unconfirmed periods have piled up for "${label.split(" — ")[0]}" — log them or the worklist will keep growing.`,
        link: "/finance/recurring",
      });
    }
  }
  return insights;
}

export const AUDITOR_RULES = [
  implausibleBalanceRule,
  duplicateTransactionsRule,
  uncategorizedTransactionsRule,
  staleValuationRule,
  recurringPileupRule,
];
