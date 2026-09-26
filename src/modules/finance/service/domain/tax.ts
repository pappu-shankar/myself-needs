import { getTaxSettings } from "../../db/queries/config/tax-settings";
import { listTaxSlabs } from "../../db/queries/config/tax-slabs";
import { get80cHoldingContributions, getInsurancePremiumsPaid } from "../../db/queries/domain/tax";
import { getMonthlyIncomeExpense } from "../../db/queries/domain/reports";
import { getHoldingsWithValue, getCashFlowsForHolding } from "./investments";
import { UNIT_PRICED_TYPES, type InvestmentType } from "../../types";

/** India's financial year runs April–March. Returns [start, end) as YYYY-MM-DD, `end` exclusive. */
export function getCurrentFinancialYear(today = new Date()): {
  start: string;
  end: string;
  label: string;
} {
  const year = today.getUTCFullYear();
  const isBeforeApril = today.getUTCMonth() < 3; // getUTCMonth() is 0-indexed; 3 = April
  const startYear = isBeforeApril ? year - 1 : year;
  return {
    start: `${startYear}-04-01`,
    end: `${startYear + 1}-04-01`,
    label: `FY ${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`,
  };
}

export function get80cUtilization(): { used: number; limit: number } {
  const { start, end } = getCurrentFinancialYear();
  const settings = getTaxSettings();
  const used =
    get80cHoldingContributions(start, end) + getInsurancePremiumsPaid("is80cEligible", start, end);
  return { used, limit: settings.eightyCLimit };
}

export function get80dUtilization(): { used: number; limit: number } {
  const { start, end } = getCurrentFinancialYear();
  const settings = getTaxSettings();
  const used = getInsurancePremiumsPaid("is80dEligible", start, end);
  return { used, limit: settings.eightyDLimit };
}

const EQUITY_RATE_TYPES = new Set<InvestmentType>(["equity", "mutual_fund_domestic"]);

interface Lot {
  date: string;
  remainingCost: number;
}

export interface GainEvent {
  holdingId: number;
  holdingName: string;
  redemptionDate: string;
  gain: number;
  isLongTerm: boolean;
  category: "equity" | "other";
}

/**
 * FIFO-matches each redemption against the oldest unconsumed contributions.
 * Proceeds up to the matched cost basis are treated as return of capital
 * (no gain); only proceeds *beyond* the matched cost basis are gain, split
 * across the lots touched in proportion to how much of each lot's cost was
 * consumed (each portion's own date decides LTCG/STCG). Dividends/interest
 * don't consume the queue — only `flowType: "redemption"` does. No unit
 * tracking exists in this schema (see docs/prd/finance/investments.md), so
 * this dollar-amount model is a deliberate approximation: a redemption that
 * comes in *below* its matched lots' cost basis registers as a zero-gain
 * event, never a loss — see the roadmap notes.
 */
function computeFifoGains(
  holdingId: number,
  holdingName: string,
  cashFlows: { date: string; amount: number; flowType: string }[],
  ltcgThresholdMonths: number,
  category: "equity" | "other",
): GainEvent[] {
  const sorted = [...cashFlows].sort((a, b) => a.date.localeCompare(b.date));
  const lots: Lot[] = [];
  const events: GainEvent[] = [];

  for (const cf of sorted) {
    if (cf.amount < 0) {
      lots.push({ date: cf.date, remainingCost: -cf.amount });
      continue;
    }
    if (cf.flowType !== "redemption") continue;

    let remainingProceeds = cf.amount;
    const touched: { lot: Lot; costConsumed: number }[] = [];
    while (remainingProceeds > 0 && lots.length > 0) {
      const lot = lots[0];
      const consumed = Math.min(remainingProceeds, lot.remainingCost);
      lot.remainingCost -= consumed;
      remainingProceeds -= consumed;
      touched.push({ lot, costConsumed: consumed });
      if (lot.remainingCost <= 0) lots.shift();
    }

    const totalCostConsumed = touched.reduce((sum, t) => sum + t.costConsumed, 0);
    const excessGain = remainingProceeds;
    if (touched.length === 0 || excessGain <= 0 || totalCostConsumed <= 0) continue;

    for (const t of touched) {
      const gainShare = excessGain * (t.costConsumed / totalCostConsumed);
      if (gainShare <= 0) continue;
      const months = monthsBetween(t.lot.date, cf.date);
      events.push({
        holdingId,
        holdingName,
        redemptionDate: cf.date,
        gain: gainShare,
        isLongTerm: months >= ltcgThresholdMonths,
        category,
      });
    }
  }

  return events;
}

function monthsBetween(fromDate: string, toDate: string): number {
  const [fy, fm] = fromDate.split("-").map(Number);
  const [ty, tm] = toDate.split("-").map(Number);
  return (ty - fy) * 12 + (tm - fm);
}

export interface CapitalGainsEstimate {
  events: GainEvent[];
  ltcgEquity: number;
  stcgEquity: number;
  ltcgOther: number;
  stcgOther: number;
  taxEquityLtcg: number;
  taxEquityStcg: number;
  taxOther: number;
  totalTax: number;
}

