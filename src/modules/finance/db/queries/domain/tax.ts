import { and, eq, gte, lt, sql } from "drizzle-orm";
import { getDb } from "@/modules/core/db/client";
import { investmentHoldings } from "../../schema/domain/investment-holdings";
import { investmentCashFlows } from "../../schema/domain/investment-cash-flows";
import { insurancePolicies } from "../../schema/domain/insurance-policies";
import { transactions } from "../../schema/domain/transactions";

/** Contributions (money in) within [startDate, endDate) to holdings flagged 80C-eligible. */
export function get80cHoldingContributions(startDate: string, endDate: string): number {
  const row = getDb()
    .select({ total: sql<number>`COALESCE(SUM(-${investmentCashFlows.amount}), 0)` })
    .from(investmentCashFlows)
    .innerJoin(investmentHoldings, eq(investmentCashFlows.holdingId, investmentHoldings.id))
    .where(
      and(
        eq(investmentHoldings.is80cEligible, true),
        sql`${investmentCashFlows.amount} < 0`,
        gte(investmentCashFlows.date, startDate),
        lt(investmentCashFlows.date, endDate),
      ),
    )
    .get();
  return row?.total ?? 0;
}

/**
 * Confirmed premium transactions within [startDate, endDate) for insurance
 * policies flagged for the given section — only policies linked to a
 * recurring rule contribute here, since that's the only trail that ties a
 * real transaction back to a specific policy. See docs/prd/finance/tax-planning.md.
 */
export function getInsurancePremiumsPaid(
  section: "is80cEligible" | "is80dEligible",
  startDate: string,
  endDate: string,
): number {
  const flagColumn =
    section === "is80cEligible" ? insurancePolicies.is80cEligible : insurancePolicies.is80dEligible;
  const row = getDb()
    .select({ total: sql<number>`COALESCE(SUM(${transactions.amount}), 0)` })
    .from(transactions)
    .innerJoin(
      insurancePolicies,
      eq(transactions.recurringRuleId, insurancePolicies.recurringRuleId),
    )
    .where(
      and(eq(flagColumn, true), gte(transactions.date, startDate), lt(transactions.date, endDate)),
    )
    .get();
  return row?.total ?? 0;
}
