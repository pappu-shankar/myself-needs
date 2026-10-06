"use client";

import { useActionState, useRef } from "react";
import { changePasswordAction } from "@/modules/core/auth/account-actions";
import type { ActionState } from "@/modules/core/action/types";
import { useActionSuccess } from "@/lib/use-action-success";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { PassphraseInput } from "@/components/ui/passphrase-input";

const initialState: ActionState = {};

export function ChangePasswordForm() {
  const [state, formAction, isPending] = useActionState(changePasswordAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  useActionSuccess(state, () => formRef.current?.reset());

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-4">
      <FormField
        label="Current password"
        htmlFor="currentPassword"
        error={state.fieldErrors?.currentPassword?.[0]}
      >
        <PassphraseInput name="currentPassword" autoComplete="current-password" required />
      </FormField>
      <FormField
        label="New password"
        htmlFor="newPassword"
        hint="At least 12 characters, and not a commonly used password."
        error={state.fieldErrors?.newPassword?.[0]}
      >
        <PassphraseInput name="newPassword" autoComplete="new-password" required minLength={12} />
      </FormField>
      <FormField
        label="Confirm new password"
        htmlFor="confirmNewPassword"
        error={state.fieldErrors?.confirmNewPassword?.[0]}
      >
        <PassphraseInput
          name="confirmNewPassword"
          autoComplete="new-password"
          required
          minLength={12}
        />
      </FormField>
      {state.error && !state.fieldErrors && (
        <p role="alert" className="text-destructive text-sm">
          {state.error}
        </p>
      )}
      {state.ok && (
        <p role="status" className="text-sm">
          Password changed. Your other devices have been signed out; use the new password next time
          you sign in.
        </p>
      )}
      <Button type="submit" disabled={isPending} className="self-start">
        {isPending ? "Changing…" : "Change password"}
      </Button>
    </form>
  );
}
