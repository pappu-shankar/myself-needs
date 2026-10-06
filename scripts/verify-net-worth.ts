/**
 * One-time check — run manually, then delete.
 *
 *   pnpm exec tsx --import ./scripts/lib/server-only-shim.mjs scripts/verify-net-worth.ts --user <uuid>
 *
 * `--user` is the account's id (its directory under <APP_DATA_DIR>/users/);
 * prompts for that user's password, unlocks only their personal vault and
 * runs inside its request scope (scripts/lib/vault-cli.ts). The shim stands in
 * for `server-only`, which plain Node can't resolve. Add APP_DATA_DIR=data-dev
 * to run against the dev data directory.
 */
import { formatMoney } from "@/lib/format";
import { getAccounts, getHoldingsWithValue, getNetWorthTrend } from "@/modules/finance";
import { withUserVault } from "./lib/vault-cli";

/** Minor-unit subtotals per currency. There is deliberately no grand total:
 * adding paise to cents is the bug the currency column exists to prevent, and
 * converting would mean picking an as-of FX rate this script has no business
 * choosing. */
function sumByCurrency<T extends { currency: string }>(
  rows: T[],
  minorOf: (row: T) => number,
): Map<string, number> {
  const totals = new Map<string, number>();
  for (const row of rows) {
    totals.set(row.currency, (totals.get(row.currency) ?? 0) + minorOf(row));
  }
  return totals;
}

void withUserVault(() => {
  const accounts = getAccounts();
  const holdings = getHoldingsWithValue();
  console.log(`Accounts: ${accounts.length}, Holdings: ${holdings.length}`);

  // The same filter `getTotalBalance` applies, folded per currency here rather
  // than read off the service: receivables are opted out of net worth.
  const counted = accounts.filter((a) => !a.excludeFromNetWorth);
  const accountTotals = sumByCurrency(counted, (a) => a.balanceMinor);
  const holdingTotals = sumByCurrency(holdings, (h) => h.currentValueMinor);

  for (const currency of new Set([...accountTotals.keys(), ...holdingTotals.keys()])) {
    const accountsMinor = accountTotals.get(currency) ?? 0;
    const holdingsMinor = holdingTotals.get(currency) ?? 0;
    console.log(`${currency}:`);
    console.log(
      `  Accounts [excludes receivables]: ${formatMoney({ minor: accountsMinor, currency })}`,
    );
    console.log(`  Holdings total: ${formatMoney({ minor: holdingsMinor, currency })}`);
    console.log(`  Net worth: ${formatMoney({ minor: accountsMinor + holdingsMinor, currency })}`);
  }

  const trend = getNetWorthTrend(1);
  console.log(`getNetWorthTrend() latest point: ${JSON.stringify(trend.at(-1))}`);

  const zeroValueHoldings = holdings.filter((h) => h.currentValueMinor === 0);
  if (zeroValueHoldings.length > 0) {
    console.log(`\nWARNING: ${zeroValueHoldings.length} holding(s) still show zero value:`);
    for (const h of zeroValueHoldings) console.log(`  ${h.type} - ${h.name} (id ${h.id})`);
  } else {
    console.log("\nNo zero-value holdings.");
  }
});
