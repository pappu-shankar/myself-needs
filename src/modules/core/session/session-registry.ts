import "server-only";
import { closeVault, onVaultClosed } from "@/modules/core/db/client";
import { vaultKey, type VaultRef } from "@/modules/core/db/vault-types";
import { getConfig } from "@/modules/core/env/config";
import { recordAudit } from "@/modules/core/auth/audit-store";
import { revokeSession, revokeUserSessions } from "@/modules/core/auth/sessions-store";
import { logError } from "@/modules/core/log";

/**
 * The server-side half of every session, held only in memory (a restart signs
 * everyone out — keys are never written to disk).
 *
 * - `sessions`: sid → who it belongs to and which vault it is looking at.
 * - `keys`: per user, the DEKs they unlocked at sign-in (their personal vault and
 *   any shared spaces), kept only while that user has a live session. This is
 *   what lets a vault the pool closed for room ("evicted") reopen transparently
 *   on the next request, without asking for the password again.
 *
 * An "idle" close of a user's *personal* vault (no request for
 * APP_IDLE_LOCK_MINUTES) ends that user's sessions — that is the idle lock.
 */

export type EndReason =
  | "signed-out"
  | "signed-out-everywhere"
  | "device-revoked"
  | "idle"
  | "expired"
  | "disabled"
  | "deleted"
  | "password-changed"
  | "invalid";

export interface LiveSession {
  sid: string;
  userId: string;
  /** The vault this session's requests read and write. */
  vault: VaultRef;
  createdAt: number;
  lastSeen: number;
}

interface RegistryState {
  sessions: Map<string, LiveSession>;
  /** userId → (vaultKey → dekHex) */
  keys: Map<string, Map<string, string>>;
  unsubscribe?: () => void;
}

const globalForRegistry = globalThis as unknown as { __sessionRegistry?: RegistryState };
const state: RegistryState = (globalForRegistry.__sessionRegistry ??= {
  sessions: new Map(),
  keys: new Map(),
});

const personal = (userId: string): VaultRef => ({ kind: "user", id: userId });

// ---------------------------------------------------------------------------
// Vault-close listener (installed once per module load; a hot reload swaps it)
// ---------------------------------------------------------------------------

state.unsubscribe?.();
state.unsubscribe = onVaultClosed((ref, reason) => {
  if (reason === "shutdown") {
    state.sessions.clear();
    state.keys.clear();
    return;
  }
  if (reason === "idle" && ref.kind === "user") {
    const ended = endUserSessions(ref.id, { reason: "idle" });
    if (ended.length > 0) {
      try {
        recordAudit({
          event: "session.idle_locked",
          userId: ref.id,
          detail: { count: ended.length },
        });
      } catch (err) {
        logError("session:idle", err);
      }
    }
  }
  // "evicted": keys stay cached, requireUser reopens it on demand.
  // "closed": an explicit close by us — nothing to do.
});

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

function maxAgeMs(): number {
  return getConfig().sessionMaxHours * 60 * 60_000;
}

export interface RegisterSessionInput {
  sid: string;
  userId: string;
  /** The user's personal vault DEK (already opened by the caller). */
  personalDek: string;
  /** Space id → DEK, for every space key unsealed at sign-in. */
  spaceKeys?: ReadonlyMap<string, string>;
  now?: number;
}

export function registerSession(input: RegisterSessionInput): LiveSession {
  const now = input.now ?? Date.now();
  cacheKey(input.userId, personal(input.userId), input.personalDek);
  for (const [spaceId, dek] of input.spaceKeys ?? []) {
    cacheKey(input.userId, { kind: "space", id: spaceId }, dek);
  }
  const session: LiveSession = {
    sid: input.sid,
    userId: input.userId,
    vault: personal(input.userId),
    createdAt: now,
    lastSeen: now,
  };
  state.sessions.set(input.sid, session);
  return session;
}

/** The live session for `sid`, or null — past the absolute max age it is ended. */
export function getLiveSession(sid: string, now: number = Date.now()): LiveSession | null {
  const session = state.sessions.get(sid);
  if (!session) return null;
  if (now - session.createdAt >= maxAgeMs()) {
    endSession(sid, "expired");
    return null;
  }
  return session;
}

export function touchLiveSession(sid: string, now: number = Date.now()): void {
  const session = state.sessions.get(sid);
  if (session) session.lastSeen = now;
}

