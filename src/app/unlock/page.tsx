import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { databaseFileExists, isDatabaseOpen } from "@/modules/core/db/client";
import { getSession } from "@/modules/core/session/session";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { UnlockForm } from "./unlock-form";

export const metadata: Metadata = {
  title: "Unlock — Personal Life OS",
};

export default async function UnlockPage() {
  const session = await getSession();
  if (isDatabaseOpen() && session.unlocked && !session.recoveryKeyPending) {
    redirect("/dashboard");
  }

  const isFirstRun = !databaseFileExists();
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
