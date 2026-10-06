import "server-only";
import { randomUUID } from "node:crypto";
import { closeVault, openVault } from "@/modules/core/db/client";
import {
  createVault,
  dummyUnwrap,
  KdfBusyError,
  normalizeRecoveryKey,
  rewrapPassword,
  unlockWithPassword,
  unlockWithRecoveryKey,
} from "@/modules/core/db/crypto";
import { ensureIdentity } from "@/modules/core/db/sealing";
import { getUserDir } from "@/modules/core/env/paths";
import {
  CredentialError,
  DatabaseOpenError,
  DomainError,
  VaultStateError,
} from "@/modules/core/errors";
import { logError } from "@/modules/core/log";
import type { RequestMeta } from "@/modules/core/session/session";
import { endUserSessions } from "@/modules/core/session/session-registry";
import { trashVaultDir } from "@/modules/core/spaces/spaces-service";
import { transaction } from "./accounts-db";
import {
  countAccounts,
  createAccount,
  findByUsername,
  recordFailure,
  type Account,
} from "./accounts-store";
import { recordAudit } from "./audit-store";
import { markInviteUsedBy, peekInvite, redeemInvite } from "./invites";
import { claimLegacyVault } from "./legacy-claim";
import { checkPassword } from "./password-policy";
import { checkLogin, recordLoginFailure, recordLoginSuccess } from "./throttle";
import { checkUsername, normalizeUsername } from "./username";

/**
 * The credential checks behind the public auth actions. Each returns either a
 * verified account + DEK (the caller starts the session) or a user-safe error.
 * Unknown usernames are indistinguishable from wrong passwords: same message,
 * same KDF cost (dummy unwrap), same throttling.
 */

export const INVALID_LOGIN = "Incorrect username or password.";
export const INVALID_RECOVERY = "Incorrect username or recovery key.";
export const ACCOUNT_DISABLED = "This account is disabled. Ask your admin to re-enable it.";
export const INVALID_INVITE = "This invite link is invalid, expired or already used.";
export const SETUP_DONE = "This app is already set up — sign in instead.";

export type AuthResult<T> =
  ({ ok: true } & T) | { ok: false; error: string; retryAfterMs?: number };

export function throttledMessage(retryAfterMs: number): string {
  const minutes = Math.ceil(retryAfterMs / 60_000);
  return retryAfterMs < 60_000
    ? `Too many attempts. Try again in ${Math.max(1, Math.ceil(retryAfterMs / 1000))} seconds.`
    : `Too many attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`;
}

/** Errors that are safe to show as-is; everything else is logged and generic. */
function safeMessage(err: unknown, scope: string, fallback: string): string {
  if (err instanceof KdfBusyError) return err.message;
  if (err instanceof DomainError || err instanceof VaultStateError) return err.message;
  if (err instanceof DatabaseOpenError) {
    logError(scope, err);
    return err.message;
  }
  logError(scope, err);
  return fallback;
}

/** Throttle key for a typed username (bounded so a giant input can't bloat it). */
function nameKey(raw: string): string {
  return normalizeUsername(raw).slice(0, 64);
}

// ---------------------------------------------------------------------------
// Password sign-in
// ---------------------------------------------------------------------------

export async function verifyLogin(
  rawUsername: string,
  password: string,
  meta: RequestMeta,
): Promise<AuthResult<{ account: Account; dekHex: string }>> {
  const key = nameKey(rawUsername);
  const throttle = checkLogin(key, meta.ip);
  if (!throttle.allowed) {
    recordAudit({
      event: "login.throttled",
      ip: meta.ip,
      detail: { retryAfterMs: throttle.retryAfterMs },
    });
    return {
      ok: false,
      error: throttledMessage(throttle.retryAfterMs),
      retryAfterMs: throttle.retryAfterMs,
    };
  }

  const account = findByUsername(rawUsername);
  let dekHex: string;
  try {
    if (!account) {
      await dummyUnwrap(password);
      throw new CredentialError(INVALID_LOGIN);
    }
    dekHex = await unlockWithPassword(getUserDir(account.id), password);
  } catch (err) {
    if (err instanceof CredentialError) {
      recordLoginFailure(key, meta.ip);
      if (account) recordFailure(account.id);
      recordAudit({
        event: "login.failed",
        userId: account?.id ?? null,
        ip: meta.ip,
        detail: { reason: account ? "password" : "unknown-user" },
      });
      return { ok: false, error: INVALID_LOGIN };
    }
    return {
      ok: false,
      error: safeMessage(err, "auth:login", "Couldn't sign you in. Please try again."),
    };
  }

  if (account!.status !== "active") {
    recordAudit({ event: "login.disabled", userId: account!.id, ip: meta.ip });
    return { ok: false, error: ACCOUNT_DISABLED };
  }
  recordLoginSuccess(key);
  return { ok: true, account: account!, dekHex };
}

