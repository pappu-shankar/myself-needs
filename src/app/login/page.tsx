import type { Metadata } from "next";
import { listProfilesForPicker } from "@/modules/core/auth/queries";
import { AuthCard } from "@/app/(auth)/_components/auth-card";
import { gateAuthPage } from "@/app/(auth)/_components/auth-gate";
import { InstallBroken } from "@/app/(auth)/_components/install-broken";
import { LoginForm, type LoginProfile } from "./login-form";

export const metadata: Metadata = {
  title: "Sign in — Personal Life OS",
};

export default async function LoginPage() {
  const gate = await gateAuthPage("login");
  if (gate.kind === "broken") return <InstallBroken />;

  // Empty unless APP_PROFILE_PICKER is on (it reveals who has an account).
  const profiles: LoginProfile[] = listProfilesForPicker().map((p) => ({
    id: p.id,
    username: p.username,
    displayName: p.displayName,
    color: p.color,
  }));

  return (
    <AuthCard
      title="Welcome back"
      description={
        profiles.length > 0
          ? "Pick your profile, then enter your password."
          : "Sign in with your username and password."
      }
    >
      <LoginForm profiles={profiles} />
    </AuthCard>
  );
}
