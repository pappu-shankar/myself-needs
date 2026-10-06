import { and, desc, eq, lte } from "drizzle-orm";
import { getDb } from "@/modules/core/db/client";
import { investmentHoldings } from "../../schema/domain/investment-holdings";
import { investmentCashFlows } from "../../schema/domain/investment-cash-flows";
import { investmentValuations } from "../../schema/domain/investment-valuations";
import { accounts } from "../../schema/domain/accounts";
import { schemeTemplates } from "../../schema/domain/scheme-templates";

export type NewHolding = typeof investmentHoldings.$inferInsert;
export type NewCashFlow = typeof investmentCashFlows.$inferInsert;
export type NewValuation = typeof investmentValuations.$inferInsert;

export function insertHolding(entry: NewHolding) {
  return getDb().insert(investmentHoldings).values(entry).returning().get();
}

const HOLDING_COLUMNS = {
  id: investmentHoldings.id,
  type: investmentHoldings.type,
  name: investmentHoldings.name,
  accountId: investmentHoldings.accountId,
  accountName: accounts.name,
  units: investmentHoldings.units,
  interestRate: investmentHoldings.interestRate,
  maturityDate: investmentHoldings.maturityDate,
  schemeTemplateId: investmentHoldings.schemeTemplateId,
  schemeTemplateName: schemeTemplates.name,
  externalCode: investmentHoldings.externalCode,
  is80cEligible: investmentHoldings.is80cEligible,
  linkedGoalId: investmentHoldings.linkedGoalId,
  notes: investmentHoldings.notes,
} as const;

export function listHoldings() {
  return getDb()
    .select(HOLDING_COLUMNS)
    .from(investmentHoldings)
    .leftJoin(accounts, eq(investmentHoldings.accountId, accounts.id))
    .leftJoin(schemeTemplates, eq(investmentHoldings.schemeTemplateId, schemeTemplates.id))
    .orderBy(investmentHoldings.name)
    .all();
}

/** For a goal's detail composition at the app layer — see docs/prd/finance/goal-linked-investments.md. */
export function listHoldingsByGoalId(goalId: number) {
  return getDb()
    .select(HOLDING_COLUMNS)
    .from(investmentHoldings)
    .leftJoin(accounts, eq(investmentHoldings.accountId, accounts.id))
    .leftJoin(schemeTemplates, eq(investmentHoldings.schemeTemplateId, schemeTemplates.id))
    .where(eq(investmentHoldings.linkedGoalId, goalId))
    .orderBy(investmentHoldings.name)
    .all();
}

export function getHoldingById(id: number) {
  return getDb().select().from(investmentHoldings).where(eq(investmentHoldings.id, id)).get();
}

export function insertCashFlow(entry: NewCashFlow) {
  return getDb().insert(investmentCashFlows).values(entry).returning().get();
}

/** `asOfDate` (YYYY-MM-DD), when given, only includes flows on/before that date — used for net-worth history. Omit for the full history. */
export function listCashFlowsForHolding(holdingId: number, asOfDate?: string) {
  return getDb()
    .select()
    .from(investmentCashFlows)
    .where(
      asOfDate
        ? and(eq(investmentCashFlows.holdingId, holdingId), lte(investmentCashFlows.date, asOfDate))
        : eq(investmentCashFlows.holdingId, holdingId),
    )
    .orderBy(desc(investmentCashFlows.date), desc(investmentCashFlows.id))
    .all();
}

export function listAllCashFlows() {
  return getDb().select().from(investmentCashFlows).all();
}

/**
 * One price per holding per day — `(holding_id, date)` is unique, so a second
 * entry for the same day (a re-entered manual price or a repeated NAV refresh)
 * replaces the price instead of failing.
 */
export function upsertValuation(entry: NewValuation) {
  return getDb()
    .insert(investmentValuations)
    .values(entry)
    .onConflictDoUpdate({
      target: [investmentValuations.holdingId, investmentValuations.date],
      set: { pricePerUnit: entry.pricePerUnit },
    })
    .returning()
    .get();
}

export function listValuationsForHolding(holdingId: number) {
  return getDb()
    .select()
    .from(investmentValuations)
    .where(eq(investmentValuations.holdingId, holdingId))
    .orderBy(desc(investmentValuations.date))
    .all();
}

/** `asOfDate` (YYYY-MM-DD), when given, only considers valuations on/before that date — used for net-worth history. Omit for the current value. */
export function getLatestValuation(holdingId: number, asOfDate?: string) {
  return getDb()
    .select()
    .from(investmentValuations)
    .where(
      asOfDate
        ? and(
            eq(investmentValuations.holdingId, holdingId),
            lte(investmentValuations.date, asOfDate),
          )
        : eq(investmentValuations.holdingId, holdingId),
    )
    .orderBy(desc(investmentValuations.date), desc(investmentValuations.id))
    .limit(1)
    .get();
}