/** Capital-gains estimate over every unit-priced holding's full cash-flow history — no schema beyond the existing ledger. See docs/prd/finance/tax-planning.md. */
export function getCapitalGainsEstimate(): CapitalGainsEstimate {
  const settings = getTaxSettings();
  const events: GainEvent[] = [];

  for (const holding of getHoldingsWithValue()) {
    if (!UNIT_PRICED_TYPES.has(holding.type)) continue;
    const category = EQUITY_RATE_TYPES.has(holding.type) ? "equity" : "other";
    const thresholdMonths =
      category === "equity"
        ? settings.equityLtcgThresholdMonths
        : settings.otherLtcgThresholdMonths;
    const cashFlows = getCashFlowsForHolding(holding.id);
    events.push(
      ...computeFifoGains(holding.id, holding.name, cashFlows, thresholdMonths, category),
    );
  }

  const sum = (pred: (e: GainEvent) => boolean) =>
    events.filter(pred).reduce((s, e) => s + e.gain, 0);

  const ltcgEquity = sum((e) => e.category === "equity" && e.isLongTerm);
  const stcgEquity = sum((e) => e.category === "equity" && !e.isLongTerm);
  const ltcgOther = sum((e) => e.category === "other" && e.isLongTerm);
  const stcgOther = sum((e) => e.category === "other" && !e.isLongTerm);

  const taxEquityLtcg =
    Math.max(0, ltcgEquity - settings.equityLtcgExemption) * (settings.equityLtcgRate / 100);
  const taxEquityStcg = stcgEquity * (settings.equityStcgRate / 100);
  const taxOther =
    ltcgOther * (settings.otherLtcgRate / 100) + stcgOther * (settings.otherStcgRate / 100);

  return {
    events,
    ltcgEquity,
    stcgEquity,
    ltcgOther,
    stcgOther,
    taxEquityLtcg,
    taxEquityStcg,
    taxOther,
    totalTax: taxEquityLtcg + taxEquityStcg + taxOther,
  };
}

function computeSlabTax(
  taxableIncome: number,
  slabs: { uptoAmount: number | null; ratePercent: number }[],
): number {
  let tax = 0;
  let lowerBound = 0;
  for (const slab of slabs) {
    const upperBound = slab.uptoAmount ?? Infinity;
    if (taxableIncome <= lowerBound) break;
    const taxableInBracket = Math.min(taxableIncome, upperBound) - lowerBound;
    tax += taxableInBracket * (slab.ratePercent / 100);
    lowerBound = upperBound;
  }
  return tax;
}

export interface RegimeComparison {
  totalIncome: number;
  eightyCUsed: number;
  eightyDUsed: number;
  oldRegimeTax: number;
  newRegimeTax: number;
  betterRegime: "old" | "new";
  savings: number;
  reason: string;
}

/**
 * Old vs. new regime, computed from this FY's actual income + 80C/80D
 * utilization against the editable slabs/rates in tax_settings — not a
 * generic rule of thumb. Section 87A is modeled as a flat cutoff (no
 * marginal relief above the threshold). See docs/prd/finance/tax-planning.md.
 */
export function getRegimeComparison(): RegimeComparison {
  const { start, end } = getCurrentFinancialYear();
  const settings = getTaxSettings();
  const trend = getMonthlyIncomeExpense(start, end);
  const totalIncome = trend.reduce((sum, r) => sum + r.income, 0);

  const eightyCUsed = Math.min(get80cUtilization().used, settings.eightyCLimit);
  const eightyDUsed = Math.min(get80dUtilization().used, settings.eightyDLimit);

  const oldTaxableIncome = Math.max(
    0,
    totalIncome - settings.standardDeductionOld - eightyCUsed - eightyDUsed,
  );
  const newTaxableIncome = Math.max(0, totalIncome - settings.standardDeductionNew);

  const oldSlabs = listTaxSlabs("old");
  const newSlabs = listTaxSlabs("new");

  let oldTax =
    oldTaxableIncome <= settings.rebate87aThresholdOld
      ? 0
      : computeSlabTax(oldTaxableIncome, oldSlabs);
  let newTax =
    newTaxableIncome <= settings.rebate87aThresholdNew
      ? 0
      : computeSlabTax(newTaxableIncome, newSlabs);
  oldTax *= 1 + settings.cessPercent / 100;
  newTax *= 1 + settings.cessPercent / 100;

  const betterRegime = oldTax <= newTax ? "old" : "new";
  const savings = Math.abs(oldTax - newTax);
  const reason =
    betterRegime === "old"
      ? `Your ${(eightyCUsed + eightyDUsed + settings.standardDeductionOld).toLocaleString("en-IN")} in deductions outweighs the new regime's lower slab rates.`
      : `The new regime's lower slab rates beat the old regime even after your 80C/80D deductions.`;

  return {
    totalIncome,
    eightyCUsed,
    eightyDUsed,
    oldRegimeTax: oldTax,
    newRegimeTax: newTax,
    betterRegime,
    savings,
    reason,
  };
}
