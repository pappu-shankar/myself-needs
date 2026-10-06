import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/app/(auth)/_components/auth-card";
import { gateAuthPage } from "@/app/(auth)/_components/auth-gate";
import { InstallBroken } from "@/app/(auth)/_components/install-broken";
import { InviteForm } from "./invite-form";

export const metadata: Metadata = {
  title: "Accept invite — Personal Life OS",
};

export default async function InvitePage() {
  const gate = await gateAuthPage("invite");
  if (gate.kind === "broken") return <InstallBroken />;
  const { pendingReveal } = gate;

  return (
    <AuthCard
      title={pendingReveal ? "Save your recovery key" : "Create your account"}
      description={
        pendingReveal
          ? "You're signed in — one more step before you continue."
          : "You've been invited. Your data is encrypted with the password you choose here; nobody else, including the admin, can read it."
      }
      footer={
        pendingReveal ? undefined : (
          <Link href="/login" className="hover:text-foreground underline-offset-4 hover:underline">
            Already have an account? Sign in
          </Link>
        )
      }
    >
      <InviteForm pendingReveal={pendingReveal} />
    </AuthCard>
  );
}