export function setSessionVault(sid: string, vault: VaultRef): void {
  const session = state.sessions.get(sid);
  if (session) session.vault = { ...vault };
}

export function listLiveSessions(userId: string): LiveSession[] {
  return [...state.sessions.values()].filter((s) => s.userId === userId);
}

export function isUserOnline(userId: string): boolean {
  for (const session of state.sessions.values()) if (session.userId === userId) return true;
  return false;
}

export function getLiveStats(): { sessions: number; users: number } {
  const users = new Set([...state.sessions.values()].map((s) => s.userId));
  return { sessions: state.sessions.size, users: users.size };
}

/**
 * Ends one session: drops it from memory and marks its history row revoked.
 * When it was the user's last live session, their cached keys are forgotten and
 * the vaults only they had unlocked are closed.
 */
export function endSession(sid: string, reason: EndReason): boolean {
  const session = state.sessions.get(sid);
  state.sessions.delete(sid);
  safeRevoke(sid);
  if (!session) return false;
  if (!isUserOnline(session.userId)) releaseUser(session.userId);
  void reason;
  return true;
}

/** Ends every live session of the user (optionally sparing one) and revokes
 * their history rows. Returns the sids that were live in memory. */
export function endUserSessions(
  userId: string,
  options: { exceptSid?: string; reason: EndReason },
): string[] {
  const ended: string[] = [];
  for (const session of [...state.sessions.values()]) {
    if (session.userId !== userId || session.sid === options.exceptSid) continue;
    state.sessions.delete(session.sid);
    ended.push(session.sid);
  }
  try {
    revokeUserSessions(userId, { exceptSid: options.exceptSid });
  } catch (err) {
    logError("session:revoke-all", err);
  }
  if (!isUserOnline(userId)) releaseUser(userId);
  return ended;
}

function safeRevoke(sid: string): void {
  try {
    revokeSession(sid);
  } catch (err) {
    logError("session:revoke", err);
  }
}

/** Forgets the user's keys and closes the vaults nobody else online holds. */
function releaseUser(userId: string): void {
  const held = state.keys.get(userId);
  state.keys.delete(userId);
  closeVault(personal(userId));
  for (const key of held?.keys() ?? []) {
    if (!key.startsWith("space:")) continue;
    if (usersHoldingKeyByName(key).length === 0) {
      closeVault({ kind: "space", id: key.slice("space:".length) });
    }
  }
}

// ---------------------------------------------------------------------------
// Key cache
// ---------------------------------------------------------------------------

export function cacheKey(userId: string, ref: VaultRef, dekHex: string): void {
  let keys = state.keys.get(userId);
  if (!keys) {
    keys = new Map();
    state.keys.set(userId, keys);
  }
  keys.set(vaultKey(ref), dekHex);
}

export function getCachedKey(userId: string, ref: VaultRef): string | null {
  return state.keys.get(userId)?.get(vaultKey(ref)) ?? null;
}

/** Drops one user's copy of a vault key; their sessions looking at that vault
 * fall back to their personal vault. */
export function forgetKey(userId: string, ref: VaultRef): void {
  state.keys.get(userId)?.delete(vaultKey(ref));
  const name = vaultKey(ref);
  for (const session of state.sessions.values()) {
    if (session.userId === userId && vaultKey(session.vault) === name) {
      session.vault = personal(userId);
    }
  }
}

/** Drops every user's copy of a vault key (space deleted). */
export function forgetKeyForEveryone(ref: VaultRef): void {
  for (const userId of [...state.keys.keys()]) forgetKey(userId, ref);
}

function usersHoldingKeyByName(name: string): string[] {
  const users: string[] = [];
  for (const [userId, keys] of state.keys) if (keys.has(name)) users.push(userId);
  return users;
}

export function usersHoldingKey(ref: VaultRef): string[] {
  return usersHoldingKeyByName(vaultKey(ref));
}

/** After a re-key: everyone still caching the old key gets the new one. */
export function replaceCachedKey(ref: VaultRef, newDekHex: string): void {
  const name = vaultKey(ref);
  for (const keys of state.keys.values()) if (keys.has(name)) keys.set(name, newDekHex);
}

/** Test-only: forget every session and key (does not close vaults). */
export function resetSessionRegistryForTests(): void {
  state.sessions.clear();
  state.keys.clear();
}
