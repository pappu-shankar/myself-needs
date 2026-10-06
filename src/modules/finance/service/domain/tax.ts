import { addDays, addMonths, todayIso } from "@/lib/dates";
import { formatMoney } from "@/lib/format";
import {
  get80cHoldingContributionsByCurrency,
  getInsurancePremiumsPaidByCurrency,
  listRedemptionDates,
} from "../../db/queries/domain/tax";
import { getMonthlyIncomeExpense } from "../../db/queries/domain/reports";
import { listFxRatesAsOf } from "../../db/queries/config/fx-rates";
import { listCashFlowsForHolding, listHoldings } from "../../db/queries/domain/investments";
import {
  getTaxSettingsForYear,
  getTaxSlabsForYear,
  listTaxPolicyYears,
  STATUTORY_CURRENCY,
} from "../config/tax";
import { currentFiscalYear, fiscalYearOf, type FiscalYear } from "../utility/fiscal-year";
import { UNIT_PRICED_TYPES, type InvestmentType } from "../../types";
import { applyRateBps } from "../utility/units";
import { divRound, toSafeNumber } from "../utility/integer-math";
import { convert, type FxRate } from "../utility/fx";
import {
  aggregateToBase,
  confidenceMix,
  mergeByCurrency,
  weakestConfidence,
  type ConfidenceShare,
  type MoneyAggregate,
} from "../utility/aggregate";
import type { Currency } from "../../db/schema/currency";
import type { ConfidenceLevel } from "../../db/schema/provenance";

/**
 * Tax is computed in statutory INR paise, not in the user's base currency
 * (decision 15): a ₹1.5 L 80C ceiling or a ₹12.5 L slab boundary is set by the
 * Finance Act and does not move when someone switches their reports to USD.
 * So money arriving in another currency is converted *into* INR before it
 * meets a statutory figure, and every such conversion is reported back with
 * the rate it used. Nothing here ever assumes a foreign amount is rupees, and
 * nothing falls back to a 1:1 rate: a currency with no resolvable rate is left
 * out and the result says it is incomplete.
 */
export interface StatutoryFxContext {
  /** Overrides the vault's stored rate series — for tests and for a what-if at
   * a hypothetical rate. Omit it and the rates come from `finance_fx_rates`. */
  rates?: readonly FxRate[];
  /** The date rates are read as of, for the figures that can only be converted
   * in bulk. Defaults to the FY's close, or today for an FY still running. */
  asOf?: string;
}

/**
 * Per-currency subtotals arrive from the query layer without their own dates,
 * so they convert at one date: the FY's close, which is when the statutory
 * year is assessed. For an FY still in progress that date hasn't happened, and
 * reading rates "as of" the future would mark every rate stale, so today binds
 * instead.
 */
function statutoryAsOf(fy: FiscalYear, fx?: StatutoryFxContext): string {
  if (fx?.asOf) return fx.asOf;
  const today = todayIso();
  return fy.end < today ? fy.end : today;
}

function statutoryRates(asOf: string, fx?: StatutoryFxContext): readonly FxRate[] {
  return fx?.rates ?? listFxRatesAsOf(asOf);
}

export interface DeductionUtilization {
  /** What was contributed, in statutory INR paise, carrying the rate used for
   * each contributing currency. `used.complete === false` means a currency had
   * no resolvable rate, so `used.baseMinor` is short by that currency. */
  used: MoneyAggregate;
  /** The statutory ceiling, INR paise. */
  limitMinor: number;
  /** Always INR — see the module docstring. */
  currency: Currency;
  /** The FY whose settings supplied `limitMinor` (an earlier FY when this one has none of its own). */
  policyFiscalYear: string;
}

function statutoryDeduction(
  byCurrency: ReadonlyMap<Currency, number>,
  limitMinor: number,
  policyFiscalYear: string,
  fy: FiscalYear,
  fx?: StatutoryFxContext,
): DeductionUtilization {
  const asOf = statutoryAsOf(fy, fx);
  return {
    used: aggregateToBase(byCurrency, {
      baseCurrency: STATUTORY_CURRENCY,
      asOf,
      rates: statutoryRates(asOf, fx),
    }),
    limitMinor,
    currency: STATUTORY_CURRENCY,
    policyFiscalYear,
  };
}

