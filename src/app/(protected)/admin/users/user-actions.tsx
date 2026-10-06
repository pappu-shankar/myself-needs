"use client";

import { useActionState, useState } from "react";
import {
  deleteUserAction,
  setUserRoleAction,
  setUserStatusAction,
} from "@/modules/core/auth/admin-actions";
import type { ActionState } from "@/modules/core/action/types";
import { useActionSuccess } from "@/lib/use-action-success";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const initial: ActionState = {};

interface Props {
  userId: string;
  username: string;
  role: "admin" | "member";
  status: "active" | "disabled";
  isSelf: boolean;
}

/** Inline error under the row buttons. */
function ErrorLine({ state }: { state: { error?: string } }) {
  if (!state.error) return null;
  return (
    <p role="alert" className="text-destructive text-xs">
      {state.error}
    </p>
  );
}

export function UserActions({ userId, username, role, status, isSelf }: Props) {
  const [statusState, statusAction, statusPending] = useActionState(setUserStatusAction, initial);
  const [roleState, roleAction, rolePending] = useActionState(setUserRoleAction, initial);
  const nextStatus = status === "active" ? "disabled" : "active";
  const nextRole = role === "admin" ? "member" : "admin";

  return (
    <div className="flex flex-col items-start gap-1">
      <div className="flex flex-wrap gap-1.5">
        <form action={statusAction}>
          <input type="hidden" name="userId" value={userId} />
          <input type="hidden" name="status" value={nextStatus} />
          <Button
            type="submit"
            size="sm"
            variant="outline"
            disabled={statusPending || (isSelf && status === "active")}
            aria-label={`${status === "active" ? "Disable" : "Enable"} ${username}`}
          >
            {status === "active" ? "Disable" : "Enable"}
          </Button>
        </form>
        <form action={roleAction}>
          <input type="hidden" name="userId" value={userId} />
          <input type="hidden" name="role" value={nextRole} />
          <Button
            type="submit"
            size="sm"
            variant="outline"
            disabled={rolePending || (isSelf && role === "admin")}
            aria-label={`${role === "admin" ? "Demote" : "Promote"} ${username}`}
          >
            {role === "admin" ? "Demote" : "Promote"}
          </Button>
        </form>
        <DeleteUserDialog userId={userId} username={username} disabled={isSelf} />
      </div>
      <ErrorLine state={statusState} />
      <ErrorLine state={roleState} />
    </div>
  );
}

function DeleteUserDialog({
  userId,
  username,
  disabled,
}: {
  userId: string;
  username: string;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(deleteUserAction, initial);
  const [typed, setTyped] = useState("");
  useActionSuccess(state, () => setOpen(false));

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setTyped("");
      }}
    >
      <DialogTrigger
        render={
          <Button
            size="sm"
            variant="destructive"
            disabled={disabled}
            aria-label={`Delete ${username}`}
          />
        }
      >
        Delete
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete {username}?</DialogTitle>
          <DialogDescription>
            This permanently erases the account, its encrypted vault and its files, and signs them
            out everywhere. It cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="userId" value={userId} />
          <FormField
            label={`Type "${username}" to confirm`}
            htmlFor={`confirm-${userId}`}
            error={state.fieldErrors?.confirmUsername?.[0]}
          >
            <Input
              name="confirmUsername"
              autoComplete="off"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
            />
          </FormField>
          {state.error && !state.fieldErrors && (
            <p role="alert" className="text-destructive text-sm">
              {state.error}
            </p>
          )}
          <DialogFooter>
            <Button type="submit" variant="destructive" disabled={pending || typed !== username}>
              {pending ? "Deleting…" : "Delete account"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
