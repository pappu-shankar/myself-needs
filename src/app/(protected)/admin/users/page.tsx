import type { Metadata } from "next";
import { requireAdmin } from "@/modules/core/session/guard";
import { listUsersForAdmin } from "@/modules/core/auth/queries";
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
import { UserActions } from "./user-actions";

export const metadata: Metadata = { title: "Users — Admin — Personal Life OS" };
export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const scope = await requireAdmin();
  const users = listUsersForAdmin();

  return (
    <>
      <PageHeader
        title="Users"
        description="Admins can manage accounts but cannot see or open any user's data — each vault is encrypted with that user's own password."
      />
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>User</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Created</TableHead>
            <TableHead>Last login</TableHead>
            <TableHead>Presence</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((u) => (
            <TableRow key={u.id}>
              <TableCell>
                <div className="font-medium">{u.displayName ?? u.username}</div>
                {u.displayName && <div className="text-muted-foreground text-xs">{u.username}</div>}
                {u.id === scope.userId && <div className="text-muted-foreground text-xs">You</div>}
              </TableCell>
              <TableCell>
                <Badge variant={u.role === "admin" ? "default" : "secondary"}>{u.role}</Badge>
              </TableCell>
              <TableCell>
                <Badge variant={u.status === "active" ? "outline" : "destructive"}>
                  {u.status}
                </Badge>
              </TableCell>
              <TableCell className="tabular-nums">{formatWhen(u.createdAt)}</TableCell>
              <TableCell className="tabular-nums">{formatWhen(u.lastLoginAt)}</TableCell>
              <TableCell>
                <div className="flex flex-col items-start gap-1">
                  {u.online ? (
                    <Badge variant="secondary">
                      Online · {u.liveSessions} {u.liveSessions === 1 ? "session" : "sessions"}
                    </Badge>
                  ) : (
                    <span className="text-muted-foreground text-xs">Offline</span>
                  )}
                  {u.lockedUntil && (
                    <span className="text-destructive text-xs tabular-nums">
                      Locked until {formatWhen(u.lockedUntil)}
                    </span>
                  )}
                </div>
              </TableCell>
              <TableCell>
                <UserActions
                  userId={u.id}
                  username={u.username}
                  role={u.role}
                  status={u.status}
                  isSelf={u.id === scope.userId}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </>
  );
}
