"use client";

import { useActionState, useRef } from "react";
import { changePassphraseAction } from "@/modules/core/session/vault-settings-actions";
import type { ActionState } from "@/modules/core/action/types";
import { useActionSuccess } from "@/lib/use-action-success";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { PassphraseInput } from "@/components/ui/passphrase-input";

const initialState: ActionState = {};

export function ChangePassphraseForm() {
  const [state, formAction, isPending] = useActionState(changePassphraseAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  useActionSuccess(state, () => formRef.current?.reset());

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-4">
      <FormField
        label="Current passphrase"
        htmlFor="currentPassphrase"
        error={state.fieldErrors?.currentPassphrase?.[0]}
      >
        <PassphraseInput name="currentPassphrase" autoComplete="current-password" required />
      </FormField>
      <FormField
        label="New passphrase"
        htmlFor="newPassphrase"
        hint="At least 8 characters."
        error={state.fieldErrors?.newPassphrase?.[0]}
      >
        <PassphraseInput name="newPassphrase" autoComplete="new-password" required minLength={8} />
      </FormField>
      <FormField
        label="Confirm new passphrase"
        htmlFor="confirmNewPassphrase"
        error={state.fieldErrors?.confirmNewPassphrase?.[0]}
      >
        <PassphraseInput
          name="confirmNewPassphrase"
          autoComplete="new-password"
          required
          minLength={8}
        />
      </FormField>
      {state.error && !state.fieldErrors && (
        <p role="alert" className="text-destructive text-sm">
          {state.error}
        </p>
      )}
      {state.ok && (
        <p role="status" className="text-sm">
          Passphrase changed. Use the new one next time you unlock.
        </p>
      )}
      <Button type="submit" disabled={isPending} className="self-start">
        {isPending ? "Changing…" : "Change passphrase"}
      </Button>
    </form>
  );
}
