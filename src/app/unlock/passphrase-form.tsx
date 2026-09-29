"use client";

import type { UnlockState } from "@/modules/core/session/actions";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { PassphraseInput } from "@/components/ui/passphrase-input";

export function PassphraseForm({
  isFirstRun,
  state,
  formAction,
  isPending,
  onForgotPassphrase,
}: {
  isFirstRun: boolean;
  state: UnlockState;
  formAction: (formData: FormData) => void;
  isPending: boolean;
  onForgotPassphrase: () => void;
}) {
  return (
    <form action={formAction} className="flex flex-col gap-5">
      <FormField
        label={isFirstRun ? "Create a passphrase" : "Passphrase"}
        htmlFor="passphrase"
        hint={
          isFirstRun
            ? "At least 8 characters. You'll get a one-time recovery key after this in case you forget it."
            : undefined
        }
        error={state.error}
      >
        <PassphraseInput
          name="passphrase"
          autoFocus
          required
          minLength={8}
          autoComplete={isFirstRun ? "new-password" : "current-password"}
        />
      </FormField>

      {isFirstRun && (
        <FormField label="Confirm passphrase" htmlFor="confirmPassphrase">
          <PassphraseInput
            name="confirmPassphrase"
            required
            minLength={8}
            autoComplete="new-password"
          />
        </FormField>
      )}

      <Button type="submit" disabled={isPending} className="mt-1">
        {isPending ? "Unlocking…" : isFirstRun ? "Create & unlock" : "Unlock"}
      </Button>

      {!isFirstRun && (
        <button
          type="button"
          onClick={onForgotPassphrase}
          className="text-muted-foreground text-sm underline-offset-4 hover:underline"
        >
          Forgot passphrase? Use your recovery key instead
        </button>
      )}
    </form>
  );
}
