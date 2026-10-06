import type { FinanceSnapshot } from "./snapshot";
import type { Insight } from "./types";
import { getCreditUtilization } from "../../utility/loans";
import { convert } from "../../utility/fx";
import { formatMoney } from "@/lib/format";

export function contributionLimitsRule(snapshot: FinanceSnapshot): Insight[] {
  const insights: Insight[] = [];
  const currency = snapshot.taxCurrency;
  // "Limit reached" is a claim about a total, so it is only made when the total
  // is whole. A short figure here would quietly stop telling the user they have
  // maxed out a deduction.
  if (
    snapshot.eightyC.used.complete &&
    snapshot.eightyC.used.baseMinor >= snapshot.eightyC.limitMinor
  ) {
    insights.push({
      id: `80c-limit-reached:FY ${snapshot.fy.label}`,
      category: "compliance",
      severity: "info",
      message: `80C limit reached — ${formatMoney({ minor: snapshot.eightyC.used.baseMinor, currency })} used against a ${formatMoney({ minor: snapshot.eightyC.limitMinor, currency })} limit.`,
      link: "/finance/tax/deductions",
    });
  }
  if (
    snapshot.eightyD.used.complete &&
    snapshot.eightyD.used.baseMinor >= snapshot.eightyD.limitMinor
  ) {
    insights.push({
      id: `80d-limit-reached:FY ${snapshot.fy.label}`,
      category: "compliance",
      severity: "info",
      message: `80D limit reached — ${formatMoney({ minor: snapshot.eightyD.used.baseMinor, currency })} used against a ${formatMoney({ minor: snapshot.eightyD.limitMinor, currency })} limit.`,
      link: "/finance/tax/deductions",
    });
  }
  return insights;
}

/** Close to using up the equity LTCG exemption for the year — realizing more gains now would start owing tax. Already-exceeded is the tax estimate's own job to surface (its tax number is already nonzero), not this rule's. */
export function ltcgApproachingRule(snapshot: FinanceSnapshot): Insight[] {
  // FY-scoped: only this FY's redemptions, against this FY's exemption.
  const {
    ltcgEquityMinor,
    taxEquityLtcgMinor,
    equityLtcgExemptionMinor: exemptionMinor,
    fiscalYear,
  } = snapshot.capitalGains;
  if (taxEquityLtcgMinor > 0 || exemptionMinor <= 0) return [];

  // Gains and exemption are both statutory INR paise, so the ratio compares
  // like with like and needs no conversion.
  const usedPercent = (ltcgEquityMinor / exemptionMinor) * 100;
  if (usedPercent < snapshot.settings.ltcgApproachingPercent) return [];

  const currency = snapshot.taxCurrency;
  return [
    {
      id: `ltcg-approaching:FY ${fiscalYear.label}:${Math.round(usedPercent)}`,
      category: "compliance",
      severity: "info",
      message: `Equity LTCG for FY ${fiscalYear.label} is at ${formatMoney({ minor: ltcgEquityMinor, currency })} of your ${formatMoney({ minor: exemptionMinor, currency })} exemption (${usedPercent.toFixed(0)}%) — more gains realized now would start owing tax.`,
      link: `/finance/tax/capital-gains?fy=${fiscalYear.label}`,
    },
  ];
}

/** `balance ÷ credit_limit` above the configured threshold — commonly cited guidance is ~30%. */
export function creditUtilizationRule(snapshot: FinanceSnapshot): Insight[] {
  const utilizations: { account: FinanceSnapshot["accounts"][number]; utilization: number }[] = [];
  for (const account of snapshot.accounts) {
    if (account.type !== "credit_card") continue;
    const terms = snapshot.debtTerms.get(account.id);
    if (!terms?.creditLimitMinor || !terms.limitCurrency) continue;

    // The limit can be recorded in a different currency from the card's own
    // balance, and a ratio of two different currencies is meaningless. Convert
    // the limit into the balance's currency — and when no rate resolves, drop
    // the card rather than report a percentage computed from mismatched units.
    let limitMinor = terms.creditLimitMinor;
    if (terms.limitCurrency !== account.currency) {
      const converted = convert(
        snapshot.fxRates,
        terms.creditLimitMinor,
        terms.limitCurrency,
        account.currency,
        snapshot.today,
      );
      if (!converted) continue;
      limitMinor = converted.minor;
    }

    // Both sides are now minor units of the same currency, so the scale cancels.
    utilizations.push({
      account,
      utilization: getCreditUtilization(Math.abs(account.balanceMinor), limitMinor),
    });
  }

  return utilizations
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
