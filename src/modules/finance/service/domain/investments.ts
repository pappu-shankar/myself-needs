import {
  getHoldingById,
  getLatestValuation,
  insertCashFlow,
  insertHolding,
  insertValuation,
  listAllCashFlows,
  listCashFlowsForHolding,
  listHoldings,
  listHoldingsByGoalId,
  listValuationsForHolding,
  type NewCashFlow,
  type NewHolding,
  type NewValuation,
} from "../../db/queries/domain/investments";
import { UNIT_PRICED_TYPES, ACCRUAL_TYPES, type InvestmentType } from "../../types";
import { mutualFundNavProvider } from "../utility/price-providers/mutual-fund-nav";
import { computeXirr } from "../utility/returns";

export function createHolding(entry: NewHolding) {
  return insertHolding(entry);
}

export function getHolding(id: number) {
  return getHoldingById(id) ?? null;
}

export function createCashFlow(entry: NewCashFlow) {
  return insertCashFlow(entry);
}

export function getCashFlowsForHolding(holdingId: number) {
  return listCashFlowsForHolding(holdingId);
}

export function createValuation(entry: NewValuation) {
  return insertValuation(entry);
}

export function getValuationsForHolding(holdingId: number) {
  return listValuationsForHolding(holdingId);
}

/** Compounds `principal` from `fromDate` to `toDate` at `annualRatePct`, annually compounded — an estimate, not a bank-exact accrual. */
function accrue(
  principal: number,
  annualRatePct: number,
  fromDate: string,
  toDate: string,
): number {
  const years = (Date.parse(toDate) - Date.parse(fromDate)) / (1000 * 60 * 60 * 24 * 365.25);
  if (years <= 0) return principal;
  return principal * Math.pow(1 + annualRatePct / 100, years);
}

/** Each contribution accrues on its own from its date — correct for both a lump-sum FD and a drip of RD installments. */
function computeAccrualValue(
  cashFlows: { date: string; amount: number }[],
  annualRatePct: number,
  today: string,
): number {
  const grown = cashFlows
    .filter((cf) => cf.amount < 0)
    .reduce((sum, cf) => sum + accrue(-cf.amount, annualRatePct, cf.date, today), 0);
  const paidOut = cashFlows.filter((cf) => cf.amount > 0).reduce((sum, cf) => sum + cf.amount, 0);
  return Math.max(0, grown - paidOut);
}

/** Total contributed minus total received so far — not a market valuation, just where the cash currently stands. */
function computeNetInvested(cashFlows: { amount: number }[]): number {
  return cashFlows.reduce((sum, cf) => sum - cf.amount, 0);
}

export interface HoldingValue {
  currentValue: number;
  /** How `currentValue` was derived — the UI labels accrual/net differently from a market valuation. */
  basis: "valuation" | "accrual" | "net_invested";
  asOfDate: string | null;
}

/**
 * `currentValue` per docs/prd/finance/investments.md's per-type table:
 * unit-priced types use units × latest price, FD/RD use a compounded
 * accrual estimate, everything else (chit funds, govt schemes) uses net
 * cash flow to date. `asOfDate` (YYYY-MM-DD), when given, computes the value
 * as it stood on that date instead of today — used for net-worth history.
 */
export function getHoldingValue(
  holding: { id: number; type: InvestmentType; units: number | null; interestRate: number | null },
  asOfDate?: string,
): HoldingValue {
  const effectiveDate = asOfDate ?? new Date().toISOString().slice(0, 10);

  if (UNIT_PRICED_TYPES.has(holding.type)) {
    const latest = getLatestValuation(holding.id, asOfDate);
    if (!latest) return { currentValue: 0, basis: "valuation", asOfDate: null };
    return {
      currentValue: (holding.units ?? 1) * latest.pricePerUnit,
      basis: "valuation",
      asOfDate: latest.date,
    };
  }

  const cashFlows = listCashFlowsForHolding(holding.id, asOfDate);

  if (ACCRUAL_TYPES.has(holding.type)) {
    return {
      currentValue: computeAccrualValue(cashFlows, holding.interestRate ?? 0, effectiveDate),
      basis: "accrual",
      asOfDate: effectiveDate,
    };
  }

  return {
    currentValue: computeNetInvested(cashFlows),
    basis: "net_invested",
    asOfDate: effectiveDate,
  };
}

/** Total value of every holding as of `asOfDate` — used for net-worth history. */
export function getTotalHoldingsValue(asOfDate: string): number {
  return listHoldings().reduce(
    (sum, holding) => sum + getHoldingValue(holding, asOfDate).currentValue,
    0,
  );
}

function withValueAndXirr<
  T extends { id: number; type: InvestmentType; units: number | null; interestRate: number | null },
>(holdings: T[]) {
  const today = new Date().toISOString().slice(0, 10);
  return holdings.map((holding) => {
    const value = getHoldingValue(holding);
    const cashFlows = listCashFlowsForHolding(holding.id);
    const xirr = computeXirr(cashFlows, value.currentValue, today);
    return { ...holding, ...value, xirr };
  });
}

export function getHoldingsWithValue() {
  return withValueAndXirr(listHoldings());
}

/** For a goal's detail composition at the app layer — see docs/prd/finance/goal-linked-investments.md. */
export function getHoldingsByGoalId(goalId: number) {
  return withValueAndXirr(listHoldingsByGoalId(goalId));
}

/**
 * XIRR of every cash flow across every holding plus total current value as
 * a final "as of today" inflow — "computed uniformly... at any level" per
 * docs/prd/finance/returns-analytics.md.
 */
export function getPortfolioXirr(): number | null {
  const today = new Date().toISOString().slice(0, 10);
  const totalValue = getHoldingsWithValue().reduce((sum, h) => sum + h.currentValue, 0);
  const allCashFlows = listAllCashFlows().map((cf) => ({ amount: cf.amount, date: cf.date }));
  return computeXirr(allCashFlows, totalValue, today);
}

/** Fetches the latest NAV for a domestic mutual fund holding and records it as a new valuation. Manual click only — see price-providers/mutual-fund-nav.ts. */
export async function refreshMutualFundNav(holdingId: number) {
  const holding = getHoldingById(holdingId);
  if (!holding) throw new Error("Holding not found");
  if (holding.type !== "mutual_fund_domestic")
    throw new Error("NAV refresh is only available for domestic mutual funds");
  if (!holding.externalCode) throw new Error("This holding has no AMFI scheme code set");

  const quote = await mutualFundNavProvider.fetchLatestPrice(holding.externalCode);
  return insertValuation({ holdingId, date: quote.date, pricePerUnit: quote.pricePerUnit });
}
