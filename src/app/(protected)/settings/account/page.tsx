import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getMyProfile } from "@/modules/core/auth/queries";
import { requireUser } from "@/modules/core/session/guard";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DeleteAccountForm } from "./delete-account-form";

export const metadata: Metadata = {
  title: "Danger zone — Settings — Personal Life OS",
};

export default async function DangerZonePage() {
  const scope = await requireUser();
  const profile = getMyProfile(scope);
  if (!profile) redirect("/login");

  return (
    <Card className="border-destructive/40 border">
      <CardHeader>
        <CardTitle>Delete my account</CardTitle>
        <CardDescription>
          Permanently deletes your account and everything in your personal vault — finance, health,
          plans and the rest — and signs you out everywhere. This can&apos;t be undone, and nobody
          (not even an admin) can recover it afterwards.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <ul className="text-muted-foreground list-disc space-y-1 pl-5 text-sm">
          <li>Spaces where you&apos;re the only member are deleted with your account.</li>
          <li>
            If you&apos;re the only owner of a space other people use, first make someone else an
            owner or delete that space in{" "}
            <Link href="/spaces" className="text-primary underline underline-offset-4">
              Spaces
            </Link>
            .
          </li>
          {profile.role === "admin" && (
            <li>As an admin, you can only do this while another active admin exists.</li>
          )}
        </ul>
        <DeleteAccountForm username={profile.username} />
      </CardContent>
    </Card>
  );
}
