"use client";

import { useActionState } from "react";
import { deleteMyAccountAction } from "@/modules/core/auth/account-actions";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { PassphraseInput } from "@/components/ui/passphrase-input";

export function DeleteAccountForm({ username }: { username: string }) {
  const [state, formAction, isPending] = useActionState(deleteMyAccountAction, {});

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <FormField
        label={`Type your username (${username}) to confirm`}
        htmlFor="confirmUsername"
        error={state.fieldErrors?.confirmUsername?.[0]}
      >
        <Input
          name="confirmUsername"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          required
        />
      </FormField>
      <FormField
        label="Your password"
        htmlFor="deletePassword"
        error={state.fieldErrors?.password?.[0]}
      >
        <PassphraseInput name="password" autoComplete="current-password" required />
      </FormField>
      {state.error && !state.fieldErrors && (
        <p role="alert" className="text-destructive text-sm">
          {state.error}
        </p>
      )}
      <Button type="submit" variant="destructive" disabled={isPending} className="self-start">
        {isPending ? "Deleting…" : "Delete my account and data"}
      </Button>
    </form>
  );
}
