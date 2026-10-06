"use client";

import { useActionState, useEffect, useState, useSyncExternalStore } from "react";
import { acceptInviteAction } from "@/modules/core/auth/actions";
import type { AuthFormState } from "@/modules/core/auth/types";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { FormError } from "@/app/(auth)/_components/form-error";
import { NewPasswordFields } from "@/app/(auth)/_components/new-password-fields";
import { RecoveryKeyReveal } from "@/app/(auth)/_components/recovery-key-reveal";

const initialState: AuthFormState = {};
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/** Accepts a bare code, `#code`, `#token=code` or the whole invite link. */
export function extractInviteToken(raw: string): string | null {
  const afterHash = raw.includes("#") ? raw.slice(raw.lastIndexOf("#") + 1) : raw;
  const candidate = afterHash.trim().replace(/^token=/, "");
  return TOKEN_PATTERN.test(candidate) ? candidate : null;
}

function subscribeToHash(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

type Preview =
  | { token: string; status: "valid"; expiresAt: number | null }
  | { token: string; status: "invalid" }
  | { token: string; status: "unknown" };

function formatExpiry(ms: number): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(ms);
}

/**
 * Sign-up from an invite. The token comes from the link's `#fragment` (or a
 * pasted code), is checked for validity up front, then sent with the new
 * account's username and password. On success the user is already signed in
 * and sees their recovery key once.
 */
export function InviteForm({ pendingReveal = false }: { pendingReveal?: boolean }) {
  const [state, formAction, pending] = useActionState(acceptInviteAction, initialState);
  const hash = useSyncExternalStore(
    subscribeToHash,
    () => window.location.hash,
    () => "",
  );
  const [pasted, setPasted] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);

  const hashToken = extractInviteToken(hash);
  const token = hashToken ?? extractInviteToken(pasted);

  useEffect(() => {
    if (!token || pendingReveal) return;
    let cancelled = false;
    fetch("/invite/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<{ valid: boolean; expiresAt: number | null }>;
      })
      .then((data) => {
        if (cancelled) return;
        setPreview(
          data.valid
            ? { token, status: "valid", expiresAt: data.expiresAt }
            : { token, status: "invalid" },
        );
      })
      .catch(() => {
        if (!cancelled) setPreview({ token, status: "unknown" });
      });
    return () => {
      cancelled = true;
    };
  }, [token, pendingReveal]);

  if (state.recoveryKey || pendingReveal) {
    return <RecoveryKeyReveal recoveryKey={state.recoveryKey} />;
  }

  const current = preview && preview.token === token ? preview : null;
  const canSubmit = token !== null && current !== null && current.status !== "invalid";

  return (
    <div className="flex flex-col gap-5">
      {!hashToken && (
        <FormField
          label="Invite code"
          htmlFor="inviteCode"
          hint="Paste the invite link or code the admin sent you."
          error={
            pasted.trim() && !token ? "That doesn't look like an invite link or code." : undefined
          }
        >
          <Input
            name="inviteCode"
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            className="font-mono"
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
          />
        </FormField>
      )}

      {token && (
        <p
          role="status"
          className={
            current?.status === "invalid"
              ? "text-destructive text-sm"
              : "text-muted-foreground text-sm"
          }
        >
          {current === null
            ? "Checking your invite…"
            : current.status === "valid"
              ? current.expiresAt
                ? `Invite valid until ${formatExpiry(current.expiresAt)}.`
                : "Invite valid."
              : current.status === "invalid"
                ? "This invite has expired, was already used, or was revoked. Ask the admin for a new one."
                : "Couldn't check this invite right now — you can still try to create your account."}
        </p>
      )}

      {canSubmit && (
        <form action={formAction} className="flex flex-col gap-5">
          <input type="hidden" name="token" value={token} />
          <FormError message={state.error} />
          <FormField
            label="Username"
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
          <NewPasswordFields />
          <Button type="submit" variant="default" disabled={pending}>
            {pending ? "Creating account…" : "Create account"}
          </Button>
        </form>
      )}
    </div>
  );
}
