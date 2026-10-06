import type { FinanceSnapshot } from "./snapshot";
import type { Insight } from "./types";
import { daysBetween } from "@/lib/dates";

function formatAmount(amount: number) {
  return amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const LIABILITY_TYPES = new Set(["credit_card", "loan"]);

/** Restates the same verdict `/finance/tax/regime-comparison` computes — never a second system saying something different. */
export function regimeVerdictRule(snapshot: FinanceSnapshot): Insight[] {
  if (snapshot.regime.savings <= 0) return [];
  return [
    {
      id: `regime-verdict:FY ${snapshot.fy.label}:${snapshot.regime.betterRegime}:${Math.round(snapshot.regime.savings)}`,
      category: "advocate",
      severity: "info",
      message: `${snapshot.regime.betterRegime === "old" ? "Old" : "New"} regime saves you ${formatAmount(snapshot.regime.savings)} this year (FY ${snapshot.fy.label}).`,
      link: "/finance/tax/regime-comparison",
    },
  ];
}

/** Paying loan/credit-card interest while an FD/RD earns a lower rate — paying down the debt would out-earn the FD. */
export function rateArbitrageRule(snapshot: FinanceSnapshot): Insight[] {
  const liabilities = snapshot.accounts.filter(
    (a) => LIABILITY_TYPES.has(a.type) && a.balance < 0 && a.interestRate != null,
  );
  if (liabilities.length === 0) return [];

  // The open FD/RD earning the least — the one most worth breaking to pay down debt.
  const lowestYieldingDebt = snapshot.holdings
    .filter((h) => (h.type === "fd" || h.type === "rd") && h.interestRate != null && !h.closed)
    .sort((a, b) => (a.interestRate ?? 0) - (b.interestRate ?? 0))[0];
  if (!lowestYieldingDebt?.interestRate) return [];

  const insights: Insight[] = [];
  for (const liability of liabilities) {
    if ((liability.interestRate ?? 0) > lowestYieldingDebt.interestRate) {
      insights.push({
        id: `rate-arbitrage:${liability.id}:${lowestYieldingDebt.id}`,
        category: "advocate",
        severity: "warning",
        message: `"${liability.name}" charges ${liability.interestRate}% while "${lowestYieldingDebt.name}" only earns ${lowestYieldingDebt.interestRate}% — paying down the debt would out-earn keeping that FD/RD.`,
        link: "/finance/debts",
      });
    }
  }
  return insights;
}

/** Liquid cash well beyond a reasonable emergency-fund buffer, earning ~0% (checking/savings/cash carry no yield in this app). */
export function idleCashRule(snapshot: FinanceSnapshot): Insight[] {
  if (
    snapshot.emergencyFundMonths === null ||
    snapshot.emergencyFundMonths <= snapshot.settings.idleCashMonthsMultiple
  )
    return [];
  return [
    {
      id: `idle-cash:${Math.round(snapshot.emergencyFundMonths)}`,
      category: "advocate",
      severity: "info",
      message: `Your liquid cash covers ${snapshot.emergencyFundMonths.toFixed(1)} months of expenses — well beyond a typical buffer. Consider investing the excess.`,
      link: "/finance/reports",
    },
  ];
}

/** A budget category running consistently under its limit — the headroom could fund something else. */
export function budgetHeadroomRule(snapshot: FinanceSnapshot): Insight[] {
  return snapshot.budgets
    .filter(
      (b) =>
        b.monthlyLimit > 0 &&
        (b.actualSpend / b.monthlyLimit) * 100 <= 100 - snapshot.settings.budgetHeadroomPercent,
    )
    .map((b) => {
      const usedPercent = (b.actualSpend / b.monthlyLimit) * 100;
      return {
        id: `budget-headroom:${b.categoryId}:${Math.round(usedPercent)}`,
        category: "advocate" as const,
        severity: "info" as const,
        message: `"${b.categoryName}" has used only ${usedPercent.toFixed(0)}% of its ${formatAmount(b.monthlyLimit)} budget this month — worth reallocating the headroom.`,
        link: "/finance/budgets",
      };
    });
}

/** Highest-rate debt first — the standard debt-avalanche priority. */
export function debtPriorityRule(snapshot: FinanceSnapshot): Insight[] {
  const debts = snapshot.accounts
    .filter((a) => LIABILITY_TYPES.has(a.type) && a.balance < 0 && a.interestRate != null)
    .sort((a, b) => (b.interestRate ?? 0) - (a.interestRate ?? 0));
  const top = debts[0];
  if (!top) return [];
  return [
    {
      id: `debt-priority:${top.id}:${top.interestRate}`,
      category: "advocate",
      severity: "info",
      message: `"${top.name}" carries the highest rate among your debts (${top.interestRate}%) — prioritize paying it off first.`,
      link: "/finance/debts",
    },
  ];
}

/** Remaining 80C room with the financial year not yet over — a nudge to use it before it resets. */
export function eightyCHeadroomRule(snapshot: FinanceSnapshot): Insight[] {
  const remaining = snapshot.eightyC.limit - snapshot.eightyC.used;
  if (remaining <= 0) return [];
  // fy.end is inclusive (31 March).
  const daysLeftInFY = daysBetween(snapshot.today, snapshot.fy.end) + 1;
  const monthsLeft = Math.round(daysLeftInFY / 30);
  if (monthsLeft <= 0) return [];
  return [
    {
      id: `80c-headroom:FY ${snapshot.fy.label}:${Math.round(remaining)}`,
      category: "advocate",
      severity: "info",
      message: `${formatAmount(remaining)} of 80C headroom left with ${monthsLeft} month${monthsLeft === 1 ? "" : "s"} left in FY ${snapshot.fy.label}.`,
      link: "/finance/tax/deductions",
    },
  ];
}

export const ADVOCATE_RULES = [
  regimeVerdictRule,
  rateArbitrageRule,
  idleCashRule,
  budgetHeadroomRule,
  debtPriorityRule,
  eightyCHeadroomRule,
];
