import { listAccountsWithBalances } from "../../db/queries/domain/accounts";
import { listAllocationTargets } from "../../db/queries/config/allocation-targets";
import { getSettings, getBaseCurrency } from "../../db/queries/config/settings";
import { listFxRatesAsOf } from "../../db/queries/config/fx-rates";
import { getHoldingsWithValue } from "./investments";
import { aggregateToBase, type MoneyAggregate } from "../utility/aggregate";
import type { Currency } from "../../db/schema/currency";
import type { InvestmentType } from "../../types";
import { todayIso } from "@/lib/dates";

/**
 * An allocation *mix* is the one figure that cannot be reported per currency:
 * a percentage needs a common denominator. So unlike the balance queries, this
 * service does convert — and therefore has to say what it converted at, and
 * admit when a currency would not resolve. A mix computed over a partial total
 * is a wrong mix, not a slightly stale one, so `complete` is the field callers
 * must respect before showing a percentage.
 */
interface AllocationBasis {
  baseCurrency: Currency;
  netWorth: MoneyAggregate;
  asOf: string;
  rates: ReturnType<typeof listFxRatesAsOf>;
}

/** Per-currency subtotals for everything counted in net worth, split by the
 * asset class each account or holding falls into. */
function collectByClass(): {
  byClass: Map<string, Map<Currency, number>>;
  totals: Map<Currency, number>;
} {
  const accounts = listAccountsWithBalances().filter((a) => !a.excludeFromNetWorth);
  const holdings = getHoldingsWithValue();
  const byClass = new Map<string, Map<Currency, number>>();

  const add = (assetClass: string, currency: Currency, minor: number) => {
    const bucket = byClass.get(assetClass) ?? new Map<Currency, number>();
    bucket.set(currency, (bucket.get(currency) ?? 0) + minor);
    byClass.set(assetClass, bucket);
  };

  // Net worth counts every account, including liabilities; the asset-class
  // buckets do not. That asymmetry is deliberate and is why classes can sum
  // past 100% for a leveraged-but-still-positive portfolio. Bucketing a loan
  // as its own class would also feed an account type into `COARSE_MAP`, which
  // only knows investment types, and silently produce NaN.
  const netWorth = new Map<Currency, number>();
  for (const account of accounts) {
    netWorth.set(account.currency, (netWorth.get(account.currency) ?? 0) + account.balanceMinor);
    if (CASH_ACCOUNT_TYPES.has(account.type)) add("cash", account.currency, account.balanceMinor);
    else if (account.type === "receivable")
      add("receivable", account.currency, account.balanceMinor);
  }
  for (const holding of holdings) {
    netWorth.set(
      holding.currency,
      (netWorth.get(holding.currency) ?? 0) + holding.currentValueMinor,
    );
    add(holding.type, holding.currency, holding.currentValueMinor);
  }

  return { byClass, totals: netWorth };
}

function resolveBasis(totals: Map<Currency, number>): AllocationBasis {
  const asOf = todayIso();
  const baseCurrency = getBaseCurrency();
  const rates = listFxRatesAsOf(asOf);
  return {
    baseCurrency,
    asOf,
    rates,
    netWorth: aggregateToBase(totals, { baseCurrency, asOf, rates }),
  };
}

/** Accounts of these types count as "cash" in the allocation breakdown — includes the rarely-used `investment` account type (idle brokerage cash), which has no dedicated bucket of its own. */
const CASH_ACCOUNT_TYPES = new Set(["checking", "savings", "cash", "investment"]);

export interface AllocationRow {
  assetClass: string;
  /** The class total converted into the base currency, in minor units, with
   * the rate used for each contributing currency. */
  value: MoneyAggregate;
  /** null when net worth is zero or negative — a percentage-of-net-worth isn't
   * a meaningful number to show at that point (see `getCurrentAllocation`'s
   * docstring) — and also null when the conversion was incomplete, because a
   * share of an unknown whole is not a share. */
  percentOfNetWorth: number | null;
}

export interface AllocationView {
  rows: AllocationRow[];
  /** Net worth as this mix measured it, so the UI can state the denominator
   * and the rates behind it rather than showing bare percentages. */
  netWorth: MoneyAggregate;
}

/**
 * Current value of every account and holding grouped by asset class, as a
 * percentage of total net worth (assets minus liabilities — a leveraged-but-
 * still-positive portfolio can legitimately show classes summing past
 * 100%). When net worth is zero or negative, dividing by it produces
 * negative-looking percentages for genuinely positive holdings, which reads
 * as broken rather than "heavily leveraged" — so this returns `null`
 * percentages in that case rather than a technically-correct but
 * meaningless number; raw values are still returned. See
 * docs/prd/finance/reports-allocation.md.
 */
export function getCurrentAllocation(): AllocationView {
  const { byClass, totals } = collectByClass();
  const basis = resolveBasis(totals);
  const netWorthMinor = basis.netWorth.baseMinor;
  // A percentage of a total that could not be fully converted would be a share
  // of an unknown whole, so the mix withholds percentages rather than showing
  // ones computed against a short denominator.
  const canShowPercent = basis.netWorth.complete && netWorthMinor > 0;

  const rows = Array.from(byClass.entries())
    .map(([assetClass, perCurrency]) => ({
      assetClass,
      value: aggregateToBase(perCurrency, basis),
    }))
    .filter((row) => row.value.baseMinor !== 0 || !row.value.complete)
    .map((row) => ({
      ...row,
      percentOfNetWorth: canShowPercent ? (row.value.baseMinor / netWorthMinor) * 100 : null,
    }))
    .sort((a, b) => b.value.baseMinor - a.value.baseMinor);

  return { rows, netWorth: basis.netWorth };
}

