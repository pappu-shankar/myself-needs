import type { Metadata } from "next";
import { requireAdmin } from "@/modules/core/session/guard";
import { listInvitesForAdmin } from "@/modules/core/auth/queries";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatWhen } from "../format";
import { InviteForm } from "./invite-form";
import { RevokeButton } from "./revoke-button";

export const metadata: Metadata = { title: "Invites — Admin — Personal Life OS" };
export const dynamic = "force-dynamic";

export default async function AdminInvitesPage() {
  await requireAdmin();
  const invites = listInvitesForAdmin();

  return (
    <>
      <PageHeader
        title="Invites"
        description="Invite links are single-use and expire. The link is shown once, when you create it."
      />
      <InviteForm />
      <h2 className="mt-8 mb-3 text-lg font-semibold">All invites</h2>
      {invites.length === 0 ? (
        <p className="text-muted-foreground text-sm">No invites yet.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Note</TableHead>
              <TableHead>State</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Expires</TableHead>
              <TableHead>Used</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {invites.map((i) => (
              <TableRow key={i.id}>
                <TableCell>
                  {i.note ?? <span className="text-muted-foreground">No note</span>}
                </TableCell>
                <TableCell>
                  <Badge variant={i.state === "pending" ? "secondary" : "outline"}>{i.state}</Badge>
                </TableCell>
                <TableCell className="tabular-nums">{formatWhen(i.createdAt)}</TableCell>
                <TableCell className="tabular-nums">{formatWhen(i.expiresAt)}</TableCell>
                <TableCell className="tabular-nums">{formatWhen(i.usedAt)}</TableCell>
                <TableCell>
                  {i.state === "pending" && (
                    <RevokeButton inviteId={i.id} label={i.note ?? formatWhen(i.createdAt)} />
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </>
  );
}
