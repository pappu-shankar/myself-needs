"use client";

import { useState } from "react";
import { FormField } from "@/components/ui/form-field";
import { PassphraseInput } from "@/components/ui/passphrase-input";

/** Mirrors the server policy (src/modules/core/auth/password-policy.ts). */
export const PASSWORD_MIN = 12;
export const PASSWORD_MAX = 256;

/** Length in code points, like the server check (emoji/CJK count once). */
function length(value: string): number {
  return [...value].length;
}

export function passwordHint(value: string): string {
  const n = length(value);
  if (n === 0) {
    return `At least ${PASSWORD_MIN} characters. A few unrelated words make a strong password that's easy to remember.`;
  }
  if (n < PASSWORD_MIN) {
    const left = PASSWORD_MIN - n;
    return `${left} more character${left === 1 ? "" : "s"} needed (at least ${PASSWORD_MIN}).`;
  }
  return "Long enough. Very common passwords are still rejected.";
}

/**
 * "Choose a password" + "Confirm password", with a live hint that follows the
 * password policy (≥ 12 characters). Controlled, so a server-side rejection
 * (e.g. "too common", "username taken") doesn't wipe what was typed.
 */
export function NewPasswordFields({
  name = "password",
  label = "Password",
  autoFocus = false,
}: {
  /** Form field name of the first input; the second is always `confirmPassword`. */
  name?: "password" | "newPassword";
  label?: string;
  autoFocus?: boolean;
}) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const mismatch = confirm.length > 0 && confirm !== password;

  return (
    <>
      <FormField label={label} htmlFor={name} hint={passwordHint(password)}>
        <PassphraseInput
          name={name}
          required
          autoFocus={autoFocus}
          minLength={PASSWORD_MIN}
          maxLength={PASSWORD_MAX}
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </FormField>
      <FormField
        label={`Confirm ${label.toLowerCase()}`}
        htmlFor="confirmPassword"
        hint={mismatch ? "Doesn't match yet." : undefined}
      >
        <PassphraseInput
          name="confirmPassword"
          required
          minLength={PASSWORD_MIN}
          maxLength={PASSWORD_MAX}
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
      </FormField>
    </>
  );
}