type CoarseClass = "equity" | "debt" | "gold" | "cash";

/** Every unit-priced/accrual/net-invested investment type folds into "equity" or "debt" for the coarse equity/debt/gold/cash split the suggested-target heuristic works in. */
const COARSE_MAP: Record<InvestmentType, "equity" | "debt" | "gold"> = {
  equity: "equity",
  intl_equity: "equity",
  mutual_fund_domestic: "equity",
  mutual_fund_intl: "equity",
  bond: "debt",
  fd: "debt",
  rd: "debt",
  chit_fund: "debt",
  govt_scheme: "debt",
  gold: "gold",
  // Jewellery/silver/other physical assets — closest in spirit to the gold hedge bucket.
  other_asset: "gold",
};

/** Base-currency minor units per coarse bucket, plus the net worth they were
 * measured against, so the caller divides by the same denominator the buckets
 * were converted into. */
function getCurrentCoarseAllocation(): {
  coarse: Record<CoarseClass, number>;
  netWorth: MoneyAggregate;
} {
  const coarse: Record<CoarseClass, number> = { equity: 0, debt: 0, gold: 0, cash: 0 };
  const view = getCurrentAllocation();
  for (const row of view.rows) {
    // Money owed to you isn't equity/debt/gold — folds into the "cash" bucket for this coarse split.
    if (row.assetClass === "cash" || row.assetClass === "receivable")
      coarse.cash += row.value.baseMinor;
    else coarse[COARSE_MAP[row.assetClass as InvestmentType]] += row.value.baseMinor;
  }
  return { coarse, netWorth: view.netWorth };
}

const GOLD_HEDGE_PERCENT = 5;
const CASH_BUFFER_PERCENT = 10;

function computeAge(dateOfBirth: string): number {
  const today = new Date();
  const dob = new Date(dateOfBirth);
  let age = today.getUTCFullYear() - dob.getUTCFullYear();
  const hadBirthdayThisYear =
    today.getUTCMonth() > dob.getUTCMonth() ||
    (today.getUTCMonth() === dob.getUTCMonth() && today.getUTCDate() >= dob.getUTCDate());
  if (!hadBirthdayThisYear) age -= 1;
  return age;
}

/**
 * "100 minus age" equity/debt split (clamped to a sane range) on top of a
 * small fixed gold hedge and cash buffer — a formula-driven starting point,
 * explicitly not financial advice. Falls back to a generic moderate split
 * when no DOB is on file. See docs/prd/finance/reports-allocation.md.
 */
function computeSuggestedTargets(age: number | null): Record<CoarseClass, number> {
  if (age === null) {
    return { equity: 55, debt: 30, gold: GOLD_HEDGE_PERCENT, cash: CASH_BUFFER_PERCENT };
  }
  const remaining = 100 - GOLD_HEDGE_PERCENT - CASH_BUFFER_PERCENT;
  const equityFraction = Math.min(1, Math.max(0, (100 - age) / 100));
  const equity = remaining * equityFraction;
  return { equity, debt: remaining - equity, gold: GOLD_HEDGE_PERCENT, cash: CASH_BUFFER_PERCENT };
}

export interface AllocationTargetRow {
  assetClass: CoarseClass;
  targetPercentage: number;
  isCustom: boolean;
  /** null when net worth is zero or negative — see `getCurrentAllocation`'s docstring. */
  currentPercentage: number | null;
  /** The class total in the base currency's minor units. */
  currentMinor: number;
  /** current − target; positive means overweight. Null whenever `currentPercentage` is. */
  variance: number | null;
}

export interface AllocationReport {
  rows: AllocationTargetRow[];
  /** The denominator every `currentPercentage` was computed against, carrying
   * the rates it used. A variance shown without this is unauditable. */
  netWorth: MoneyAggregate;
}

export function getAllocationReport(): AllocationReport {
  const settings = getSettings();
  const age = settings?.dateOfBirth ? computeAge(settings.dateOfBirth) : null;

  const { coarse, netWorth } = getCurrentCoarseAllocation();
  const suggested = computeSuggestedTargets(age);
  const stored = new Map(listAllocationTargets().map((t) => [t.assetClass, t.targetPercentage]));
  const canShowPercent = netWorth.complete && netWorth.baseMinor > 0;

  const rows = (["equity", "debt", "gold", "cash"] as const).map((assetClass) => {
    const targetPercentage = stored.get(assetClass) ?? suggested[assetClass];
    const currentPercentage = canShowPercent
      ? (coarse[assetClass] / netWorth.baseMinor) * 100
      : null;
    return {
      assetClass,
      targetPercentage,
      isCustom: stored.has(assetClass),
      currentMinor: coarse[assetClass],
      currentPercentage,
      variance: currentPercentage !== null ? currentPercentage - targetPercentage : null,
    };
  });

  return { rows, netWorth };
}
