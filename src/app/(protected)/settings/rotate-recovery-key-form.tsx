"use client";

import { useActionState, useState } from "react";
import { rotateRecoveryKeyAction } from "@/modules/core/session/vault-settings-actions";
import type { ActionState } from "@/modules/core/action/types";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { PassphraseInput } from "@/components/ui/passphrase-input";

const initialState: ActionState<string> = {};

export function RotateRecoveryKeyForm() {
  const [state, formAction, isPending] = useActionState(rotateRecoveryKeyAction, initialState);
  const [copied, setCopied] = useState(false);

  if (state.ok && state.data) {
    const recoveryKey = state.data;
    return (
      <div className="flex flex-col gap-4" role="status">
        <p className="text-sm">
          Your new recovery key is below. Save it in a password manager now — it won&apos;t be shown
          again, and the previous key no longer works. Older backups of <code>keyring.json</code>{" "}
          still open with the key they were made with.
        </p>
        <div className="bg-muted rounded-lg border p-3 text-center font-mono text-sm tracking-wide select-all">
          {recoveryKey}
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={async () => {
            await navigator.clipboard.writeText(recoveryKey);
            setCopied(true);
          }}
        >
          {copied ? "Copied" : "Copy to clipboard"}
        </Button>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <FormField
        label="Current passphrase"
        htmlFor="rotatePassphrase"
        error={state.fieldErrors?.passphrase?.[0]}
      >
        <PassphraseInput name="passphrase" autoComplete="current-password" required />
      </FormField>
      {state.error && !state.fieldErrors && (
        <p role="alert" className="text-destructive text-sm">
          {state.error}
        </p>
      )}
      <Button type="submit" disabled={isPending} className="self-start">
        {isPending ? "Generating…" : "Generate new recovery key"}
      </Button>
    </form>
  );
}
