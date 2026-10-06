import type { FinanceSnapshot } from "./snapshot";
import type { Insight } from "./types";
import { getCreditUtilization } from "../../utility/loans";

function formatAmount(amount: number) {
  return amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function contributionLimitsRule(snapshot: FinanceSnapshot): Insight[] {
  const insights: Insight[] = [];
  if (snapshot.eightyC.used >= snapshot.eightyC.limit) {
    insights.push({
      id: `80c-limit-reached:FY ${snapshot.fy.label}`,
      category: "compliance",
      severity: "info",
      message: `80C limit reached — ${formatAmount(snapshot.eightyC.used)} used against a ${formatAmount(snapshot.eightyC.limit)} limit.`,
      link: "/finance/tax/deductions",
    });
  }
  if (snapshot.eightyD.used >= snapshot.eightyD.limit) {
    insights.push({
      id: `80d-limit-reached:FY ${snapshot.fy.label}`,
      category: "compliance",
      severity: "info",
      message: `80D limit reached — ${formatAmount(snapshot.eightyD.used)} used against a ${formatAmount(snapshot.eightyD.limit)} limit.`,
      link: "/finance/tax/deductions",
    });
  }
  return insights;
}

/** Close to using up the equity LTCG exemption for the year — realizing more gains now would start owing tax. Already-exceeded is the tax estimate's own job to surface (its tax number is already nonzero), not this rule's. */
export function ltcgApproachingRule(snapshot: FinanceSnapshot): Insight[] {
  // FY-scoped: only this FY's redemptions, against this FY's exemption.
  const {
    ltcgEquity,
    taxEquityLtcg,
    equityLtcgExemption: exemption,
    fiscalYear,
  } = snapshot.capitalGains;
  if (taxEquityLtcg > 0 || exemption <= 0) return [];

  const usedPercent = (ltcgEquity / exemption) * 100;
  if (usedPercent < snapshot.settings.ltcgApproachingPercent) return [];

  return [
    {
      id: `ltcg-approaching:FY ${fiscalYear.label}:${Math.round(usedPercent)}`,
      category: "compliance",
      severity: "info",
      message: `Equity LTCG for FY ${fiscalYear.label} is at ${formatAmount(ltcgEquity)} of your ${formatAmount(exemption)} exemption (${usedPercent.toFixed(0)}%) — more gains realized now would start owing tax.`,
      link: `/finance/tax/capital-gains?fy=${fiscalYear.label}`,
    },
  ];
}

/** `balance ÷ credit_limit` above the configured threshold — commonly cited guidance is ~30%. */
export function creditUtilizationRule(snapshot: FinanceSnapshot): Insight[] {
  return snapshot.accounts
    .filter((a) => a.type === "credit_card" && a.creditLimit)
    .map((a) => {
      const utilization = getCreditUtilization(Math.abs(a.balance), a.creditLimit ?? 0);
      return { account: a, utilization };
    })
    .filter(({ utilization }) => utilization >= snapshot.settings.creditUtilizationThresholdPercent)
    .map(({ account, utilization }) => ({
      id: `credit-utilization:${account.id}:${Math.round(utilization)}`,
      category: "compliance" as const,
      severity: "warning" as const,
      message: `"${account.name}" is at ${utilization.toFixed(0)}% credit utilization — above the ${snapshot.settings.creditUtilizationThresholdPercent}% guideline.`,
      link: "/finance/debts",
    }));
}

/** A renewal date that's passed with the linked recurring rule still showing unconfirmed periods — the premium likely hasn't been paid. */
export function insuranceLapseRule(snapshot: FinanceSnapshot): Insight[] {
  const ruleIdsWithDueItems = new Set(snapshot.dueWorklist.map((item) => item.ruleId));

  return snapshot.insurancePolicies
    .filter((p) => p.renewalDate && p.renewalDate < snapshot.today)
    .filter((p) => !p.recurringRuleId || ruleIdsWithDueItems.has(p.recurringRuleId))
    .map((p) => ({
      id: `insurance-lapse:${p.id}:${p.renewalDate}`,
      category: "compliance" as const,
      severity: "critical" as const,
      message: `"${p.provider} — ${p.name}" is past its ${p.renewalDate} renewal date with no logged premium since — possible lapse.`,
      link: "/finance/insurance",
    }));
}

export const COMPLIANCE_RULES = [
  contributionLimitsRule,
  ltcgApproachingRule,
  creditUtilizationRule,
  insuranceLapseRule,
];
