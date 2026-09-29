import { randomUUID } from "node:crypto";
import { closeDatabase, isDatabaseOpen } from "@/modules/core/db/client";

const DEFAULT_IDLE_LOCK_MINUTES = 30;

/** `APP_IDLE_LOCK_MINUTES=0` disables auto-lock. */
function idleLockMs(): number | null {
  const raw = process.env.APP_IDLE_LOCK_MINUTES;
  const minutes = raw === undefined || raw === "" ? DEFAULT_IDLE_LOCK_MINUTES : Number(raw);
  if (!Number.isFinite(minutes) || minutes < 0) return DEFAULT_IDLE_LOCK_MINUTES * 60_000;
  return minutes === 0 ? null : minutes * 60_000;
}

/**
 * The server-side half of a session: a random epoch minted on unlock and held
 * only in memory. A cookie is valid only while it carries the current epoch, so
 * locking (or restarting the server) revokes every outstanding cookie at once —
 * iron-session cookies can't be revoked on their own.
 */
const state = globalThis as unknown as {
  __unlockEpoch?: string;
  __idleLockTimer?: NodeJS.Timeout;
};

export function currentEpoch(): string | undefined {
  return isDatabaseOpen() ? state.__unlockEpoch : undefined;
}

/** `reuseLiveEpoch` keeps the current epoch when the vault was already unlocked
 * before this request, so unlocking in a second browser doesn't sign the first one
 * out. Any other unlock mints a fresh epoch, so no older cookie can come back. */
export function beginUnlockedSession(reuseLiveEpoch: boolean): string {
  if (!reuseLiveEpoch || !state.__unlockEpoch) state.__unlockEpoch = randomUUID();
  recordActivity();
  return state.__unlockEpoch;
}

export function endUnlockedSession(): void {
  if (state.__idleLockTimer) clearTimeout(state.__idleLockTimer);
  state.__idleLockTimer = undefined;
  state.__unlockEpoch = undefined;
  closeDatabase();
}

/** Pushes the idle auto-lock deadline out; called on every authenticated request. */
export function recordActivity(): void {
  const ms = idleLockMs();
  if (state.__idleLockTimer) clearTimeout(state.__idleLockTimer);
  if (ms === null) return;
  state.__idleLockTimer = setTimeout(endUnlockedSession, ms);
  state.__idleLockTimer.unref?.();
}
