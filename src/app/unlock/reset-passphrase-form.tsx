"use client";

import type { ResetPassphraseState } from "@/modules/core/session/actions";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { PassphraseInput } from "@/components/ui/passphrase-input";

export function ResetPassphraseForm({
  recoveryKey,
  state,
  formAction,
  isPending,
}: {
  recoveryKey: string;
  state: ResetPassphraseState;
  formAction: (formData: FormData) => void;
  isPending: boolean;
}) {
  return (
    <form action={formAction} className="flex flex-col gap-5">
      <input type="hidden" name="recoveryKey" value={recoveryKey} />

      <p className="text-muted-foreground text-sm">
        Recovery key verified. Choose a new passphrase to finish unlocking.
      </p>

      <FormField
        label="New passphrase"
        htmlFor="newPassphrase"
        hint="At least 8 characters. Your recovery key stays valid — no need to save a new one."
        error={state.error}
      >
        <PassphraseInput
          name="newPassphrase"
          autoFocus
          required
          minLength={8}
          autoComplete="new-password"
        />
      </FormField>

      <FormField label="Confirm new passphrase" htmlFor="confirmNewPassphrase">
        <PassphraseInput
          name="confirmNewPassphrase"
          required
          minLength={8}
          autoComplete="new-password"
        />
      </FormField>

      <Button type="submit" disabled={isPending} className="mt-1">
        {isPending ? "Saving…" : "Set passphrase & unlock"}
      </Button>
    </form>
  );
}
