"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { removeMemberAction, setMemberRoleAction } from "@/modules/core/spaces/actions";
import type { SpaceRole } from "@/modules/core/auth/spaces-store";
import type { ActionState } from "@/modules/core/action/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ROLE_LABELS } from "../space-labels";

export interface MemberRow {
  userId: string;
  username: string;
  displayName: string | null;
  role: SpaceRole;
  addedAt: string;
  isMe: boolean;
}

const ROLES: SpaceRole[] = ["owner", "editor", "viewer"];
const initialState: ActionState = {};

const selectClass = "border-input bg-background h-8 rounded-md border px-2 text-sm";

function RoleForm({ spaceId, member }: { spaceId: string; member: MemberRow }) {
  const [state, formAction, isPending] = useActionState(setMemberRoleAction, initialState);
  const selectId = `role-${member.userId}`;
  return (
    <form action={formAction} className="flex flex-col gap-1">
      <input type="hidden" name="spaceId" value={spaceId} />
      <input type="hidden" name="userId" value={member.userId} />
      <div className="flex items-center gap-2">
        <label htmlFor={selectId} className="sr-only">
          Role for {member.displayName ?? member.username}
        </label>
        <select id={selectId} name="role" defaultValue={member.role} className={selectClass}>
          {ROLES.map((role) => (
            <option key={role} value={role}>
              {ROLE_LABELS[role]}
            </option>
          ))}
        </select>
        <Button type="submit" size="sm" variant="outline" disabled={isPending}>
          {isPending ? "Saving…" : "Change role"}
        </Button>
      </div>
      {state.error && (
        <p role="alert" className="text-destructive text-xs">
          {state.error}
        </p>
      )}
      {state.ok && (
        <p role="status" className="text-xs">
          Role updated.
        </p>
      )}
    </form>
  );
}

function RemoveMemberButton({
  spaceId,
  spaceName,
  member,
}: {
  spaceId: string;
  spaceName: string;
  member: MemberRow;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const name = member.displayName ?? member.username;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" variant="destructive" />}>
        Remove<span className="sr-only"> {name}</span>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Remove {name} from {spaceName}?
          </DialogTitle>
          <DialogDescription>
            They lose access straight away. The space is then re-keyed: a new encryption key is made
            and sealed for the remaining members only, so a copy of the old key won&apos;t open it
            any more. Records they added stay in the space.
          </DialogDescription>
        </DialogHeader>
        {error && (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        )}
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
          <Button
            type="button"
            variant="destructive"
            disabled={isPending}
            onClick={() =>
              startTransition(async () => {
                const formData = new FormData();
                formData.set("spaceId", spaceId);
                formData.set("userId", member.userId);
                const result = await removeMemberAction({}, formData);
                if (result.error) {
                  setError(result.error);
                  return;
                }
                setOpen(false);
                router.refresh();
              })
            }
          >
            {isPending ? "Removing…" : "Remove"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function MemberList({
  spaceId,
  spaceName,
  members,
  canManage,
}: {
  spaceId: string;
  spaceName: string;
  members: MemberRow[];
  canManage: boolean;
}) {
  return (
    <ul className="divide-y">
      {members.map((member) => (
        <li
          key={member.userId}
          className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
              <span className="break-words">{member.displayName ?? member.username}</span>
              {member.isMe && <Badge variant="secondary">You</Badge>}
              {(!canManage || member.isMe) && (
                <Badge variant="outline">{ROLE_LABELS[member.role]}</Badge>
              )}
            </p>
            <p className="text-muted-foreground text-xs">
              @{member.username} · added {member.addedAt}
            </p>
          </div>
          {canManage && !member.isMe && (
            <div className="flex flex-wrap items-start gap-2">
              <RoleForm spaceId={spaceId} member={member} />
              <RemoveMemberButton spaceId={spaceId} spaceName={spaceName} member={member} />
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