/** 80C contributions + 80C-eligible premiums paid within the FY, against that FY's limit. */
export function get80cUtilization(
  fy: FiscalYear = currentFiscalYear(),
  fx?: StatutoryFxContext,
): DeductionUtilization {
  const settings = getTaxSettingsForYear(fy.label);
  const byCurrency = mergeByCurrency(
    get80cHoldingContributionsByCurrency(fy.start, fy.end),
    getInsurancePremiumsPaidByCurrency("is80cEligible", fy.start, fy.end),
  );
  return statutoryDeduction(byCurrency, settings.eightyCLimitMinor, settings.fiscalYear, fy, fx);
}

/** 80D-eligible (health) premiums paid within the FY, against that FY's limit. */
export function get80dUtilization(
  fy: FiscalYear = currentFiscalYear(),
  fx?: StatutoryFxContext,
): DeductionUtilization {
  const settings = getTaxSettingsForYear(fy.label);
  return statutoryDeduction(
    getInsurancePremiumsPaidByCurrency("is80dEligible", fy.start, fy.end),
    settings.eightyDLimitMinor,
    settings.fiscalYear,
    fy,
    fx,
  );
}

const EQUITY_RATE_TYPES = new Set<InvestmentType>(["equity", "mutual_fund_domestic"]);

interface Lot {
  date: string;
  remainingCostMinor: number;
  confidence: ConfidenceLevel;
}

/** A cash flow already restated in statutory INR paise. */
interface StatutoryFlow {
  date: string;
  amountMinor: number;
  flowType: string;
  confidence: ConfidenceLevel;
}

/** A non-INR flow restated in INR, and the rate that did it. */
export interface StatutoryConversion {
  holdingId: number;
  /** Each flow converts at its own date's rate — that is what the Act asks of
   * a cost basis and of proceeds, and it is possible here because a cash flow
   * carries its own date (unlike the bulk per-currency deduction subtotals). */
  date: string;
  currency: Currency;
  minor: number;
  /** The same amount in INR paise. */
  inrMinor: number;
  /** Display only — never arithmetic. */
  rateScaled: number;
  rateDate: string;
  rateSource: string;
}

/** A flow whose currency had no resolvable rate on its own date. */
export interface UnconvertedFlow {
  holdingId: number;
  holdingName: string;
  date: string;
  currency: Currency;
  minor: number;
}

export interface GainEvent {
  holdingId: number;
  holdingName: string;
  /** The matched lot's date — this is what decides long vs. short term. */
  acquisitionDate: string;
  redemptionDate: string;
  /** Statutory INR paise. */
  gainMinor: number;
  currency: Currency;
  isLongTerm: boolean;
  category: "equity" | "other";
  /** Weakest confidence of the two flows the gain is derived from. */
  confidence: ConfidenceLevel;
}

/**
 * FIFO-matches each redemption against the oldest unconsumed contributions.
 * Proceeds up to the matched cost basis are treated as return of capital
 * (no gain); only proceeds *beyond* the matched cost basis are gain, split
 * across the lots touched in proportion to how much of each lot's cost was
 * consumed (each portion's own date decides LTCG/STCG). Dividends/interest
 * don't consume the queue — only `flowType: "redemption"` does. No unit
 * tracking exists in this schema (see docs/prd/finance/investments.md), so
 * this amount-matching model is a deliberate approximation: a redemption that
 * comes in *below* its matched lots' cost basis registers as a zero-gain
 * event, never a loss — see the roadmap notes.
 *
 * The split is apportioned on a running cumulative total rather than per lot,
 * so the integer shares add back to the gain exactly instead of losing a
 * paisa per lot to rounding.
 */