// ---------------------------------------------------------------------------
// Recovery key
// ---------------------------------------------------------------------------

export interface RecoverInput {
  username: string;
  recoveryKey: string;
  /** Omit to only verify the key (step one of the form). */
  newPassword?: string;
  confirmPassword?: string;
}

/**
 * Verifies the recovery key; with a new password, also opens the vault (before
 * touching the keyring, so an unopenable vault never gets a changed keyring),
 * re-wraps the DEK under the new password and ends the user's other sessions.
 */
export async function verifyRecovery(
  input: RecoverInput,
  meta: RequestMeta,
): Promise<AuthResult<{ account: Account; dekHex: string; passwordChanged: boolean }>> {
  const key = `recover:${nameKey(input.username)}`;
  const throttle = checkLogin(key, meta.ip);
  if (!throttle.allowed) {
    recordAudit({
      event: "recovery.throttled",
      ip: meta.ip,
      detail: { retryAfterMs: throttle.retryAfterMs },
    });
    return {
      ok: false,
      error: throttledMessage(throttle.retryAfterMs),
      retryAfterMs: throttle.retryAfterMs,
    };
  }
  if (!normalizeRecoveryKey(input.recoveryKey)) {
    return { ok: false, error: "That doesn't look like a recovery key (32 letters and digits)." };
  }
  if (input.newPassword !== undefined) {
    if (input.newPassword !== input.confirmPassword) {
      return { ok: false, error: "The passwords don't match." };
    }
    const policy = checkPassword(input.newPassword, { username: input.username });
    if (!policy.ok) return { ok: false, error: policy.message };
  }

  const account = findByUsername(input.username);
  let dekHex: string;
  try {
    if (!account) {
      await dummyUnwrap(input.recoveryKey);
      throw new CredentialError(INVALID_RECOVERY);
    }
    dekHex = await unlockWithRecoveryKey(getUserDir(account.id), input.recoveryKey);
  } catch (err) {
    if (err instanceof CredentialError) {
      recordLoginFailure(key, meta.ip);
      recordAudit({
        event: "recovery.failed",
        userId: account?.id ?? null,
        ip: meta.ip,
        detail: { reason: account ? "key" : "unknown-user" },
      });
      return { ok: false, error: INVALID_RECOVERY };
    }
    return {
      ok: false,
      error: safeMessage(err, "auth:recover", "Couldn't verify the recovery key."),
    };
  }

  if (account!.status !== "active") {
    recordAudit({
      event: "login.disabled",
      userId: account!.id,
      ip: meta.ip,
      detail: { via: "recovery" },
    });
    return { ok: false, error: ACCOUNT_DISABLED };
  }
  recordLoginSuccess(key);
  if (input.newPassword === undefined) {
    return { ok: true, account: account!, dekHex, passwordChanged: false };
  }

  try {
    openVault({ kind: "user", id: account!.id }, dekHex);
    await rewrapPassword(getUserDir(account!.id), dekHex, input.newPassword);
  } catch (err) {
    return {
      ok: false,
      error: safeMessage(err, "auth:recover-reset", "Couldn't reset your password."),
    };
  }
  endUserSessions(account!.id, { reason: "password-changed" });
  recordLoginSuccess(nameKey(input.username));
  recordAudit({ event: "recovery.used", userId: account!.id, ip: meta.ip });
  return { ok: true, account: account!, dekHex, passwordChanged: true };
}

// ---------------------------------------------------------------------------
// New accounts (invite, setup)
// ---------------------------------------------------------------------------

export interface NewAccountInput {
  username: string;
  password: string;
  confirmPassword: string;
}

type Provisioned = { account: Account; dekHex: string; recoveryKey: string };

function validateNewAccount(input: NewAccountInput): { username: string } | { error: string } {
  const name = checkUsername(input.username);
  if (!name.ok) return { error: name.message };
  if (input.password !== input.confirmPassword) return { error: "The passwords don't match." };
  const policy = checkPassword(input.password, { username: name.username });
  if (!policy.ok) return { error: policy.message };
  if (findByUsername(name.username)) return { error: "That username is already taken." };
  return { username: name.username };
}

/**
 * Creates the vault directory, keyring (password + recovery key), the migrated
 * database and the identity key pair, then runs `register` (the registry
 * writes) in ONE registry transaction. If anything fails, the new vault is
 * closed and its directory removed — nothing half-made is left behind.
 */
