import {
  getHoldingById,
  getLatestValuation,
  insertCashFlow,
  insertHolding,
  upsertValuation,
  listCashFlowsForHolding,
  listHoldings,
  listHoldingsByGoalId,
  listValuationsForHolding,
  type NewCashFlow,
  type NewHolding,
  type NewValuation,
} from "../../db/queries/domain/investments";
import {
  UNIT_PRICED_TYPES,
  ACCRUAL_TYPES,
  type CashFlowType,
  type InvestmentType,
} from "../../types";
import { mutualFundNavProvider } from "../utility/price-providers/mutual-fund-nav";
import { computeXirr, type CashFlowInput } from "../utility/returns";
import { todayIso } from "@/lib/dates";
import { DomainError } from "@/modules/core/errors";

export function createHolding(entry: NewHolding) {
  return insertHolding(entry);
}

export function getHolding(id: number) {
  return getHoldingById(id) ?? null;
}

/**
 * Low-level insert with the amount already signed per the ledger convention
 * (negative = money in/contributed, positive = money out/received). User input
 * goes through `recordCashFlow`, which derives the sign from the flow type.
 */
export function createCashFlow(entry: NewCashFlow) {
  return insertCashFlow(entry);
}

export function getCashFlowsForHolding(holdingId: number) {
  return listCashFlowsForHolding(holdingId);
}

/** Records the price for a day; a second price for the same holding and day replaces the first. */
export function createValuation(entry: NewValuation) {
  return upsertValuation(entry);
}

export function getValuationsForHolding(holdingId: number) {
  return listValuationsForHolding(holdingId);
}

// ---------------------------------------------------------------------------
// Recording cash flows from user input
// ---------------------------------------------------------------------------

/** Flow types that put money into the holding — stored negative. Everything else is money received — stored positive. */
const MONEY_IN_FLOWS = new Set<CashFlowType>(["contribution"]);

/** Flow types that change a unit-priced holding's unit count, and in which direction. */
const UNIT_DIRECTION: Partial<Record<CashFlowType, 1 | -1>> = {
  contribution: 1,
  redemption: -1,
  maturity: -1,
};

/** The stored ledger sign for a positive amount the user typed. */
export function signedAmount(flowType: CashFlowType, amount: number): number {
  const magnitude = Math.abs(amount);
  return MONEY_IN_FLOWS.has(flowType) ? -magnitude : magnitude;
}

export interface CashFlowInputFromUser {
  holdingId: number;
  date: string;
  flowType: CashFlowType;
  /** Always positive — the sign is derived from `flowType`. */
  amount: number;
  /** Always positive — the direction is derived from `flowType`. Required for buys/sells of unit-priced holdings. */
  units?: number;
}

/**
 * Records a cash flow the user entered: they type positive numbers, and the
 * stored signs come from the flow type, so an 80C total, FIFO gains or XIRR
 * can never be broken by a wrongly-typed minus sign.
 */
export function recordCashFlow(input: CashFlowInputFromUser) {
  const holding = getHoldingById(input.holdingId);
  if (!holding) throw new DomainError("Holding not found");
  if (!(input.amount > 0)) throw new DomainError("Amount must be more than zero");

  const direction = UNIT_DIRECTION[input.flowType];
  let units: number | null = null;

  if (UNIT_PRICED_TYPES.has(holding.type) && direction) {
    if (input.units === undefined || !(input.units > 0)) {
      throw new DomainError(
        input.flowType === "contribution"
          ? "Enter how many units this bought"
          : "Enter how many units this sold or redeemed",
      );
    }
    units = direction * input.units;

    if (direction < 0) {
      const held = unitsHeld(holding, listCashFlowsForHolding(holding.id, input.date));
      if (held !== null && input.units > held + UNIT_EPSILON) {
        throw new DomainError(`Only ${formatUnits(held)} units were held on ${input.date}`);
      }
    }
  }

  return insertCashFlow({
    holdingId: input.holdingId,
    date: input.date,
    flowType: input.flowType,
    amount: signedAmount(input.flowType, input.amount),
    units,
  });
}

// ---------------------------------------------------------------------------
// Valuation
// ---------------------------------------------------------------------------

/** Floating-point slack when comparing unit counts (fractional MF units). */
const UNIT_EPSILON = 1e-6;

function formatUnits(units: number) {
  return units.toLocaleString("en-IN", { maximumFractionDigits: 4 });
}

type LedgerFlow = { date: string; amount: number; flowType: CashFlowType; units: number | null };

/**
 * Units held, given the flows up to the date of interest.
 *
 * - Flows carry their own unit deltas (buys +, sells −). The holding's legacy
 *   `units` column, when set, is an opening balance that predates per-flow
 *   units — it is added on top so an older holding keeps its value while new
 *   buys and sells adjust it.
 * - A holding with neither returns `null` (unknown) — never an implied 1 unit.
 */
