import { listAccounts, getAccountBalance } from "../../db/queries/domain/accounts";
import { getTotalHoldingsValue } from "./investments";

export interface NetWorthPoint {
  /** YYYY-MM */
  month: string;
  netWorth: number;
}

function lastDayOfMonth(year: number, month1: number): string {
  return new Date(Date.UTC(year, month1, 0)).toISOString().slice(0, 10);
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
  const accounts = listAccounts().filter((a) => !a.excludeFromNetWorth);
  const today = new Date();
  const points: NetWorthPoint[] = [];

  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - i, 1));
    const year = d.getUTCFullYear();
    const month1 = d.getUTCMonth() + 1;
    const asOfDate = i === 0 ? today.toISOString().slice(0, 10) : lastDayOfMonth(year, month1);

    const accountsTotal = accounts.reduce((sum, a) => sum + getAccountBalance(a.id, asOfDate), 0);
    const holdingsTotal = getTotalHoldingsValue(asOfDate);

    points.push({
      month: `${year}-${String(month1).padStart(2, "0")}`,
      netWorth: accountsTotal + holdingsTotal,
    });
  }

  return points;
}
