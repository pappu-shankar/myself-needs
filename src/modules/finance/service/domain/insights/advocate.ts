import type { FinanceSnapshot } from "./snapshot";
import type { Insight } from "./types";
import { daysBetween } from "@/lib/dates";
import { formatMoney } from "@/lib/format";
import { fromRateBps } from "../../utility/units";

/** Restates the same verdict `/finance/tax/regime-comparison` computes — never a second system saying something different. */
export function regimeVerdictRule(snapshot: FinanceSnapshot): Insight[] {
  const savingsMinor = snapshot.regime.savingsMinor;
  if (savingsMinor <= 0) return [];
  return [
    {
      // Minor units are already integral, so the id needs no rounding to stay
      // stable between runs.
      id: `regime-verdict:FY ${snapshot.fy.label}:${snapshot.regime.betterRegime}:${savingsMinor}`,
      category: "advocate",
      severity: "info",
      message: `${snapshot.regime.betterRegime === "old" ? "Old" : "New"} regime saves you ${formatMoney({ minor: savingsMinor, currency: snapshot.taxCurrency })} this year (FY ${snapshot.fy.label}).`,
      link: "/finance/tax/regime-comparison",
    },
  ];
}

/** Rate on a debt account, from whichever terms table covers it. */
function debtRateBps(snapshot: FinanceSnapshot, accountId: number): number | null {
  return snapshot.debtTerms.get(accountId)?.rateBps ?? null;
}

interface RatedDebt {
  account: FinanceSnapshot["accounts"][number];
  rateBps: number;
}

/** Liability accounts actually carrying a balance, paired with their rate.
 * `kind` rather than `type`: decision 11 stopped inferring the sign convention
 * from the account type. */
function ratedDebts(snapshot: FinanceSnapshot): RatedDebt[] {
  const debts: RatedDebt[] = [];
  for (const account of snapshot.accounts) {
    if (account.kind !== "liability" || account.balanceMinor >= 0) continue;
    const rateBps = debtRateBps(snapshot, account.id);
    if (rateBps === null) continue;
    debts.push({ account, rateBps });
  }
  return debts;
}

/** Paying loan/credit-card interest while an FD/RD earns a lower rate — paying down the debt would out-earn the FD. */
export function rateArbitrageRule(snapshot: FinanceSnapshot): Insight[] {
  const debts = ratedDebts(snapshot);
  if (debts.length === 0) return [];

  // The open FD/RD earning the least — the one most worth breaking to pay down
  // debt. A holding's `rateBps` is integer basis points, so this and the
  // comparison below are integer-to-integer.
  const lowestYielding = snapshot.holdings
    .filter((h) => (h.type === "fd" || h.type === "rd") && h.rateBps != null && !h.closed)
    .sort((a, b) => (a.rateBps ?? 0) - (b.rateBps ?? 0))[0];
  if (!lowestYielding?.rateBps) return [];
  const yieldBps = lowestYielding.rateBps;

  const insights: Insight[] = [];
  for (const { account, rateBps } of debts) {
    if (rateBps > yieldBps) {
      insights.push({
        id: `rate-arbitrage:${account.id}:${lowestYielding.id}`,
        category: "advocate",
        severity: "warning",
        message: `"${account.name}" charges ${fromRateBps(rateBps)}% while "${lowestYielding.name}" only earns ${fromRateBps(yieldBps)}% — paying down the debt would out-earn keeping that FD/RD.`,
        link: "/finance/debts",
      });
    }
  }
  return insights;
}

/** Liquid cash well beyond a reasonable emergency-fund buffer, earning ~0% (checking/savings/cash carry no yield in this app). */
export function idleCashRule(snapshot: FinanceSnapshot): Insight[] {
  const { months, complete } = snapshot.emergencyFundMonths;
  // Say nothing when a currency would not convert. A coverage ratio built on a
  // partially-converted numerator understates liquid cash, so this rule would
  // stay silent exactly when it should fire — and worse, the inverse rule
  // ("you are short of a buffer") would fire when the user is not.
  if (months === null || !complete) return [];
  if (months <= snapshot.settings.idleCashMonthsMultiple) return [];
  return [
    {
      id: `idle-cash:${Math.round(months)}`,
      category: "advocate",
      severity: "info",
      message: `Your liquid cash covers ${months.toFixed(1)} months of expenses — well beyond a typical buffer. Consider investing the excess.`,
      link: "/finance/reports",
    },
  ];
}

/** A budget category running consistently under its limit — the headroom could fund something else. */
export function budgetHeadroomRule(snapshot: FinanceSnapshot): Insight[] {
  return snapshot.budgets
    .filter(
      (b) =>
        b.monthlyLimitMinor > 0 &&
        // An incomplete spend figure understates what has been used, which is
        // the direction that would wrongly advertise headroom.
        b.spend.complete &&
        // Spend has been converted into the budget's own currency, so the ratio
        // needs no further conversion — and a ratio of two integers is not
        // money, so float division is correct here.
        (b.spend.baseMinor / b.monthlyLimitMinor) * 100 <=
          100 - snapshot.settings.budgetHeadroomPercent,
    )
    .map((b) => {
      const usedPercent = (b.spend.baseMinor / b.monthlyLimitMinor) * 100;
      return {
        id: `budget-headroom:${b.categoryId}:${Math.round(usedPercent)}`,
        category: "advocate" as const,
        severity: "info" as const,
        message: `"${b.categoryName}" has used only ${usedPercent.toFixed(0)}% of its ${formatMoney({ minor: b.monthlyLimitMinor, currency: b.currency })} budget this month — worth reallocating the headroom.`,
        link: "/finance/budgets",
      };
    });
}

/** Highest-rate debt first — the standard debt-avalanche priority. */
export function debtPriorityRule(snapshot: FinanceSnapshot): Insight[] {
  const top = ratedDebts(snapshot).sort((a, b) => b.rateBps - a.rateBps)[0];
  if (!top) return [];
  return [
    {
      // Basis points in the id: the rate is the fact this instance is about, and
      // a bps integer is stable where a re-derived percentage float is not.
      id: `debt-priority:${top.account.id}:${top.rateBps}`,
      category: "advocate",
      severity: "info",
      message: `"${top.account.name}" carries the highest rate among your debts (${fromRateBps(top.rateBps)}%) — prioritize paying it off first.`,
      link: "/finance/debts",
    },
  ];
}

/** Remaining 80C room with the financial year not yet over — a nudge to use it before it resets. */
export function eightyCHeadroomRule(snapshot: FinanceSnapshot): Insight[] {
  // An incomplete conversion understates what has been contributed, which
  // would advertise 80C room the user may have already used.
  if (!snapshot.eightyC.used.complete) return [];
  const remainingMinor = snapshot.eightyC.limitMinor - snapshot.eightyC.used.baseMinor;
  if (remainingMinor <= 0) return [];
  // fy.end is inclusive (31 March).
  const daysLeftInFY = daysBetween(snapshot.today, snapshot.fy.end) + 1;
  const monthsLeft = Math.round(daysLeftInFY / 30);
  if (monthsLeft <= 0) return [];
  return [
    {
      id: `80c-headroom:FY ${snapshot.fy.label}:${remainingMinor}`,
      category: "advocate",
      severity: "info",
      message: `${formatMoney({ minor: remainingMinor, currency: snapshot.taxCurrency })} of 80C headroom left with ${monthsLeft} month${monthsLeft === 1 ? "" : "s"} left in FY ${snapshot.fy.label}.`,
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