function unitsHeld(holding: { units: number | null }, flows: LedgerFlow[]): number | null {
  const flowUnits = flows.filter((f) => f.units !== null);
  if (holding.units === null && flowUnits.length === 0) return null;
  const total = flowUnits.reduce((sum, f) => sum + (f.units ?? 0), holding.units ?? 0);
  return Math.abs(total) < UNIT_EPSILON ? 0 : total;
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

/** Each contribution accrues on its own from its date until `untilDate` — correct for both a lump-sum FD and a drip of RD installments. */
function computeAccrualValue(
  cashFlows: { date: string; amount: number }[],
  annualRatePct: number,
  untilDate: string,
): number {
  const grown = cashFlows
    .filter((cf) => cf.amount < 0)
    .reduce((sum, cf) => sum + accrue(-cf.amount, annualRatePct, cf.date, untilDate), 0);
  const paidOut = cashFlows.filter((cf) => cf.amount > 0).reduce((sum, cf) => sum + cf.amount, 0);
  return Math.max(0, grown - paidOut);
}

/** Total contributed minus total received so far — not a market valuation, just where the cash currently stands. */
function computeNetInvested(cashFlows: { amount: number }[]): number {
  return cashFlows.reduce((sum, cf) => sum - cf.amount, 0);
}

/**
 * Government schemes (PPF, EPF, NSC, SSY, …) have no market price, so their
 * value is the scheme balance kept from the ledger:
 *
 *   contributions + `interest` credited − redemptions/withdrawals − maturity payout
 *
 * An `interest` flow on a govt scheme means interest *credited into* the
 * scheme (it compounds there — PPF/EPF/SSY), so it raises the balance. Interest
 * actually paid out to you (e.g. SCSS/POMIS quarterly payouts) is logged as
 * `dividend` ("interest paid out"): income received, balance unchanged.
 * See `xirrFlows` for the matching return treatment.
 */
function computeSchemeBalance(cashFlows: { amount: number; flowType: CashFlowType }[]): number {
  let balance = 0;
  for (const cf of cashFlows) {
    if (cf.flowType === "contribution") balance += -cf.amount;
    else if (cf.flowType === "interest") balance += Math.abs(cf.amount);
    else if (cf.flowType === "redemption" || cf.flowType === "maturity") balance -= cf.amount;
    // `dividend`: paid out to the holder — doesn't change the scheme balance.
  }
  return Math.max(0, balance);
}

export interface HoldingValue {
  /**
   * Value counted in totals. When the value can't be known (`missing` is set)
   * this is 0 so totals stay summable — show `missing` instead of the number.
   */
  currentValue: number;
  /** How `currentValue` was derived — the UI labels accrual/balance/net differently from a market valuation. */
  basis: "valuation" | "accrual" | "balance" | "net_invested";
  /** Market price date for unit-priced holdings, otherwise the date valued at (maturity date once matured). */
  asOfDate: string | null;
  /** Units held as of the valuation date — unit-priced types only, null when unknown. */
  units: number | null;
  /**
   * Why the value is unknown: `units` — a unit-priced holding with no units
   * recorded anywhere ("Add units"); `price` — no valuation recorded yet.
   */
  missing: "units" | "price" | null;
  /** FD/RD past its maturity date with no payout recorded — valued at maturity; "Matured on … — record the payout". */
  maturedOn: string | null;
  /** Fully paid out/redeemed — worth 0 and stays that way. */
  closed: boolean;
}

type ValuableHolding = {
  id: number;
  type: InvestmentType;
  units: number | null;
  interestRate: number | null;
  maturityDate?: string | null;
};

/**
 * `currentValue` per docs/prd/finance/investments.md's per-type table.
 * `asOfDate` (YYYY-MM-DD), when given, computes the value as it stood on that
 * date instead of today — used for net-worth history.
 *
 * - Unit-priced: units held on the date (sum of flow units, see `unitsHeld`)
 *   × latest price on/before the date.
 * - FD/RD: compounded accrual from `interest_rate`, capped at `maturity_date`.
 *   Past maturity with a payout/redemption recorded → closed (0); past
 *   maturity without one → maturity value, flagged `maturedOn`. A `maturity`
 *   flow at any point (e.g. premature closure) also closes it.
 * - Govt schemes: ledger balance with credited interest (`computeSchemeBalance`).
 * - Chit funds: net cash flow to date.
 */
export function getHoldingValue(holding: ValuableHolding, asOfDate?: string): HoldingValue {
  const effectiveDate = asOfDate ?? todayIso();
  const cashFlows = listCashFlowsForHolding(holding.id, asOfDate);
  const base = { units: null, missing: null, maturedOn: null, closed: false } as const;

  if (UNIT_PRICED_TYPES.has(holding.type)) {
    const units = unitsHeld(holding, cashFlows);
    const latest = getLatestValuation(holding.id, asOfDate);
    const priceDate = latest?.date ?? null;
    if (units === null) {
      return {
        ...base,
        currentValue: 0,
        basis: "valuation",
        asOfDate: priceDate,
        missing: "units",
      };
    }
    if (units <= 0 && cashFlows.length > 0) {
      return {
        ...base,
        currentValue: 0,
        basis: "valuation",
        asOfDate: priceDate,
        units: 0,
        closed: true,
      };
    }
    if (!latest) {
      return {
        ...base,
        currentValue: 0,
        basis: "valuation",
        asOfDate: null,
        units,
        missing: "price",
      };
    }
    return {
      ...base,
      currentValue: units * latest.pricePerUnit,
      basis: "valuation",
      asOfDate: latest.date,
      units,
    };
  }

  if (ACCRUAL_TYPES.has(holding.type)) {
    const rate = holding.interestRate ?? 0;
    const maturity = holding.maturityDate ?? null;
    const isMatured = maturity !== null && effectiveDate >= maturity;
    const hasMaturityFlow = cashFlows.some((cf) => cf.flowType === "maturity");
    const hasPayoutAfterMaturity =
      isMatured && cashFlows.some((cf) => cf.flowType === "redemption");

    if (hasMaturityFlow || hasPayoutAfterMaturity) {
      return { ...base, currentValue: 0, basis: "accrual", asOfDate: effectiveDate, closed: true };
    }
    if (isMatured) {
      return {
        ...base,
        currentValue: computeAccrualValue(cashFlows, rate, maturity),
        basis: "accrual",
        asOfDate: maturity,
        maturedOn: maturity,
      };
    }
    return {
      ...base,
      currentValue: computeAccrualValue(cashFlows, rate, effectiveDate),
      basis: "accrual",
      asOfDate: effectiveDate,
    };
  }

  if (holding.type === "govt_scheme") {
    return {
      ...base,
      currentValue: computeSchemeBalance(cashFlows),
      basis: "balance",
      asOfDate: effectiveDate,
    };
  }

  return {
    ...base,
    currentValue: computeNetInvested(cashFlows),
    basis: "net_invested",
    asOfDate: effectiveDate,
  };
}

/** Total value of every holding as of `asOfDate` — used for net-worth history. Unknown values count as 0. */
export function getTotalHoldingsValue(asOfDate: string): number {
  return listHoldings().reduce(
    (sum, holding) => sum + getHoldingValue(holding, asOfDate).currentValue,
    0,
  );
}

/**
 * The cash flows that are real money movements for XIRR. A govt scheme's
 * credited `interest` stays inside the scheme (it's already in the balance
 * used as the terminal value), so counting it as received would double it.
 */
function xirrFlows(type: InvestmentType, flows: LedgerFlow[]): CashFlowInput[] {
  return flows
    .filter((cf) => !(type === "govt_scheme" && cf.flowType === "interest"))
    .map((cf) => ({ amount: cf.amount, date: cf.date }));
}

function withValueAndXirr<T extends ValuableHolding>(holdings: T[]) {
  const today = todayIso();
  return holdings.map((holding) => {
    const value = getHoldingValue(holding);
    const cashFlows = listCashFlowsForHolding(holding.id);
    // No value → no return: "—", not −100%.
    const xirr =
      value.missing !== null
        ? null
        : computeXirr(xirrFlows(holding.type, cashFlows), value.currentValue, today);
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
 * docs/prd/finance/returns-analytics.md. Holdings whose value is unknown are
 * left out entirely (their contributions with no value would read as a loss).
 */
export function getPortfolioXirr(): number | null {
  const today = todayIso();
  let totalValue = 0;
  const flows: CashFlowInput[] = [];
  for (const holding of listHoldings()) {
    const value = getHoldingValue(holding);
    if (value.missing !== null) continue;
    totalValue += value.currentValue;
    flows.push(...xirrFlows(holding.type, listCashFlowsForHolding(holding.id)));
  }
  return computeXirr(flows, totalValue, today);
}

/** Fetches the latest NAV for a domestic mutual fund holding and records it as that day's valuation. Manual click only — see price-providers/mutual-fund-nav.ts. */
export async function refreshMutualFundNav(holdingId: number) {
  const holding = getHoldingById(holdingId);
  if (!holding) throw new DomainError("Holding not found");
  if (holding.type !== "mutual_fund_domestic")
    throw new DomainError("NAV refresh is only available for domestic mutual funds");
  if (!holding.externalCode) throw new DomainError("This holding has no AMFI scheme code set");

  const quote = await mutualFundNavProvider.fetchLatestPrice(holding.externalCode);
  return upsertValuation({ holdingId, date: quote.date, pricePerUnit: quote.pricePerUnit });
}
