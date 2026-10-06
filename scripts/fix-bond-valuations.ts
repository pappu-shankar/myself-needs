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
import { formatMoney, toMinor } from "@/lib/format";
import { createValuation, getHoldingsWithValue } from "@/modules/finance";
import { toPriceScaled } from "@/modules/finance/service/utility/units";
import { withUserVault } from "./lib/vault-cli";

const TODAY = todayIso();
/** Face value per bond, in major units — scaled for storage at the call site. */
const FACE_VALUE = 100000;

void withUserVault(() => {
  const bonds = getHoldingsWithValue().filter(
    (h) => h.type === "bond" && h.currentValueMinor === 0,
  );
  console.log(`Found ${bonds.length} bond holding(s) with zero value.`);
  for (const bond of bonds) {
    // Prices are scaled by PRICE_SCALE, independent of the currency's own
    // exponent — `toPriceScaled`, not `toMinor`.
    createValuation({
      holdingId: bond.id,
      date: TODAY,
      priceScaled: toPriceScaled(FACE_VALUE),
      priceCurrency: bond.currency,
    });
    console.log(
      `  Fixed: ${bond.name} (id ${bond.id}) -> ${formatMoney({ minor: toMinor(FACE_VALUE, bond.currency), currency: bond.currency })}`,
    );
  }

  const totals = new Map<string, number>();
  for (const holding of getHoldingsWithValue()) {
    totals.set(holding.currency, (totals.get(holding.currency) ?? 0) + holding.currentValueMinor);
  }
  console.log("\nHoldings total now, per currency:");
  for (const [currency, minor] of totals) console.log(`  ${formatMoney({ minor, currency })}`);
});
