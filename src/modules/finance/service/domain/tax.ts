import { addDays, addMonths } from "@/lib/dates";
import {
  get80cHoldingContributions,
  getInsurancePremiumsPaid,
  listRedemptionDates,
} from "../../db/queries/domain/tax";
import { getMonthlyIncomeExpense } from "../../db/queries/domain/reports";
import { getHoldingsWithValue, getCashFlowsForHolding } from "./investments";
import { getTaxSettingsForYear, getTaxSlabsForYear, listTaxPolicyYears } from "../config/tax";
import { currentFiscalYear, fiscalYearOf, type FiscalYear } from "../utility/fiscal-year";
import { UNIT_PRICED_TYPES, type InvestmentType } from "../../types";

export interface DeductionUtilization {
  used: number;
  limit: number;
  /** The FY whose settings supplied `limit` (an earlier FY when this one has none of its own). */
  policyFiscalYear: string;
}

/** 80C contributions + 80C-eligible premiums paid within the FY, against that FY's limit. */
export function get80cUtilization(fy: FiscalYear = currentFiscalYear()): DeductionUtilization {
  const settings = getTaxSettingsForYear(fy.label);
  const used =
    get80cHoldingContributions(fy.start, fy.end) +
    getInsurancePremiumsPaid("is80cEligible", fy.start, fy.end);
  return { used, limit: settings.eightyCLimit, policyFiscalYear: settings.fiscalYear };
}

/** 80D-eligible (health) premiums paid within the FY, against that FY's limit. */
export function get80dUtilization(fy: FiscalYear = currentFiscalYear()): DeductionUtilization {
  const settings = getTaxSettingsForYear(fy.label);
  const used = getInsurancePremiumsPaid("is80dEligible", fy.start, fy.end);
  return { used, limit: settings.eightyDLimit, policyFiscalYear: settings.fiscalYear };
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
      events.push({
        holdingId,
        holdingName,
        redemptionDate: cf.date,
        gain: gainShare,
        isLongTerm: isLongTermHolding(t.lot.date, cf.date, ltcgThresholdMonths),
        category,
      });
    }
  }

  return events;
}

/**
 * Income-tax Act s.2(42A): an asset is short-term if held for "not more than"
 * the threshold (12 months for listed equity / equity MFs, 24 for the rest
 * under current rules), so long-term means held for MORE than the threshold.
 * Day-exact, with calendar-month arithmetic that clamps to month end: bought
 * 2024-03-15 → long-term from 2025-03-16; bought 2024-02-29 → long-term from
 * 2025-03-01 (2024-02-29 + 12 months = 2025-02-28).
 */
export function isLongTermHolding(
  buyDate: string,
  sellDate: string,
  thresholdMonths: number,
): boolean {
  return sellDate > addMonths(buyDate, thresholdMonths);
}

export interface CapitalGainsEstimate {
  fiscalYear: FiscalYear;
  /** The FY whose settings supplied the thresholds/rates/exemption. */
  policyFiscalYear: string;
  events: GainEvent[];
  ltcgEquity: number;
  stcgEquity: number;
  ltcgOther: number;
  stcgOther: number;
  equityLtcgExemption: number;
  taxEquityLtcg: number;
  taxEquityStcg: number;
  taxOther: number;
  totalTax: number;
}

/**
 * Capital-gains estimate for one FY: FIFO runs over each unit-priced holding's
 * full cash-flow history (earlier redemptions consume earlier lots), but only
 * gains whose redemption date falls inside the FY count, and that FY's
 * thresholds, rates and equity LTCG exemption apply. See
 * docs/prd/finance/tax-planning.md.
 */
export function getCapitalGainsEstimate(
  fy: FiscalYear = currentFiscalYear(),
): CapitalGainsEstimate {
  const settings = getTaxSettingsForYear(fy.label);
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
      ...computeFifoGains(holding.id, holding.name, cashFlows, thresholdMonths, category).filter(
        (e) => e.redemptionDate >= fy.start && e.redemptionDate <= fy.end,
      ),
    );
  }
  events.sort((a, b) => a.redemptionDate.localeCompare(b.redemptionDate));

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
    fiscalYear: fy,
    policyFiscalYear: settings.fiscalYear,
    events,
    ltcgEquity,
    stcgEquity,
    ltcgOther,
    stcgOther,
    equityLtcgExemption: settings.equityLtcgExemption,
    taxEquityLtcg,
    taxEquityStcg,
    taxOther,
    totalTax: taxEquityLtcg + taxEquityStcg + taxOther,
  };
}

/** FYs worth offering in a tax FY picker: the current FY, every FY with a redemption, and every FY with its own tax settings/slabs — newest first. */
export function listTaxFiscalYears(): string[] {
  const labels = new Set<string>([
    currentFiscalYear().label,
    ...listRedemptionDates().map((d) => fiscalYearOf(d).label),
    ...listTaxPolicyYears(),
  ]);
  return [...labels].sort().reverse();
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
  fiscalYear: FiscalYear;
  policyFiscalYear: string;
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
 * Old vs. new regime, computed from the FY's actual income + 80C/80D
 * utilization against that FY's editable slabs/rates — not a
 * generic rule of thumb. Section 87A is modeled as a flat cutoff (no
 * marginal relief above the threshold). See docs/prd/finance/tax-planning.md.
 */
export function getRegimeComparison(fy: FiscalYear = currentFiscalYear()): RegimeComparison {
  const settings = getTaxSettingsForYear(fy.label);
  // getMonthlyIncomeExpense takes an exclusive end date.
  const trend = getMonthlyIncomeExpense(fy.start, addDays(fy.end, 1));
  const totalIncome = trend.reduce((sum, r) => sum + r.income, 0);

  const eightyCUsed = Math.min(get80cUtilization(fy).used, settings.eightyCLimit);
  const eightyDUsed = Math.min(get80dUtilization(fy).used, settings.eightyDLimit);

  const oldTaxableIncome = Math.max(
    0,
    totalIncome - settings.standardDeductionOld - eightyCUsed - eightyDUsed,
  );
  const newTaxableIncome = Math.max(0, totalIncome - settings.standardDeductionNew);

  const oldSlabs = getTaxSlabsForYear(fy.label, "old");
  const newSlabs = getTaxSlabsForYear(fy.label, "new");

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
    fiscalYear: fy,
    policyFiscalYear: settings.fiscalYear,
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
