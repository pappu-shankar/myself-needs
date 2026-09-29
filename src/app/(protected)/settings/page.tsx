import type { Metadata } from "next";
import { requireUnlocked } from "@/modules/core/session/guard";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { RotateRecoveryKeyForm } from "./rotate-recovery-key-form";
import { ChangePassphraseForm } from "./change-passphrase-form";

export const metadata: Metadata = {
  title: "Settings — Personal Life OS",
};

function idleLockDescription(): string {
  const raw = process.env.APP_IDLE_LOCK_MINUTES;
  if (raw === "0") return "Auto-lock is turned off (APP_IDLE_LOCK_MINUTES=0).";
  const minutes = raw && Number(raw) > 0 ? Number(raw) : 30;
  return `The vault locks itself after ${minutes} minutes without activity. Change this with the APP_IDLE_LOCK_MINUTES environment variable.`;
}

export default async function SettingsPage() {
  await requireUnlocked();

  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader title="Settings" description="Vault security for this device." />

      <Card>
        <CardHeader>
          <CardTitle>Recovery key</CardTitle>
          <CardDescription>
            Generate a new recovery key if the old one was lost or seen by someone else. The old key
            stops working immediately.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RotateRecoveryKeyForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Passphrase</CardTitle>
          <CardDescription>
            Your recovery key stays the same when you change your passphrase.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ChangePassphraseForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Auto-lock</CardTitle>
          <CardDescription>{idleLockDescription()}</CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
