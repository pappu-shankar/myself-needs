/**
 * One-time correction — run manually, then delete this file.
 *
 *   pnpm exec tsx --import ./scripts/lib/server-only-shim.mjs scripts/fix-bond-valuations.ts --user <uuid>
 *
 * `--user` is the account's id (its directory under <APP_DATA_DIR>/users/);
 * prompts for that user's password, unlocks only their personal vault and
 * runs inside its request scope (scripts/lib/vault-cli.ts). The shim stands in
 * for `server-only`, which plain Node can't resolve. Add APP_DATA_DIR=data-dev
 * to run against the dev data directory.
 *
 * seed-net-worth.ts inserted 11 bond holdings with a cash-flow contribution
 * but no valuation entry. `bond` is in UNIT_PRICED_TYPES (value = units ×
 * latest valuation, units defaulting to 1 when unset) — with no valuation
 * row, current value computed as 0. This adds one valuation of 100000 per
 * bond (their face value, matching the original "Debt Funds 1100000" figure)
 * to every bond holding that currently has none.
 */
import { todayIso } from "@/lib/dates";
import { createValuation, getHoldingsWithValue } from "@/modules/finance";
import { withUserVault } from "./lib/vault-cli";

const TODAY = todayIso();

void withUserVault(() => {
  const bonds = getHoldingsWithValue().filter((h) => h.type === "bond" && h.currentValue === 0);
  console.log(`Found ${bonds.length} bond holding(s) with zero value.`);
  for (const bond of bonds) {
    createValuation({ holdingId: bond.id, date: TODAY, pricePerUnit: 100000 });
    console.log(`  Fixed: ${bond.name} (id ${bond.id}) -> 100000`);
  }

  const holdingsTotal = getHoldingsWithValue().reduce((sum, h) => sum + h.currentValue, 0);
  console.log(`\nHoldings total now: ${holdingsTotal.toFixed(2)}`);
});