function computeFifoGains(
  holdingId: number,
  holdingName: string,
  flows: readonly StatutoryFlow[],
  ltcgThresholdMonths: number,
  category: "equity" | "other",
): GainEvent[] {
  const sorted = [...flows].sort((a, b) => a.date.localeCompare(b.date));
  const lots: Lot[] = [];
  const events: GainEvent[] = [];

  for (const cf of sorted) {
    if (cf.amountMinor < 0) {
      lots.push({
        date: cf.date,
        remainingCostMinor: -cf.amountMinor,
        confidence: cf.confidence,
      });
      continue;
    }
    if (cf.flowType !== "redemption") continue;

    let remainingProceedsMinor = cf.amountMinor;
    const touched: { lot: Lot; costConsumedMinor: number }[] = [];
    while (remainingProceedsMinor > 0 && lots.length > 0) {
      const lot = lots[0];
      const consumedMinor = Math.min(remainingProceedsMinor, lot.remainingCostMinor);
      lot.remainingCostMinor -= consumedMinor;
      remainingProceedsMinor -= consumedMinor;
      touched.push({ lot, costConsumedMinor: consumedMinor });
      if (lot.remainingCostMinor <= 0) lots.shift();
    }

    const totalCostConsumedMinor = touched.reduce((sum, t) => sum + t.costConsumedMinor, 0);
    const excessGainMinor = remainingProceedsMinor;
    if (touched.length === 0 || excessGainMinor <= 0 || totalCostConsumedMinor <= 0) continue;

    let cumulativeCostMinor = 0;
    let allocatedMinor = 0;
    for (const t of touched) {
      cumulativeCostMinor += t.costConsumedMinor;
      const throughHereMinor = toSafeNumber(
        divRound(
          BigInt(excessGainMinor) * BigInt(cumulativeCostMinor),
          BigInt(totalCostConsumedMinor),
        ),
        "computeFifoGains",
      );
      const gainMinor = throughHereMinor - allocatedMinor;
      allocatedMinor = throughHereMinor;
      if (gainMinor <= 0) continue;
      events.push({
        holdingId,
        holdingName,
        acquisitionDate: t.lot.date,
        redemptionDate: cf.date,
        gainMinor,
        currency: STATUTORY_CURRENCY,
        isLongTerm: isLongTermHolding(t.lot.date, cf.date, ltcgThresholdMonths),
        category,
        confidence: weakestConfidence([t.lot.confidence, cf.confidence]),
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
  /** Always INR: every `*Minor` figure below is statutory INR paise. */
  currency: Currency;
  events: GainEvent[];
  ltcgEquityMinor: number;
  stcgEquityMinor: number;
  ltcgOtherMinor: number;
  stcgOtherMinor: number;
  equityLtcgExemptionMinor: number;
  taxEquityLtcgMinor: number;
  taxEquityStcgMinor: number;
  taxOtherMinor: number;
  totalTaxMinor: number;
  /** Every non-INR flow that fed these figures, with the rate used for it, in
   * date order — this is an audit trail, and a trail is read chronologically. */
  conversions: StatutoryConversion[];
  /** Flows left out because no rate resolved on their date. They are dropped
   * rather than converted at a guessed rate, so the estimate is short by
   * whatever they would have contributed — which is what `complete` says. */
  unconverted: UnconvertedFlow[];
  complete: boolean;
  confidence: ConfidenceLevel;
  confidenceMix: ConfidenceShare[];
}

/** Restate one holding's cash flows in INR, each at its own date's rate. */
function toStatutoryFlows(
  holding: { id: number; name: string },
  rates: readonly FxRate[],
  conversions: StatutoryConversion[],
  unconverted: UnconvertedFlow[],
): StatutoryFlow[] {
  const flows: StatutoryFlow[] = [];
  for (const cf of listCashFlowsForHolding(holding.id)) {
    if (cf.currency === STATUTORY_CURRENCY) {
      flows.push({
        date: cf.date,
        amountMinor: cf.amountMinor,
        flowType: cf.flowType,
        confidence: cf.confidence,
      });
      continue;
    }
    const converted = convert(rates, cf.amountMinor, cf.currency, STATUTORY_CURRENCY, cf.date);
    if (!converted) {
      unconverted.push({
        holdingId: holding.id,
        holdingName: holding.name,
        date: cf.date,
        currency: cf.currency,
        minor: cf.amountMinor,
      });
      continue;
    }
    conversions.push({
      holdingId: holding.id,
      date: cf.date,
      currency: cf.currency,
      minor: cf.amountMinor,
      inrMinor: converted.minor,
      rateScaled: converted.rateScaled,
      rateDate: converted.rateDate,
      rateSource: converted.rateSource,
    });
    flows.push({
      date: cf.date,
      amountMinor: converted.minor,
      flowType: cf.flowType,
      confidence: cf.confidence,
    });
  }
  return flows;
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
  fx?: StatutoryFxContext,
): CapitalGainsEstimate {
  const settings = getTaxSettingsForYear(fy.label);
  // Each flow converts at its *own* date, and FIFO walks the whole history
  // (including flows after this FY, which consume no lot it can see), so the
  // usable set is every stored rate rather than one as-of the FY's close.
  const rates = statutoryRates(todayIso(), fx);
  const events: GainEvent[] = [];
  const conversions: StatutoryConversion[] = [];
  const unconverted: UnconvertedFlow[] = [];

  for (const holding of listHoldings()) {
    if (!UNIT_PRICED_TYPES.has(holding.type)) continue;
    const category = EQUITY_RATE_TYPES.has(holding.type) ? "equity" : "other";
    const thresholdMonths =
      category === "equity"
        ? settings.equityLtcgThresholdMonths
        : settings.otherLtcgThresholdMonths;
    const flows = toStatutoryFlows(holding, rates, conversions, unconverted);
    events.push(
      ...computeFifoGains(holding.id, holding.name, flows, thresholdMonths, category).filter(
        (e) => e.redemptionDate >= fy.start && e.redemptionDate <= fy.end,
      ),
    );
  }
  events.sort((a, b) => a.redemptionDate.localeCompare(b.redemptionDate));

  const sum = (pred: (e: GainEvent) => boolean) =>
    events.filter(pred).reduce((s, e) => s + e.gainMinor, 0);

  const ltcgEquityMinor = sum((e) => e.category === "equity" && e.isLongTerm);
  const stcgEquityMinor = sum((e) => e.category === "equity" && !e.isLongTerm);
  const ltcgOtherMinor = sum((e) => e.category === "other" && e.isLongTerm);
  const stcgOtherMinor = sum((e) => e.category === "other" && !e.isLongTerm);

  const taxEquityLtcgMinor = applyRateBps(
    Math.max(0, ltcgEquityMinor - settings.equityLtcgExemptionMinor),
    settings.equityLtcgRateBps,
  );
  const taxEquityStcgMinor = applyRateBps(stcgEquityMinor, settings.equityStcgRateBps);
  const taxOtherMinor =
    applyRateBps(ltcgOtherMinor, settings.otherLtcgRateBps) +
    applyRateBps(stcgOtherMinor, settings.otherStcgRateBps);

  const complete = unconverted.length === 0;
  return {
    fiscalYear: fy,
    policyFiscalYear: settings.fiscalYear,
    currency: STATUTORY_CURRENCY,
    events,
    ltcgEquityMinor,
    stcgEquityMinor,
    ltcgOtherMinor,
    stcgOtherMinor,
    equityLtcgExemptionMinor: settings.equityLtcgExemptionMinor,
    taxEquityLtcgMinor,
    taxEquityStcgMinor,
    taxOtherMinor,
    totalTaxMinor: taxEquityLtcgMinor + taxEquityStcgMinor + taxOtherMinor,
    // FIFO matching walks sells against buys, so pushes land out of order.
    // Sorted here rather than at each push: one place, one guarantee.
    conversions: [...conversions].sort((a, b) => a.date.localeCompare(b.date)),
    unconverted,
    complete,
    // A figure that is missing flows cannot claim the confidence of the flows
    // it did include — how much is absent is exactly what isn't known.
    confidence: complete ? weakestConfidence(events.map((e) => e.confidence)) : "unknown",
    confidenceMix: confidenceMix(
      events.map((e) => ({ confidence: e.confidence, baseMinor: e.gainMinor })),
    ),
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

/**
 * Progressive slab tax, exact in integers: the amount falling in each bracket
 * is an integer paise figure and each bracket's tax is that figure times the
 * bracket's basis points. The open-ended top bracket is bounded by the taxable
 * amount itself rather than by `Infinity`, so no non-integer ever enters.
 */
function computeSlabTaxMinor(
  taxableIncomeMinor: number,
  slabs: readonly { uptoAmountMinor: number | null; rateBps: number }[],
): number {
  let taxMinor = 0;
  let lowerBoundMinor = 0;
  for (const slab of slabs) {
    if (taxableIncomeMinor <= lowerBoundMinor) break;
    const upperBoundMinor = slab.uptoAmountMinor ?? taxableIncomeMinor;
    const taxableInBracketMinor = Math.min(taxableIncomeMinor, upperBoundMinor) - lowerBoundMinor;
    taxMinor += applyRateBps(taxableInBracketMinor, slab.rateBps);
    lowerBoundMinor = upperBoundMinor;
  }
  return taxMinor;
}

export interface RegimeComparison {
  fiscalYear: FiscalYear;
  policyFiscalYear: string;
  /** Always INR: every `*Minor` figure below is statutory INR paise. */
  currency: Currency;
  /** The FY's income converted to INR, carrying the rate used per currency. */
  income: MoneyAggregate;
  eightyCUsedMinor: number;
  eightyDUsedMinor: number;
  oldRegimeTaxMinor: number;
  newRegimeTaxMinor: number;
  betterRegime: "old" | "new";
  savingsMinor: number;
  /** False when any income or deduction currency had no resolvable rate — the
   * comparison is then computed on only what converted. */
  complete: boolean;
  confidence: ConfidenceLevel;
  reason: string;
}

/**
 * Old vs. new regime, computed from the FY's actual income + 80C/80D
 * utilization against that FY's editable slabs/rates — not a
 * generic rule of thumb. Section 87A is modeled as a flat cutoff (no
 * marginal relief above the threshold). See docs/prd/finance/tax-planning.md.
 *
 * Income arrives per month *per currency*, so it is aggregated into statutory
 * INR before it meets a slab boundary; a currency that could not be converted
 * leaves the comparison `complete: false` rather than being treated as rupees.
 */
export function getRegimeComparison(
  fy: FiscalYear = currentFiscalYear(),
  fx?: StatutoryFxContext,
): RegimeComparison {
  const settings = getTaxSettingsForYear(fy.label);
  // getMonthlyIncomeExpense takes an exclusive end date.
  const trend = getMonthlyIncomeExpense(fy.start, addDays(fy.end, 1));
  const incomeByCurrency = new Map<Currency, number>();
  for (const row of trend) {
    incomeByCurrency.set(row.currency, (incomeByCurrency.get(row.currency) ?? 0) + row.incomeMinor);
  }
  const asOf = statutoryAsOf(fy, fx);
  const income = aggregateToBase(incomeByCurrency, {
    baseCurrency: STATUTORY_CURRENCY,
    asOf,
    rates: statutoryRates(asOf, fx),
  });

  const eightyC = get80cUtilization(fy, fx);
  const eightyD = get80dUtilization(fy, fx);
  const eightyCUsedMinor = Math.min(eightyC.used.baseMinor, settings.eightyCLimitMinor);
  const eightyDUsedMinor = Math.min(eightyD.used.baseMinor, settings.eightyDLimitMinor);

  const oldTaxableIncomeMinor = Math.max(
    0,
    income.baseMinor - settings.standardDeductionOldMinor - eightyCUsedMinor - eightyDUsedMinor,
  );
  const newTaxableIncomeMinor = Math.max(0, income.baseMinor - settings.standardDeductionNewMinor);

  const oldSlabs = getTaxSlabsForYear(fy.label, "old");
  const newSlabs = getTaxSlabsForYear(fy.label, "new");

  const oldSlabTaxMinor =
    oldTaxableIncomeMinor <= settings.rebate87aThresholdOldMinor
      ? 0
      : computeSlabTaxMinor(oldTaxableIncomeMinor, oldSlabs);
  const newSlabTaxMinor =
    newTaxableIncomeMinor <= settings.rebate87aThresholdNewMinor
      ? 0
      : computeSlabTaxMinor(newTaxableIncomeMinor, newSlabs);
  // Cess is a surcharge on the slab tax, so it is a bps application to an
  // integer paise figure rather than a float multiplier on the total.
  const oldRegimeTaxMinor = oldSlabTaxMinor + applyRateBps(oldSlabTaxMinor, settings.cessBps);
  const newRegimeTaxMinor = newSlabTaxMinor + applyRateBps(newSlabTaxMinor, settings.cessBps);

  const betterRegime = oldRegimeTaxMinor <= newRegimeTaxMinor ? "old" : "new";
  const deductionsMinor = eightyCUsedMinor + eightyDUsedMinor + settings.standardDeductionOldMinor;
  const reason =
    betterRegime === "old"
      ? `Your ${formatMoney({ minor: deductionsMinor, currency: STATUTORY_CURRENCY }, { wholeUnits: true })} in deductions outweighs the new regime's lower slab rates.`
      : `The new regime's lower slab rates beat the old regime even after your 80C/80D deductions.`;

  return {
    fiscalYear: fy,
    policyFiscalYear: settings.fiscalYear,
    currency: STATUTORY_CURRENCY,
    income,
    eightyCUsedMinor,
    eightyDUsedMinor,
    oldRegimeTaxMinor,
    newRegimeTaxMinor,
    betterRegime,
    savingsMinor: Math.abs(oldRegimeTaxMinor - newRegimeTaxMinor),
    complete: income.complete && eightyC.used.complete && eightyD.used.complete,
    confidence: weakestConfidence([
      income.confidence,
      eightyC.used.confidence,
      eightyD.used.confidence,
    ]),
    reason,
  };
}
