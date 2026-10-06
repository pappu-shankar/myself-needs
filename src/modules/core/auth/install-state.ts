import "server-only";
import { getVaultStatus } from "@/modules/core/db/crypto";
import { getDataDir } from "@/modules/core/env/paths";
import { logError } from "@/modules/core/log";
import { countAccounts } from "./accounts-store";
import { hasClaimMarker, resumeLegacyClaim } from "./legacy-claim";

/**
 * - `legacy-claim`: no accounts yet, and a pre-multi-user vault (data/app.db +
 *   keyring.json) is waiting to be claimed — or a claim was interrupted and
 *   couldn't be finished automatically.
 * - `fresh-setup`: no accounts and no legacy vault; the first admin is created
 *   with the setup token.
 * - `ready`: accounts exist; sign in.
 * - `legacy-broken`: no accounts and only half of a legacy vault is present
 *   (app.db without keyring.json or vice versa) — nothing is offered until the
 *   missing file is restored.
 */
export type InstallState = "legacy-claim" | "fresh-setup" | "ready" | "legacy-broken";

export function getInstallState(): InstallState {
  if (hasClaimMarker()) {
    try {
      resumeLegacyClaim();
    } catch (err) {
      logError("install:resume-claim", err);
      return "legacy-claim";
    }
  }
  if (countAccounts() > 0) return "ready";
  const legacy = getVaultStatus(getDataDir());
  if (legacy === "ready") return "legacy-claim";
  if (legacy === "missing-database" || legacy === "missing-keyring") return "legacy-broken";
  return "fresh-setup";
}
