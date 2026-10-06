import type { Metadata } from "next";
import { getConfig } from "@/modules/core/env/config";
import { requireUser } from "@/modules/core/session/guard";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChangePasswordForm } from "./change-password-form";
import { RotateRecoveryKeyForm } from "./rotate-recovery-key-form";

export const metadata: Metadata = {
  title: "Password & recovery — Settings — Personal Life OS",
};

export default async function PasswordSettingsPage() {
  await requireUser();
  const { idleLockMinutes, sessionMaxHours } = getConfig();

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Password</CardTitle>
          <CardDescription>
            Your password encrypts your data, so nobody — not even an admin — can reset it for you.
            Changing it signs out your other devices. Your recovery key stays the same.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ChangePasswordForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recovery key</CardTitle>
          <CardDescription>
            The only way back in if you forget your password. Generate a new one if the old one was
            lost or seen by someone else — the old key stops working immediately.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RotateRecoveryKeyForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Automatic sign-out</CardTitle>
          <CardDescription>
            You&apos;re signed out after {idleLockMinutes} minutes without activity, and after{" "}
            {sessionMaxHours} hours at most. Restarting the server signs everyone out. The server
            admin sets these with APP_IDLE_LOCK_MINUTES and APP_SESSION_MAX_HOURS.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
