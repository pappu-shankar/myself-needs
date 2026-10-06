"use client";

import { useActionState } from "react";
import { revokeInviteAction } from "@/modules/core/auth/admin-actions";
import type { ActionState } from "@/modules/core/action/types";
import { Button } from "@/components/ui/button";

const initial: ActionState = {};

export function RevokeButton({ inviteId, label }: { inviteId: string; label: string }) {
  const [state, formAction, pending] = useActionState(revokeInviteAction, initial);
  return (
    <form action={formAction} className="flex flex-col items-start gap-1">
      <input type="hidden" name="inviteId" value={inviteId} />
      <Button
        type="submit"
        size="sm"
        variant="outline"
        disabled={pending}
        aria-label={`Revoke invite ${label}`}
      >
        Revoke
      </Button>
      {state.error && (
        <p role="alert" className="text-destructive text-xs">
          {state.error}
        </p>
      )}
    </form>
  );
}
