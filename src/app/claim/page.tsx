import type { Metadata } from "next";
import { AuthCard } from "@/app/(auth)/_components/auth-card";
import { gateAuthPage } from "@/app/(auth)/_components/auth-gate";
import { InstallBroken } from "@/app/(auth)/_components/install-broken";
import { ClaimForm } from "./claim-form";

export const metadata: Metadata = {
  title: "Claim your data — Personal Life OS",
};

export default async function ClaimPage() {
  const gate = await gateAuthPage("claim");
  if (gate.kind === "broken") return <InstallBroken />;

  return (
    <AuthCard
      wide
      title="Claim your data"
      description={
        <>
          This app now supports several accounts. Your existing data becomes your account — enter
          your current passphrase and choose a username. You&apos;ll be the admin and can invite
          others later; they get their own separately encrypted data. Your recovery key keeps
          working, and nothing is deleted.
        </>
      }
    >
      <ClaimForm />
    </AuthCard>
  );
}
