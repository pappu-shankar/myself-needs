import type { Metadata } from "next";
import { announceSetupToken } from "@/modules/core/auth/queries";
import { AuthCard } from "@/app/(auth)/_components/auth-card";
import { gateAuthPage } from "@/app/(auth)/_components/auth-gate";
import { InstallBroken } from "@/app/(auth)/_components/install-broken";
import { SetupForm } from "./setup-form";

export const metadata: Metadata = {
  title: "Set up — Personal Life OS",
};

export default async function SetupPage() {
  const gate = await gateAuthPage("setup");
  if (gate.kind === "broken") return <InstallBroken />;
  const { pendingReveal } = gate;

  // Without APP_SETUP_TOKEN, generates a one-time token and prints it to the
  // server log, so only someone with access to the host can create the admin.
  if (!pendingReveal) announceSetupToken();

  return (
    <AuthCard
      wide
      title={pendingReveal ? "Save your recovery key" : "Create the admin account"}
      description={
        pendingReveal ? (
          "You're signed in as the admin — one more step before you continue."
        ) : (
          <>
            This is a fresh install. To prove you run this server, enter the setup token: the value
            of the <code className="font-mono">APP_SETUP_TOKEN</code> environment variable or, if
            that isn&apos;t set, the one-time token printed in the server log (look for{" "}
            <code className="font-mono">[setup]</code>; a new one is printed whenever the server
            restarts).
          </>
        )
      }
    >
      <SetupForm pendingReveal={pendingReveal} />
    </AuthCard>
  );
}
