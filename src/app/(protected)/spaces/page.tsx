import type { Metadata } from "next";
import Link from "next/link";
import { Users } from "lucide-react";
import { listMySpaces } from "@/modules/core/auth/queries";
import { SPACE_MODULES } from "@/modules/core/auth/spaces-store";
import { requireUser } from "@/modules/core/session/guard";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { CreateSpaceForm } from "./create-space-form";
import { OpenSpaceButton } from "./open-space-button";
import { moduleList, ROLE_LABELS } from "./space-labels";

export const metadata: Metadata = {
  title: "Spaces — Personal Life OS",
};

export default async function SpacesPage() {
  const scope = await requireUser();
  const spaces = listMySpaces(scope);

  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader
        title="Spaces"
        description="Shared vaults for things you track with other people — household finances, a house project. Your personal data is never shared."
      />

      <section aria-labelledby="my-spaces-heading" className="space-y-3">
        <h2 id="my-spaces-heading" className="text-lg font-semibold">
          Your spaces
        </h2>
        {spaces.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No spaces yet"
            description="Create one below, or ask someone to add you to theirs."
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {spaces.map((space) => (
              <li key={space.id}>
                <Card>
                  <CardHeader>
                    <CardTitle className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/spaces/${space.id}`}
                        className="hover:underline hover:underline-offset-4"
                      >
                        {space.name}
                      </Link>
                      <Badge variant="outline">{ROLE_LABELS[space.role]}</Badge>
                      {space.active && <Badge>Open now</Badge>}
                    </CardTitle>
                    <CardDescription>
                      {moduleList(space.modules)} · {space.memberCount}{" "}
                      {space.memberCount === 1 ? "member" : "members"}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-wrap items-start gap-2">
                    <OpenSpaceButton spaceId={space.id} name={space.name} active={space.active} />
                    <Link
                      href={`/spaces/${space.id}`}
                      className="text-primary inline-flex h-7 items-center px-2.5 text-[0.8rem] font-medium underline-offset-4 hover:underline"
                    >
                      {space.role === "owner" ? "Manage" : "Details"}
                      <span className="sr-only"> {space.name}</span>
                    </Link>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Card id="new-space" className="scroll-mt-4">
        <CardHeader>
          <CardTitle>
            <h2>New space</h2>
          </CardTitle>
          <CardDescription>
            A space is its own encrypted vault. You&apos;ll be its owner and can add people who
            already have an account here.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CreateSpaceForm modules={SPACE_MODULES} />
        </CardContent>
      </Card>
    </div>
  );
}
