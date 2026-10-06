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
import { getAccounts, getTotalBalance, getHoldingsWithValue, getNetWorthTrend } from "@/modules/finance";
import { withUserVault } from "./lib/vault-cli";

void withUserVault(() => {
  const accounts = getAccounts();
  const holdings = getHoldingsWithValue();
  console.log(`Accounts: ${accounts.length}, Holdings: ${holdings.length}`);
  console.log(`getTotalBalance() [excludes receivables]: ${getTotalBalance().toFixed(2)}`);
  const holdingsTotal = holdings.reduce((s, h) => s + h.currentValue, 0);
  console.log(`Holdings total: ${holdingsTotal.toFixed(2)}`);
  console.log(`Net worth (getTotalBalance + holdings): ${(getTotalBalance() + holdingsTotal).toFixed(2)}`);
  const trend = getNetWorthTrend(1);
  console.log(`getNetWorthTrend() latest point: ${JSON.stringify(trend.at(-1))}`);

  const zeroValueHoldings = holdings.filter((h) => h.currentValue === 0);
  if (zeroValueHoldings.length > 0) {
    console.log(`\nWARNING: ${zeroValueHoldings.length} holding(s) still show zero value:`);
    for (const h of zeroValueHoldings) console.log(`  ${h.type} - ${h.name} (id ${h.id})`);
  } else {
    console.log("\nNo zero-value holdings.");
  }
});
