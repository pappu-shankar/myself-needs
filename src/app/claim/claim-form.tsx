"use client";

import { useActionState, useState } from "react";
import { claimAction } from "@/modules/core/auth/actions";
import type { AuthFormState } from "@/modules/core/auth/types";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { PassphraseInput } from "@/components/ui/passphrase-input";
import { FormError } from "@/app/(auth)/_components/form-error";
import { NewPasswordFields } from "@/app/(auth)/_components/new-password-fields";

const initialState: AuthFormState = {};

/**
 * Turns the pre-multi-user vault into the first (admin) account: the current
 * passphrase proves ownership, the username is new. Changing the password is
 * optional — by default the passphrase becomes the account password.
 */
export function ClaimForm() {
  const [state, formAction, pending] = useActionState(claimAction, initialState);
  const [changePassword, setChangePassword] = useState(false);

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <FormError message={state.error} />
      <FormField
        label="Choose a username"
        htmlFor="username"
        hint="3–32 characters: lowercase letters, digits, dots, dashes or underscores."
      >
        <Input
          name="username"
          required
          autoFocus
          autoComplete="username"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          minLength={3}
          maxLength={32}
          defaultValue={state.values?.username}
        />
      </FormField>
      <FormField
        label="Current passphrase"
        htmlFor="passphrase"
        hint="The passphrase you've been using to unlock this app."
      >
        <PassphraseInput
          name="passphrase"
          required
          maxLength={1024}
          autoComplete="current-password"
        />
      </FormField>

      <div className="flex items-start gap-2">
        <input
          type="checkbox"
          id="changePassword"
          className="mt-0.5 size-4 shrink-0"
          checked={changePassword}
          onChange={(e) => setChangePassword(e.target.checked)}
        />
        <label htmlFor="changePassword" className="text-sm font-medium">
          Also choose a new password{" "}
          <span className="text-muted-foreground font-normal">
            (otherwise your passphrase stays your password)
          </span>
        </label>
      </div>
      {changePassword && <NewPasswordFields name="newPassword" label="New password" />}

      <Button type="submit" variant="default" disabled={pending}>
        {pending ? "Claiming…" : "Claim my data"}
      </Button>
    </form>
  );
}
