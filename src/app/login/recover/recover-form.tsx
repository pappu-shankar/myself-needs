"use client";

import { useActionState, useState } from "react";
import { recoverAction } from "@/modules/core/auth/actions";
import type { AuthFormState } from "@/modules/core/auth/types";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { FormError } from "@/app/(auth)/_components/form-error";
import { NewPasswordFields } from "@/app/(auth)/_components/new-password-fields";

const initialState: AuthFormState = {};

/**
 * Two steps on one action: (1) username + recovery key → `{ verified }`;
 * (2) the same two (kept here, sent as hidden fields) + a new password → the
 * password is reset, the user is signed in and redirected.
 */
export function RecoverForm() {
  const [state, formAction, pending] = useActionState(recoverAction, initialState);
  const [username, setUsername] = useState("");
  const [recoveryKey, setRecoveryKey] = useState("");

  if (state.verified) {
    return (
      <form action={formAction} className="flex flex-col gap-5">
        <input type="hidden" name="username" value={username} />
        <input type="hidden" name="recoveryKey" value={recoveryKey} />
        <FormError message={state.error} />
        <p className="text-muted-foreground text-sm">
          Recovery key accepted for <span className="text-foreground font-medium">{username}</span>.
          Choose a new password to finish signing in. Your recovery key stays the same.
        </p>
        <NewPasswordFields name="newPassword" label="New password" autoFocus />
        <Button type="submit" variant="default" disabled={pending}>
          {pending ? "Saving…" : "Set password & sign in"}
        </Button>
      </form>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <FormError message={state.error} />
      <FormField label="Username" htmlFor="username">
        <Input
          name="username"
          required
          autoFocus
          autoComplete="username"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          maxLength={64}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
      </FormField>
      <FormField
        label="Recovery key"
        htmlFor="recoveryKey"
        hint="The key you saved when your account was created."
      >
        <Input
          name="recoveryKey"
          required
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          maxLength={128}
          placeholder="xxxxxxxx-xxxxxxxx-xxxxxxxx-xxxxxxxx"
          className="font-mono"
          value={recoveryKey}
          onChange={(e) => setRecoveryKey(e.target.value)}
        />
      </FormField>
      <Button type="submit" variant="default" disabled={pending}>
        {pending ? "Checking…" : "Verify recovery key"}
      </Button>
    </form>
  );
}
