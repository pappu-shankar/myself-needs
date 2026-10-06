import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/app/(auth)/_components/auth-card";
import { gateAuthPage } from "@/app/(auth)/_components/auth-gate";
import { InstallBroken } from "@/app/(auth)/_components/install-broken";
import { RecoverForm } from "./recover-form";

export const metadata: Metadata = {
  title: "Recover your account — Personal Life OS",
};

export default async function RecoverPage() {
  const gate = await gateAuthPage("recover");
  if (gate.kind === "broken") return <InstallBroken />;

  return (
    <AuthCard
      title="Forgot your password?"
      description="Your data is encrypted with your password, so only your recovery key can reset it."
      footer={
        <Link href="/login" className="hover:text-foreground underline-offset-4 hover:underline">
          Back to sign in
        </Link>
      }
    >
      <RecoverForm />
    </AuthCard>
  );
}
