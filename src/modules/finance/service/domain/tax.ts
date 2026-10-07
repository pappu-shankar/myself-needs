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
import { matchHistory, type LedgerEvent } from "./lots";

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

/** A cash flow already restated in statutory INR paise. */
interface StatutoryFlow {
  date: string;
  amountMinor: number;
  /** Units bought (+) or sold (−), scaled by `UNITS_SCALE`. Null on a flow
   * that moved no units (a dividend) and on legacy rows recorded before units
   * were tracked — see `computeFifoGains` for what that costs. */
  unitsScaled: number | null;
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
  /** Statutory INR paise. **Signed** — negative is a real capital loss, which
   * the previous amount-matching model could not produce. */
  gainMinor: number;
  /** The two halves the gain is the difference of, so a figure can be checked
   * rather than taken on trust. */
  costBasisMinor: number;
  proceedsMinor: number;
  /** Units disposed of, scaled by `UNITS_SCALE`. */
  unitsScaled: number;
  currency: Currency;
  isLongTerm: boolean;
  category: "equity" | "other";
  /** Weakest confidence of the two flows the gain is derived from. */
  confidence: ConfidenceLevel;
}

/**
 * FIFO-matches each sale against the oldest unsold purchase lots, **by units**,
 * and reports the signed gain.
 *
 * This replaced an amount-matching model that drew proceeds down against cost
 * and counted only the excess as gain. That model could not express a capital
 * loss at all — a sale below its cost basis registered as a zero-gain event —
 * which made loss harvesting invisible and overstated taxable gains. The
 * matching engine itself lives in `lots.ts`, pure and database-free.
 *
 * A flow with no recorded units cannot be matched. Rather than guessing a unit
 * count from the amount — which would fabricate a cost basis — such a flow is
 * returned as unmatched, and the estimate says it is incomplete. Legacy rows
 * entered before units were tracked fall in this bucket, so the user is told
 * which holdings need their history completed instead of being shown a figure
 * computed from invented data.
 */
function computeFifoGains(
  holdingId: number,
  holdingName: string,
  flows: readonly StatutoryFlow[],
  ltcgThresholdMonths: number,
  category: "equity" | "other",
  unmatched: UnmatchedDisposal[],
): GainEvent[] {
  const events: LedgerEvent[] = [];
  for (const flow of flows) {
    const isDisposal = flow.flowType === "redemption";
    // A purchase is money out (negative), a disposal money in. Units carry the
    // direction for the matcher, so both are passed as positive amounts.
    if (flow.unitsScaled === null || flow.unitsScaled === 0) {
      if (isDisposal && flow.amountMinor > 0) {
        unmatched.push({
          holdingId,
          holdingName,
          date: flow.date,
          proceedsMinor: flow.amountMinor,
          reason: "no_units_recorded",
        });
      }
      continue;
    }
    events.push({
      date: flow.date,
      unitsScaled: flow.unitsScaled,
      amountMinor: Math.abs(flow.amountMinor),
      confidence: flow.confidence,
      consumesLots: isDisposal,
    });
  }

  const result = matchHistory(events);
  if (result.unmatchedUnitsScaled > 0) {
    unmatched.push({
      holdingId,
      holdingName,
      date: null,
      proceedsMinor: result.unmatchedProceedsMinor,
      reason: "units_exceed_lots",
    });
  }

  return result.matches.map((match) => ({
    holdingId,
    holdingName,
    acquisitionDate: match.acquisitionDate,
    redemptionDate: match.saleDate,
    gainMinor: match.gainMinor,
    costBasisMinor: match.costBasisMinor,
    proceedsMinor: match.proceedsMinor,
    unitsScaled: match.unitsScaled,
    currency: STATUTORY_CURRENCY,
    isLongTerm: isLongTermHolding(match.acquisitionDate, match.saleDate, ltcgThresholdMonths),
    category,
    confidence: match.confidence,
  }));
}

/**
 * A disposal the matcher could not account for.
 *
 * Surfaced rather than swallowed: both reasons mean the recorded history is
 * incomplete, and a gains figure that quietly omitted the sale would read as a
 * complete one.
 */
