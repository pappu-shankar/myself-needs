import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getVaultStatus } from "@/modules/core/db/crypto";
import { isUnlocked } from "@/modules/core/session/guard";
import { getSession } from "@/modules/core/session/session";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { UnlockForm } from "./unlock-form";

export const metadata: Metadata = {
  title: "Unlock — Personal Life OS",
};

const BROKEN_VAULT_COPY = {
  "missing-database": {
    title: "Vault database missing",
    description:
      "Your keyring (keyring.json) is here but the database (app.db) isn't. Restore app.db from a backup into the data folder, then reload this page. Nothing has been changed.",
  },
  "missing-keyring": {
    title: "Vault keyring missing",
    description:
      "Your database (app.db) is here but its keyring (keyring.json) isn't, so it can't be decrypted. Restore keyring.json from a backup into the data folder, then reload this page. Nothing has been changed.",
  },
} as const;

export default async function UnlockPage() {
  const session = await getSession();
  if ((await isUnlocked()) && !session.recoveryKeyPending) {
    redirect("/dashboard");
  }

  const status = getVaultStatus();
  if (status === "missing-database" || status === "missing-keyring") {
    const copy = BROKEN_VAULT_COPY[status];
    return (
      <main className="flex min-h-svh items-center justify-center p-6">
        <Card className="w-full max-w-md" role="alert">
          <CardHeader>
            <CardTitle className="text-xl">{copy.title}</CardTitle>
            <CardDescription>{copy.description}</CardDescription>
          </CardHeader>
        </Card>
      </main>
    );
  }

  // Only a vault with neither file is a genuine first run.
  const isFirstRun = status === "uninitialized";
  const showingReveal = Boolean(session.recoveryKeyPending);

  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">
            {showingReveal
              ? "Save your recovery key"
              : isFirstRun
                ? "Set up your vault"
                : "Welcome back"}
          </CardTitle>
          <CardDescription>
            {showingReveal
              ? "Your vault is unlocked — one more step before you continue."
              : isFirstRun
                ? "Your data will be encrypted with this passphrase. Choose something you won't forget."
                : "Enter your passphrase to unlock your data."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <UnlockForm isFirstRun={isFirstRun} />
        </CardContent>
      </Card>
    </main>
  );
}
