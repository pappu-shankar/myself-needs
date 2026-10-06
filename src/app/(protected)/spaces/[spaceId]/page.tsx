import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { listMySpaces } from "@/modules/core/auth/queries";
import { SPACE_MODULES } from "@/modules/core/auth/spaces-store";
import { listSpaceMembers } from "@/modules/core/spaces/spaces-service";
import { requireUser } from "@/modules/core/session/guard";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { formatWhen } from "../../settings/format-when";
import { OpenSpaceButton } from "../open-space-button";
import { moduleList, ROLE_DESCRIPTIONS, ROLE_LABELS } from "../space-labels";
import { MemberList, type MemberRow } from "./member-list";
import {
  DeleteSpaceForm,
  InviteMemberForm,
  LeaveSpaceButton,
  RenameSpaceForm,
  SpaceModulesForm,
} from "./space-forms";

export const metadata: Metadata = {
  title: "Space — Personal Life OS",
};

export default async function SpaceDetailPage({
  params,
}: {
  params: Promise<{ spaceId: string }>;
}) {
  const scope = await requireUser();
  const { spaceId } = await params;
  const space = listMySpaces(scope).find((s) => s.id === spaceId);
  if (!space) notFound();

  const isOwner = space.role === "owner";
  const members: MemberRow[] = listSpaceMembers(scope, space.id).map((m) => ({
    userId: m.userId,
    username: m.username,
    displayName: m.displayName,
    role: m.role,
    addedAt: formatWhen(m.addedAt),
    isMe: m.userId === scope.userId,
  }));

  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader
        title={space.name}
        description={`Shared: ${moduleList(space.modules)}. ${ROLE_DESCRIPTIONS[space.role]}.`}
        actions={<OpenSpaceButton spaceId={space.id} name={space.name} active={space.active} />}
      />
      <p className="text-muted-foreground -mt-4 text-sm">
        <Link href="/spaces" className="text-primary underline-offset-4 hover:underline">
          All spaces
        </Link>
        {" · "}
        <span>You&apos;re {ROLE_LABELS[space.role].toLowerCase()}</span>
        {space.active && (
          <>
            {" "}
            <Badge>Open now</Badge>
          </>
        )}
      </p>

      <Card>
        <CardHeader>
          <CardTitle>
            <h2>Members ({members.length})</h2>
          </CardTitle>
          <CardDescription>
            Owners manage the space, editors can add and change records, viewers can only look.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <MemberList
            spaceId={space.id}
            spaceName={space.name}
            members={members}
            canManage={isOwner}
          />
        </CardContent>
      </Card>

      {isOwner && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>
                <h2>Add a person</h2>
              </CardTitle>
              <CardDescription>
                The space&apos;s key is sealed to their account, so they don&apos;t need to be
                online. Removing someone later re-keys the space.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <InviteMemberForm spaceId={space.id} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>
                <h2>Modules</h2>
              </CardTitle>
              <CardDescription>
                Only these sections show in the sidebar while this space is open. Hiding a module
                doesn&apos;t delete its records.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <SpaceModulesForm
                spaceId={space.id}
                modules={SPACE_MODULES}
                enabled={space.modules}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>
                <h2>Name</h2>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <RenameSpaceForm spaceId={space.id} name={space.name} />
            </CardContent>
          </Card>
        </>
      )}

      <Card className="border-destructive/40 border">
        <CardHeader>
          <CardTitle>
            <h2>Danger zone</h2>
          </CardTitle>
          <CardDescription>
            {isOwner
              ? "Leaving keeps the space for everyone else (make sure another owner remains). Deleting removes the space and all its records for every member, permanently."
              : `Leaving removes your access to ${space.name}; your role is ${ROLE_LABELS[space.role].toLowerCase()}.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <LeaveSpaceButton spaceId={space.id} name={space.name} />
          {isOwner && <DeleteSpaceForm spaceId={space.id} name={space.name} />}
        </CardContent>
      </Card>
    </div>
  );
}
