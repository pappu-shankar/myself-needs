"use server";

/**
 * The only public Server Actions — they run WITHOUT a signed-in user, because
 * they are how a session starts (or ends). Everything else goes through
 * `defineFormAction` / `defineAction` / `defineAdminAction`.
 *
 * Every credential check lives in auth-service.ts; these wrappers parse the
 * form, start the session (cookie) and redirect.
 */

import { redirect } from "next/navigation";
import { DatabaseOpenError, VaultStateError } from "@/modules/core/errors";
import { logError } from "@/modules/core/log";
import type { RequestMeta } from "@/modules/core/session/session";
import { requireUserForAction } from "@/modules/core/session/guard";
import { getRequestMeta, getSession } from "@/modules/core/session/session";
import { endSession, endUserSessions } from "@/modules/core/session/session-registry";
import { recordAudit } from "./audit-store";
import {
  acceptInvite,
  claimLegacy,
  createFirstAdmin,
  SETUP_DONE,
  verifyLogin,
  verifyRecovery,
} from "./auth-service";
import { getInstallState } from "./install-state";
import type { Account } from "./accounts-store";
import { startSession, type StartSessionOptions } from "./session-start";
import { consumeSetupToken, verifySetupToken } from "./setup-token";
import type { AuthFormState } from "./types";

const MAX_FIELD = 1024;

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.slice(0, MAX_FIELD) : "";
}

function optionalField(formData: FormData, name: string): string | undefined {
  const value = field(formData, name);
  return value === "" ? undefined : value;
}

/** Starts the session; returns a user-safe error message instead of throwing. */
async function begin(
  account: Account,
  dekHex: string,
  meta: RequestMeta,
  options: StartSessionOptions,
): Promise<string | null> {
  try {
    await startSession(account, dekHex, meta, options);
    return null;
  } catch (err) {
    logError("auth:start-session", err);
    return err instanceof DatabaseOpenError || err instanceof VaultStateError
      ? err.message
      : "Couldn't sign you in. Please try again.";
  }
}

function echo(username: string): AuthFormState["values"] {
  return { username: username.slice(0, 64) };
}

export async function loginAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const username = field(formData, "username");
  const password = field(formData, "password");
  if (!username || !password) {
    return { error: "Enter your username and password.", values: echo(username) };
  }
  const meta = await getRequestMeta();
  const result = await verifyLogin(username, password, meta);
  if (!result.ok) return { error: result.error, values: echo(username) };
  const error = await begin(result.account, result.dekHex, meta, { via: "password" });
  if (error) return { error, values: echo(username) };
  redirect("/dashboard");
}

/** Without `newPassword`: verifies the key only and returns `{ verified: true }`.
 * With it: resets the password, signs in and redirects. */
export async function recoverAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const username = field(formData, "username");
  const recoveryKey = field(formData, "recoveryKey");
  if (!username || !recoveryKey) {
    return { error: "Enter your username and recovery key.", values: echo(username) };
  }
  const newPassword = optionalField(formData, "newPassword");
  const meta = await getRequestMeta();
  const result = await verifyRecovery(
    {
      username,
      recoveryKey,
      newPassword,
      confirmPassword: newPassword === undefined ? undefined : field(formData, "confirmPassword"),
    },
    meta,
  );
  if (!result.ok) {
    return { error: result.error, values: echo(username), verified: newPassword !== undefined };
  }
  if (!result.passwordChanged) return { verified: true, values: echo(username) };
  const error = await begin(result.account, result.dekHex, meta, { via: "recovery" });
  if (error) return { error, values: echo(username) };
  redirect("/dashboard");
}

/** On success the user is signed in and the state carries the recovery key to
 * show once; the page then calls `acknowledgeRecoveryKeyAction`. */
export async function acceptInviteAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const username = field(formData, "username");
  const meta = await getRequestMeta();
  const result = await acceptInvite(
    {
      token: field(formData, "token"),
      username,
      password: field(formData, "password"),
      confirmPassword: field(formData, "confirmPassword"),
    },
    meta,
  );
  if (!result.ok) return { error: result.error, values: echo(username) };
  const error = await begin(result.account, result.dekHex, meta, {
    via: "invite",
    recoveryKeyPending: true,
  });
  if (error) return { error };
  return { recoveryKey: result.recoveryKey };
}

export async function setupAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const username = field(formData, "username");
  if (getInstallState() !== "fresh-setup") return { error: SETUP_DONE };
  const meta = await getRequestMeta();
  if (!verifySetupToken(field(formData, "setupToken"))) {
    recordAudit({ event: "setup.rejected", ip: meta.ip });
    return {
      error:
        "That setup token isn't right. Use APP_SETUP_TOKEN, or the one-time token printed in the server log.",
      values: echo(username),
    };
  }
  const result = await createFirstAdmin(
    {
      username,
      password: field(formData, "password"),
      confirmPassword: field(formData, "confirmPassword"),
    },
    meta,
  );
  if (!result.ok) return { error: result.error, values: echo(username) };
  consumeSetupToken();
  const error = await begin(result.account, result.dekHex, meta, {
    via: "setup",
    recoveryKeyPending: true,
  });
  if (error) return { error };
  return { recoveryKey: result.recoveryKey };
}

/** Claims the pre-multi-user vault as the first admin (keeps the old
 * passphrase unless `newPassword` is given). */
export async function claimAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const username = field(formData, "username");
  const state = getInstallState();
  if (state !== "legacy-claim") {
    return { error: state === "ready" ? SETUP_DONE : "There's no existing vault to claim here." };
  }
  const newPassword = optionalField(formData, "newPassword");
  const meta = await getRequestMeta();
  const result = await claimLegacy(
    {
      username,
      passphrase: field(formData, "passphrase"),
      newPassword,
      confirmPassword: newPassword === undefined ? undefined : field(formData, "confirmPassword"),
    },
    meta,
  );
  if (!result.ok) return { error: result.error, values: echo(username) };
  const error = await begin(result.account, result.dekHex, meta, { via: "claim" });
  if (error) return { error, values: echo(username) };
  redirect("/dashboard");
}

/** Clears the reveal-pending flag once the user has saved their recovery key. */
export async function acknowledgeRecoveryKeyAction(): Promise<void> {
  const session = await getSession();
  session.recoveryKeyPending = false;
  await session.save();
  redirect("/dashboard");
}

/** Ends this browser's session only. */
export async function signOutAction(): Promise<void> {
  const session = await getSession();
  if (session.sid) {
    endSession(session.sid, "signed-out");
    if (session.uid) recordAudit({ event: "logout", userId: session.uid });
  }
  session.destroy();
  redirect("/login");
}

/** Ends every session of the signed-in user, on every device. */
export async function signOutEverywhereAction(): Promise<void> {
  const scope = await requireUserForAction();
  const ended = endUserSessions(scope.userId, { reason: "signed-out-everywhere" });
  recordAudit({
    event: "logout.everywhere",
    userId: scope.userId,
    detail: { count: ended.length },
  });
  const session = await getSession();
  session.destroy();
  redirect("/login");
}
