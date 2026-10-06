"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { loginAction } from "@/modules/core/auth/actions";
import type { AuthFormState } from "@/modules/core/auth/types";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { PassphraseInput } from "@/components/ui/passphrase-input";
import { cn } from "@/lib/utils";
import { FormError } from "@/app/(auth)/_components/form-error";

/** What the profile picker needs per account (a subset of `PickerProfile`). */
export interface LoginProfile {
  id: string;
  username: string;
  displayName: string | null;
  color: string | null;
}

const initialState: AuthFormState = {};

/** Black or white initial, whichever reads better on the chosen `#rrggbb`. */
function textOn(hex: string): string {
  const n = Number.parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.179 ? "#000000" : "#ffffff";
}

function ProfileInitial({ name, color }: { name: string; color: string | null }) {
  const valid = color && /^#[0-9a-fA-F]{6}$/.test(color) ? color : null;
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex size-12 items-center justify-center rounded-full text-lg font-semibold",
        !valid && "bg-primary text-primary-foreground",
      )}
      style={valid ? { backgroundColor: valid, color: textOn(valid) } : undefined}
    >
      {[...name.trim()][0]?.toUpperCase() ?? "?"}
    </span>
  );
}

function focusPassword() {
  document.getElementById("password")?.focus();
}

export function LoginForm({ profiles }: { profiles: LoginProfile[] }) {
  const [state, formAction, pending] = useActionState(loginAction, initialState);
  const [username, setUsername] = useState(state.values?.username ?? "");
  const picker = profiles.length > 0;

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <FormError message={state.error} />

      {picker ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-medium">Who&apos;s signing in?</legend>
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {profiles.map((p) => {
              const name = p.displayName?.trim() || p.username;
              const selected = username === p.username;
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    aria-pressed={selected}
                    onClick={() => {
                      setUsername(p.username);
                      focusPassword();
                    }}
                    className={cn(
                      "focus-visible:ring-ring/50 hover:bg-muted flex w-full flex-col items-center gap-2 rounded-lg border p-3 text-sm transition-colors outline-none focus-visible:ring-3",
                      selected && "border-primary bg-muted",
                    )}
                  >
                    <ProfileInitial name={name} color={p.color} />
                    <span className="w-full truncate font-medium">{name}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          <input type="hidden" name="username" value={username} autoComplete="username" />
        </fieldset>
      ) : (
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
      )}

      <FormField label="Password" htmlFor="password">
        <PassphraseInput name="password" required maxLength={256} autoComplete="current-password" />
      </FormField>

      <Button type="submit" variant="default" disabled={pending || (picker && !username)}>
        {pending ? "Signing in…" : "Sign in"}
      </Button>

      <Link
        href="/login/recover"
        className="text-muted-foreground hover:text-foreground self-center text-sm underline-offset-4 hover:underline"
      >
        Forgot password? Use your recovery key
      </Link>
    </form>
  );
}
