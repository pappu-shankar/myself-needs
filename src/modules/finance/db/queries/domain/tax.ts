import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { getDb } from "@/modules/core/db/client";
import { paiseToRupees } from "../../schema/money";
import { investmentHoldings } from "../../schema/domain/investment-holdings";
import { investmentCashFlows } from "../../schema/domain/investment-cash-flows";
import { insurancePolicies } from "../../schema/domain/insurance-policies";
import { transactions } from "../../schema/domain/transactions";
import { UNIT_PRICED_TYPES } from "../../../types";

/** Contributions (money in) within [startDate, endDate] (both inclusive) to holdings flagged 80C-eligible. */
export function get80cHoldingContributions(startDate: string, endDate: string): number {
  const row = getDb()
    .select({
      total: sql<number>`COALESCE(SUM(-${investmentCashFlows.amount}), 0)`.mapWith(paiseToRupees),
    })
    .from(investmentCashFlows)
    .innerJoin(investmentHoldings, eq(investmentCashFlows.holdingId, investmentHoldings.id))
    .where(
      and(
        eq(investmentHoldings.is80cEligible, true),
        sql`${investmentCashFlows.amount} < 0`,
        gte(investmentCashFlows.date, startDate),
        lte(investmentCashFlows.date, endDate),
      ),
    )
    .get();
  return row?.total ?? 0;
}

/**
 * Confirmed premium transactions within [startDate, endDate] (both inclusive)
 * for insurance policies flagged for the given section — only policies linked
 * to a recurring rule contribute here, since that's the only trail that ties a
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
    .select({ total: sql<number>`COALESCE(SUM(${transactions.amount}), 0)`.mapWith(paiseToRupees) })
    .from(transactions)
    .innerJoin(
      insurancePolicies,
      eq(transactions.recurringRuleId, insurancePolicies.recurringRuleId),
    )
    .where(
      and(eq(flagColumn, true), gte(transactions.date, startDate), lte(transactions.date, endDate)),
    )
    .get();
  return row?.total ?? 0;
}

/** Distinct dates of redemptions from unit-priced holdings — the only flows that can produce a capital gain. */
export function listRedemptionDates(): string[] {
  return getDb()
    .selectDistinct({ date: investmentCashFlows.date })
    .from(investmentCashFlows)
    .innerJoin(investmentHoldings, eq(investmentCashFlows.holdingId, investmentHoldings.id))
    .where(
      and(
        eq(investmentCashFlows.flowType, "redemption"),
        inArray(investmentHoldings.type, [...UNIT_PRICED_TYPES]),
      ),
    )
    .all()
    .map((r) => r.date);
}