export interface UnmatchedDisposal {
  holdingId: number;
  holdingName: string;
  /** The sale's date, or null when the shortfall is across the whole history. */
  date: string | null;
  proceedsMinor: number;
  reason:
    | /** The sale recorded no unit count, so there is no basis to match it to. */ "no_units_recorded"
    | /** More units were sold than were ever bought. */ "units_exceed_lots";
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
  /** Total net loss across the buckets that are negative, as a positive
   * figure — the amount available for set-off. Zero when nothing lost. */
  netLossMinor: number;
  /** Every non-INR flow that fed these figures, with the rate used for it, in
   * date order — this is an audit trail, and a trail is read chronologically. */
  conversions: StatutoryConversion[];
  /** Flows left out because no rate resolved on their date. They are dropped
   * rather than converted at a guessed rate, so the estimate is short by
   * whatever they would have contributed — which is what `complete` says. */
  unconverted: UnconvertedFlow[];
  /** Disposals the FIFO matcher could not account for, for the same reason:
   * reported, not swallowed. */
  unmatched: UnmatchedDisposal[];
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
        unitsScaled: cf.unitsScaled,
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
      unitsScaled: cf.unitsScaled,
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
  const unmatched: UnmatchedDisposal[] = [];

  for (const holding of listHoldings()) {
    if (!UNIT_PRICED_TYPES.has(holding.type)) continue;
    const category = EQUITY_RATE_TYPES.has(holding.type) ? "equity" : "other";
    const thresholdMonths =
      category === "equity"
        ? settings.equityLtcgThresholdMonths
        : settings.otherLtcgThresholdMonths;
    const flows = toStatutoryFlows(holding, rates, conversions, unconverted);
    events.push(
      ...computeFifoGains(
        holding.id,
        holding.name,
        flows,
        thresholdMonths,
        category,
        unmatched,
      ).filter((e) => e.redemptionDate >= fy.start && e.redemptionDate <= fy.end),
    );
  }
  events.sort((a, b) => a.redemptionDate.localeCompare(b.redemptionDate));

  const sum = (pred: (e: GainEvent) => boolean) =>
    events.filter(pred).reduce((s, e) => s + e.gainMinor, 0);

  const ltcgEquityMinor = sum((e) => e.category === "equity" && e.isLongTerm);
  const stcgEquityMinor = sum((e) => e.category === "equity" && !e.isLongTerm);
  const ltcgOtherMinor = sum((e) => e.category === "other" && e.isLongTerm);
  const stcgOtherMinor = sum((e) => e.category === "other" && !e.isLongTerm);

  /**
   * Tax on a bucket, never negative.
   *
   * Now that a bucket can be a net *loss* — unit-based matching made that
   * expressible — applying a rate to it straight would produce a negative tax,
   * i.e. assert a refund. A loss does not create a liability: it is set off
   * against other gains or carried forward, and neither is modelled here
   * (this is an estimate, not a filing tool — decision 25). So the tax floors
   * at zero and the loss stays visible in the bucket figure itself, which is
   * what loss harvesting needs to see.
   */
  const taxOn = (gainMinor: number, rateBps: number) =>
    applyRateBps(Math.max(0, gainMinor), rateBps);

  const taxEquityLtcgMinor = taxOn(
    ltcgEquityMinor - settings.equityLtcgExemptionMinor,
    settings.equityLtcgRateBps,
  );
  const taxEquityStcgMinor = taxOn(stcgEquityMinor, settings.equityStcgRateBps);
  const taxOtherMinor =
    taxOn(ltcgOtherMinor, settings.otherLtcgRateBps) +
    taxOn(stcgOtherMinor, settings.otherStcgRateBps);
  /** Net losses per bucket, positive numbers, for the loss-harvesting view.
   * Stated separately because a bucket figure that is negative is easy to read
   * past, and the amount available for set-off is the actionable number. */
  const netLossMinor = [ltcgEquityMinor, stcgEquityMinor, ltcgOtherMinor, stcgOtherMinor]
    .filter((v) => v < 0)
    .reduce((sum, v) => sum - v, 0);

  // A disposal the matcher could not account for leaves the estimate short in
  // the same way an unconvertible flow does, so it counts against `complete`
  // too — otherwise a figure missing a whole sale would present as whole.
  const complete = unconverted.length === 0 && unmatched.length === 0;
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
    netLossMinor,
    // FIFO matching walks sells against buys, so pushes land out of order.
    // Sorted here rather than at each push: one place, one guarantee.
    conversions: [...conversions].sort((a, b) => a.date.localeCompare(b.date)),
    unconverted,
    unmatched,
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