async function provisionAccount(
  password: string,
  register: (id: string, publicKey: string) => Account,
): Promise<Provisioned> {
  const id = randomUUID();
  const ref = { kind: "user", id } as const;
  const dir = getUserDir(id);
  try {
    const { recoveryKey, dekHex } = await createVault(dir, password);
    openVault(ref, dekHex);
    const publicKey = ensureIdentity(dir, dekHex);
    const account = transaction(() => register(id, publicKey));
    return { account, dekHex, recoveryKey };
  } catch (err) {
    closeVault(ref);
    try {
      trashVaultDir("users", id);
    } catch (cleanupErr) {
      logError("auth:provision-cleanup", cleanupErr);
    }
    throw err;
  }
}

export async function acceptInvite(
  input: NewAccountInput & { token: string },
  meta: RequestMeta,
): Promise<AuthResult<Provisioned>> {
  const key = `invite:${meta.ip ?? "local"}`;
  const throttle = checkLogin(key, meta.ip);
  if (!throttle.allowed) {
    return {
      ok: false,
      error: throttledMessage(throttle.retryAfterMs),
      retryAfterMs: throttle.retryAfterMs,
    };
  }
  if (!peekInvite(input.token)) {
    recordLoginFailure(key, meta.ip);
    recordAudit({ event: "invite.rejected", ip: meta.ip });
    return { ok: false, error: INVALID_INVITE };
  }
  const valid = validateNewAccount(input);
  if ("error" in valid) return { ok: false, error: valid.error };

  try {
    const result = await provisionAccount(input.password, (id, publicKey) => {
      const invite = redeemInvite(input.token);
      if (!invite) throw new DomainError(INVALID_INVITE);
      const account = createAccount({ id, username: valid.username, role: "member", publicKey });
      markInviteUsedBy(invite.id, id);
      recordAudit({
        event: "invite.accepted",
        userId: id,
        actorId: invite.createdBy,
        ip: meta.ip,
        detail: { inviteId: invite.id },
      });
      return account;
    });
    return { ok: true, ...result };
  } catch (err) {
    return {
      ok: false,
      error: safeMessage(err, "auth:invite", "Couldn't create your account. Please try again."),
    };
  }
}

/** First admin on a fresh install. The caller has already checked the setup
 * token and that the install state is "fresh-setup". */
export async function createFirstAdmin(
  input: NewAccountInput,
  meta: RequestMeta,
): Promise<AuthResult<Provisioned>> {
  const valid = validateNewAccount(input);
  if ("error" in valid) return { ok: false, error: valid.error };
  try {
    const result = await provisionAccount(input.password, (id, publicKey) => {
      if (countAccounts() > 0) throw new DomainError(SETUP_DONE);
      const account = createAccount({ id, username: valid.username, role: "admin", publicKey });
      recordAudit({ event: "setup.completed", userId: id, ip: meta.ip });
      return account;
    });
    return { ok: true, ...result };
  } catch (err) {
    return {
      ok: false,
      error: safeMessage(err, "auth:setup", "Couldn't create the admin account."),
    };
  }
}

// ---------------------------------------------------------------------------
// Legacy claim
// ---------------------------------------------------------------------------

export async function claimLegacy(
  input: { username: string; passphrase: string; newPassword?: string; confirmPassword?: string },
  meta: RequestMeta,
): Promise<AuthResult<{ account: Account; dekHex: string }>> {
  const key = `claim:${meta.ip ?? "local"}`;
  const throttle = checkLogin(key, meta.ip);
  if (!throttle.allowed) {
    return {
      ok: false,
      error: throttledMessage(throttle.retryAfterMs),
      retryAfterMs: throttle.retryAfterMs,
    };
  }
  if (input.newPassword !== undefined) {
    if (input.newPassword !== input.confirmPassword) {
      return { ok: false, error: "The passwords don't match." };
    }
    const policy = checkPassword(input.newPassword, { username: input.username });
    if (!policy.ok) return { ok: false, error: policy.message };
  }
  try {
    const { account, dekHex } = await claimLegacyVault(input);
    recordLoginSuccess(key);
    if (input.newPassword !== undefined) {
      openVault({ kind: "user", id: account.id }, dekHex);
      await rewrapPassword(getUserDir(account.id), dekHex, input.newPassword);
    }
    return { ok: true, account, dekHex };
  } catch (err) {
    if (err instanceof CredentialError) {
      recordLoginFailure(key, meta.ip);
      recordAudit({ event: "claim.failed", ip: meta.ip });
      return { ok: false, error: "That passphrase doesn't open the existing vault." };
    }
    return {
      ok: false,
      error: safeMessage(err, "auth:claim", "Couldn't claim the existing vault."),
    };
  }
}
