"use client";

import { useActionState, useState } from "react";
import { createInviteAction } from "@/modules/core/auth/admin-actions";
import type { ActionState } from "@/modules/core/action/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";

interface InviteResult {
  token: string;
  inviteId: string;
  expiresAt: number;
}

const initial: ActionState<InviteResult> = {};

export function InviteForm() {
  const [state, formAction, pending] = useActionState(createInviteAction, initial);
  const [copied, setCopied] = useState(false);
  const [dismissed, setDismissed] = useState<string | null>(null);

  const result = state.ok && state.data && state.data.inviteId !== dismissed ? state.data : null;

  return (
    <div className="flex flex-col gap-4">
      <form action={formAction} className="grid max-w-xl grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField
          label="Note (optional)"
          htmlFor="invite-note"
          hint="Who is this for?"
          error={state.fieldErrors?.note?.[0]}
          className="sm:col-span-2"
        >
          <Input name="note" maxLength={200} autoComplete="off" />
        </FormField>
        <FormField
          label="Expires after (hours)"
          htmlFor="invite-ttl"
          hint="1 to 336. Default 72."
          error={state.fieldErrors?.ttlHours?.[0]}
        >
          <Input
            name="ttlHours"
            type="number"
            min={1}
            max={336}
            inputMode="numeric"
            placeholder="72"
          />
        </FormField>
        {state.error && !state.fieldErrors && (
          <p role="alert" className="text-destructive text-sm sm:col-span-2">
            {state.error}
          </p>
        )}
        <Button type="submit" disabled={pending} className="self-start sm:col-span-2">
          {pending ? "Creating…" : "Create invite link"}
        </Button>
      </form>

      {result && (
        <InviteReveal
          result={result}
          copied={copied}
          setCopied={setCopied}
          onDone={() => {
            setDismissed(result.inviteId);
            setCopied(false);
          }}
        />
      )}
    </div>
  );
}

function InviteReveal({
  result,
  copied,
  setCopied,
  onDone,
}: {
  result: InviteResult;
  copied: boolean;
  setCopied: (v: boolean) => void;
  onDone: () => void;
}) {
  const link = `${window.location.origin}/invite#${result.token}`;
  return (
    <div role="status" className="flex max-w-xl flex-col gap-3 rounded-xl border p-4">
      <p className="text-sm font-medium">Invite link created</p>
      <p className="text-sm">
        Copy it now and send it to the person. <strong>It won&apos;t be shown again</strong> — if
        you lose it, revoke this invite and create another.
      </p>
      <div className="bg-muted rounded-lg border p-3 font-mono text-xs break-all select-all">
        {link}
      </div>
      <p className="text-muted-foreground text-xs tabular-nums">
        Expires {new Date(result.expiresAt).toLocaleString("en-IN")}
      </p>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={async () => {
            await navigator.clipboard.writeText(link);
            setCopied(true);
          }}
        >
          {copied ? "Copied" : "Copy link"}
        </Button>
        <Button type="button" variant="ghost" onClick={onDone}>
          Done
        </Button>
      </div>
    </div>
  );
}
