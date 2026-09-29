import { listAccounts, getAccountsTotal } from "../../db/queries/domain/accounts";
import { addDays, addMonths, monthKey, startOfMonth, todayIso } from "@/lib/dates";
import { getTotalHoldingsValue } from "./investments";

export interface NetWorthPoint {
  /** YYYY-MM */
  month: string;
  netWorth: number;
}

/**
 * Computed fresh every call, not snapshotted: for each of the last `months`
 * months, sums every account's point-in-time balance plus every holding's
 * point-in-time value (assets and liabilities fall out of the same signed
 * sum, same as `getTotalBalance` — liability accounts already store a
 * negative balance). Accounts with `exclude_from_net_worth` set are left
 * out entirely, same as `getTotalBalance`. See docs/prd/finance/net-worth.md.
 */
export function getNetWorthTrend(months = 12): NetWorthPoint[] {
  const accountIds = listAccounts()
    .filter((a) => !a.excludeFromNetWorth)
    .map((a) => a.id);
  const today = todayIso();
  const points: NetWorthPoint[] = [];

  for (let i = months - 1; i >= 0; i--) {
    const monthStart = addMonths(startOfMonth(today), -i);
    const asOfDate = i === 0 ? today : addDays(addMonths(monthStart, 1), -1);
    points.push({
      month: monthKey(monthStart),
      netWorth: getAccountsTotal(accountIds, asOfDate) + getTotalHoldingsValue(asOfDate),
    });
  }

  return points;
}
