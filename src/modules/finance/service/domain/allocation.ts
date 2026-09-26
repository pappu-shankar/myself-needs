import { listAccountsWithBalances } from "../../db/queries/domain/accounts";
import { listAllocationTargets } from "../../db/queries/config/allocation-targets";
import { getSettings } from "../../db/queries/config/settings";
import { getHoldingsWithValue } from "./investments";
import type { InvestmentType } from "../../types";

/** Accounts of these types count as "cash" in the allocation breakdown — includes the rarely-used `investment` account type (idle brokerage cash), which has no dedicated bucket of its own. */
const CASH_ACCOUNT_TYPES = new Set(["checking", "savings", "cash", "investment"]);

export interface AllocationRow {
  assetClass: string;
  value: number;
  /** null when net worth is zero or negative — a percentage-of-net-worth isn't a meaningful number to show at that point (see `getCurrentAllocation`'s docstring). */
  percentOfNetWorth: number | null;
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
export function getCurrentAllocation(): AllocationRow[] {
  const accounts = listAccountsWithBalances().filter((a) => !a.excludeFromNetWorth);
  const holdings = getHoldingsWithValue();
  const netWorth =
    accounts.reduce((sum, a) => sum + a.balance, 0) +
    holdings.reduce((sum, h) => sum + h.currentValue, 0);

  const byClass = new Map<string, number>();
  const cashTotal = accounts
    .filter((a) => CASH_ACCOUNT_TYPES.has(a.type))
    .reduce((sum, a) => sum + a.balance, 0);
  if (cashTotal !== 0) byClass.set("cash", cashTotal);

  const receivableTotal = accounts
    .filter((a) => a.type === "receivable")
    .reduce((sum, a) => sum + a.balance, 0);
  if (receivableTotal !== 0) byClass.set("receivable", receivableTotal);

  for (const h of holdings) {
    byClass.set(h.type, (byClass.get(h.type) ?? 0) + h.currentValue);
  }

  return Array.from(byClass.entries())
    .filter(([, value]) => value !== 0)
    .map(([assetClass, value]) => ({
      assetClass,
      value,
      percentOfNetWorth: netWorth > 0 ? (value / netWorth) * 100 : null,
    }))
    .sort((a, b) => b.value - a.value);
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

function getCurrentCoarseAllocation(): Record<CoarseClass, number> {
  const coarse: Record<CoarseClass, number> = { equity: 0, debt: 0, gold: 0, cash: 0 };
  for (const row of getCurrentAllocation()) {
    // Money owed to you isn't equity/debt/gold — folds into the "cash" bucket for this coarse split.
    if (row.assetClass === "cash" || row.assetClass === "receivable") coarse.cash += row.value;
    else coarse[COARSE_MAP[row.assetClass as InvestmentType]] += row.value;
  }
  return coarse;
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
  /** current − target; positive means overweight. Null whenever `currentPercentage` is. */
  variance: number | null;
}

export function getAllocationReport(): AllocationTargetRow[] {
  const settings = getSettings();
  const age = settings?.dateOfBirth ? computeAge(settings.dateOfBirth) : null;

  const accounts = listAccountsWithBalances().filter((a) => !a.excludeFromNetWorth);
  const holdings = getHoldingsWithValue();
  const netWorth =
    accounts.reduce((sum, a) => sum + a.balance, 0) +
    holdings.reduce((sum, h) => sum + h.currentValue, 0);

  const current = getCurrentCoarseAllocation();
  const suggested = computeSuggestedTargets(age);
  const stored = new Map(listAllocationTargets().map((t) => [t.assetClass, t.targetPercentage]));

  return (["equity", "debt", "gold", "cash"] as const).map((assetClass) => {
    const targetPercentage = stored.get(assetClass) ?? suggested[assetClass];
    const currentPercentage = netWorth > 0 ? (current[assetClass] / netWorth) * 100 : null;
    return {
      assetClass,
      targetPercentage,
      isCustom: stored.has(assetClass),
      currentPercentage,
      variance: currentPercentage !== null ? currentPercentage - targetPercentage : null,
    };
  });
}
