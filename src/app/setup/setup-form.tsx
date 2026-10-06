"use client";

import { useActionState } from "react";
import { setupAction } from "@/modules/core/auth/actions";
import type { AuthFormState } from "@/modules/core/auth/types";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { PassphraseInput } from "@/components/ui/passphrase-input";
import { FormError } from "@/app/(auth)/_components/form-error";
import { NewPasswordFields } from "@/app/(auth)/_components/new-password-fields";
import { RecoveryKeyReveal } from "@/app/(auth)/_components/recovery-key-reveal";

const initialState: AuthFormState = {};

/** Creates the first admin on a fresh install, then shows their recovery key once. */
export function SetupForm({ pendingReveal = false }: { pendingReveal?: boolean }) {
  const [state, formAction, pending] = useActionState(setupAction, initialState);

  if (state.recoveryKey || pendingReveal) {
    return <RecoveryKeyReveal recoveryKey={state.recoveryKey} />;
  }

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <FormError message={state.error} />
      <FormField
        label="Setup token"
        htmlFor="setupToken"
        hint="The value of APP_SETUP_TOKEN, or the one-time token printed in the server log."
      >
        <PassphraseInput
          name="setupToken"
          required
          autoFocus
          autoComplete="off"
          maxLength={256}
          className="font-mono"
        />
      </FormField>
      <FormField
        label="Username"
        htmlFor="username"
        hint="3–32 characters: lowercase letters, digits, dots, dashes or underscores."
      >
        <Input
          name="username"
          required
          autoComplete="username"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          minLength={3}
          maxLength={32}
          defaultValue={state.values?.username}
        />
      </FormField>
      <NewPasswordFields />
      <Button type="submit" variant="default" disabled={pending}>
        {pending ? "Creating account…" : "Create admin account"}
      </Button>
    </form>
  );
}
