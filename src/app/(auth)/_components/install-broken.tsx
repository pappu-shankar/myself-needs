import "server-only";
import { getVaultStatus } from "@/modules/core/db/crypto";
import { getDataDir } from "@/modules/core/env/paths";
import { AuthCard } from "./auth-card";

const COPY = {
  "missing-database": {
    title: "Vault database missing",
    description:
      "Your existing keyring (keyring.json) is in the data folder but its database (app.db) isn't. Restore app.db from a backup into the data folder, then reload this page. Nothing has been changed.",
  },
  "missing-keyring": {
    title: "Vault keyring missing",
    description:
      "Your existing database (app.db) is in the data folder but its keyring (keyring.json) isn't, so it can't be decrypted. Restore keyring.json from a backup into the data folder, then reload this page. Nothing has been changed.",
  },
  unknown: {
    title: "Existing vault incomplete",
    description:
      "Part of the existing vault (app.db or keyring.json) is missing from the data folder. Restore it from a backup, then reload this page. Nothing has been changed.",
  },
} as const;

/** Shown on every public auth page while the install state is `legacy-broken`. */
export function InstallBroken() {
  const status = getVaultStatus(getDataDir());
  const copy =
    status === "missing-database" || status === "missing-keyring" ? COPY[status] : COPY.unknown;
  return (
    <AuthCard wide title={copy.title} description={<span role="alert">{copy.description}</span>} />
  );
}
