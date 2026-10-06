import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { getDb } from "@/modules/core/db/client";
import { investmentHoldings } from "../../schema/domain/investment-holdings";
import { investmentCashFlows } from "../../schema/domain/investment-cash-flows";
import { insurancePolicies } from "../../schema/domain/insurance-policies";
import { transactions } from "../../schema/domain/transactions";
import { UNIT_PRICED_TYPES } from "../../../types";
import type { Currency } from "../../schema/currency";
import { live, unarchived } from "../lifecycle";

/**
 * Contributions (money in) within [startDate, endDate] (both inclusive) to
 * holdings flagged 80C-eligible, per currency and in minor units. 80C is a
 * statutory INR deduction, so a caller converting a foreign-currency
 * contribution has to do it explicitly — which is the point of returning the
 * split rather than one number.
 */
export function get80cHoldingContributionsByCurrency(
  startDate: string,
  endDate: string,
): Map<Currency, number> {
  const rows = getDb()
    .select({
      currency: investmentCashFlows.currency,
      totalMinor: sql<number>`COALESCE(SUM(-${investmentCashFlows.amountMinor}), 0)`.mapWith(
        Number,
      ),
    })
    .from(investmentCashFlows)
    .innerJoin(investmentHoldings, eq(investmentCashFlows.holdingId, investmentHoldings.id))
    .where(
      and(
        eq(investmentHoldings.is80cEligible, true),
        sql`${investmentCashFlows.amountMinor} < 0`,
        gte(investmentCashFlows.date, startDate),
        lte(investmentCashFlows.date, endDate),
        live(investmentCashFlows.voidedAt),
        unarchived(investmentHoldings.archivedAt),
      ),
    )
    .groupBy(investmentCashFlows.currency)
    .all();
  return new Map(rows.map((r) => [r.currency, r.totalMinor]));
}

/**
 * Confirmed premium transactions within [startDate, endDate] (both inclusive)
 * for insurance policies flagged for the given section — only policies linked
 * to a recurring rule contribute here, since that's the only trail that ties a
 * real transaction back to a specific policy. See docs/prd/finance/tax-planning.md.
 */
export function getInsurancePremiumsPaidByCurrency(
  section: "is80cEligible" | "is80dEligible",
  startDate: string,
  endDate: string,
): Map<Currency, number> {
  const flagColumn =
    section === "is80cEligible" ? insurancePolicies.is80cEligible : insurancePolicies.is80dEligible;
  const rows = getDb()
    .select({
      currency: transactions.currency,
      totalMinor: sql<number>`COALESCE(SUM(${transactions.amountMinor}), 0)`.mapWith(Number),
    })
    .from(transactions)
    .innerJoin(
      insurancePolicies,
      eq(transactions.recurringRuleId, insurancePolicies.recurringRuleId),
    )
    .where(
      and(
        eq(flagColumn, true),
        gte(transactions.date, startDate),
        lte(transactions.date, endDate),
        live(transactions.voidedAt),
      ),
    )
    .groupBy(transactions.currency)
    .all();
  return new Map(rows.map((r) => [r.currency, r.totalMinor]));
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
        live(investmentCashFlows.voidedAt),
      ),
    )
    .all()
    .map((r) => r.date);
}
