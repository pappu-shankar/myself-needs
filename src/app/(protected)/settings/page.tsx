import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getMyProfile } from "@/modules/core/auth/queries";
import { requireUser } from "@/modules/core/session/guard";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AvatarUploader } from "./avatar-uploader";
import { formatWhen } from "./format-when";
import { ProfileForm } from "./profile-form";

export const metadata: Metadata = {
  title: "Profile — Settings — Personal Life OS",
};

export default async function ProfileSettingsPage() {
  const scope = await requireUser();
  const profile = getMyProfile(scope);
  if (!profile) redirect("/login");

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
          <CardDescription>
            Signed in as <span className="text-foreground font-medium">{profile.username}</span>.
            Usernames can&apos;t be changed.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-muted-foreground">Role</dt>
            <dd>
              <Badge variant={profile.role === "admin" ? "default" : "secondary"}>
                {profile.role === "admin" ? "Admin" : "Member"}
              </Badge>
            </dd>
            <dt className="text-muted-foreground">Member since</dt>
            <dd>{formatWhen(profile.createdAt)}</dd>
            {profile.lastLoginAt && (
              <>
                <dt className="text-muted-foreground">Last sign-in</dt>
                <dd>{formatWhen(profile.lastLoginAt)}</dd>
              </>
            )}
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Picture</CardTitle>
          <CardDescription>A WebP or JPEG up to 256 × 256 and 200 KB.</CardDescription>
        </CardHeader>
        <CardContent>
          <AvatarUploader
            user={{
              id: profile.id,
              username: profile.username,
              displayName: profile.displayName,
              color: profile.color,
              hasAvatar: profile.hasAvatar,
              avatarVersion: profile.avatarVersion,
            }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>How you appear in the app and in shared spaces.</CardDescription>
        </CardHeader>
        <CardContent>
          <ProfileForm displayName={profile.displayName} color={profile.color} />
        </CardContent>
      </Card>
    </div>
  );
}
