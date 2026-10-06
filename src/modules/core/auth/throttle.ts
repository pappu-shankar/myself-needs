import "server-only";
import { createHash } from "node:crypto";
import { getRegistryDb } from "./accounts-db";
import { ipPrefix, parseIp } from "./sessions-store";

/**
 * Sign-in throttling, three layers (all must allow):
 *
 * - **Per username, persisted** (`login_throttle`): after 5 failures the name is
 *   locked for 30 s, doubling per further failure, capped at 15 min. Keyed by a
 *   hash of the normalized name, so unknown names throttle exactly like real
 *   ones — the response never reveals whether an account exists. Survives
 *   restarts; forgotten 24 h after the last failure.
 * - **Per IP, in memory**: 20 failures per 15 min. Only applied when the caller
 *   passes an IP (i.e. it trusts the proxy's forwarded address). IPv6 is
 *   grouped by /64, since one client typically owns a whole /64.
 * - **Global, in memory**: 60 failures per minute across everyone.
 *
 * Callers use distinct key namespaces for other credential checks, e.g.
 * `checkLogin("recover:" + username, ip)` for recovery-key attempts.
 */

export const USERNAME_FREE_FAILURES = 5;
export const USERNAME_BASE_LOCK_MS = 30_000;
export const USERNAME_MAX_LOCK_MS = 15 * 60_000;
export const USERNAME_FORGET_MS = 24 * 60 * 60_000;

export const IP_MAX_FAILURES = 20;
export const IP_WINDOW_MS = 15 * 60_000;

export const GLOBAL_MAX_FAILURES = 60;
export const GLOBAL_WINDOW_MS = 60_000;

const MAX_TRACKED_IPS = 10_000;

export interface ThrottleStatus {
  allowed: boolean;
  retryAfterMs: number;
}

/** Lock length after `failures` consecutive failures (0 below the threshold). */
export function backoffMs(failures: number): number {
  if (failures < USERNAME_FREE_FAILURES) return 0;
  const step = failures - USERNAME_FREE_FAILURES;
  // 30 s · 2^5 = 16 min > cap, so stop doubling early and avoid overflow.
  if (step >= 5) return USERNAME_MAX_LOCK_MS;
  return Math.min(USERNAME_BASE_LOCK_MS * 2 ** step, USERNAME_MAX_LOCK_MS);
}

/** Stable, non-reversible key for a typed username (or namespaced key). */
export function throttleKey(usernameKey: string): string {
  const normalized = usernameKey.normalize("NFKC").trim().toLowerCase().slice(0, 300);
  return createHash("sha256").update(normalized).digest("hex");
}

// --- in-memory windows -----------------------------------------------------

interface MemoryState {
  ip: Map<string, number[]>;
  global: number[];
}

const globalForThrottle = globalThis as unknown as { __loginThrottle?: MemoryState };

function memory(): MemoryState {
  globalForThrottle.__loginThrottle ??= { ip: new Map(), global: [] };
  return globalForThrottle.__loginThrottle;
}

function prune(times: number[], now: number, windowMs: number): number[] {
  const cutoff = now - windowMs;
  let i = 0;
  while (i < times.length && times[i] <= cutoff) i++;
  return i === 0 ? times : times.slice(i);
}

/** Time until the window drops below `max` entries (0 when already below). */
function windowWait(times: number[], max: number, now: number, windowMs: number): number {
  if (times.length < max) return 0;
  return Math.max(0, times[times.length - max] + windowMs - now);
}

function ipKey(ip: string | null | undefined): string | null {
  if (!ip) return null;
  const parsed = parseIp(ip);
  if (!parsed) return null;
  if (parsed.version === 4) return parsed.address;
  return ipPrefix(parsed.address, 64);
}

// --- public API ------------------------------------------------------------

export function checkLogin(
  usernameKey: string,
  ip?: string | null,
  now: number = Date.now(),
): ThrottleStatus {
  const state = memory();
  state.global = prune(state.global, now, GLOBAL_WINDOW_MS);
  let wait = windowWait(state.global, GLOBAL_MAX_FAILURES, now, GLOBAL_WINDOW_MS);

  const ipk = ipKey(ip);
  if (ipk) {
    const times = prune(state.ip.get(ipk) ?? [], now, IP_WINDOW_MS);
    if (times.length === 0) state.ip.delete(ipk);
    else state.ip.set(ipk, times);
    wait = Math.max(wait, windowWait(times, IP_MAX_FAILURES, now, IP_WINDOW_MS));
  }

  const row = getRegistryDb()
    .prepare("SELECT locked_until FROM login_throttle WHERE key = ?")
    .get(throttleKey(usernameKey)) as { locked_until: number } | undefined;
  if (row) wait = Math.max(wait, row.locked_until - now);

  wait = Math.max(0, wait);
  return { allowed: wait === 0, retryAfterMs: wait };
}

export function recordLoginFailure(
  usernameKey: string,
  ip?: string | null,
  now: number = Date.now(),
): ThrottleStatus {
  const state = memory();
  state.global.push(now);
  const ipk = ipKey(ip);
  if (ipk) {
    const times = state.ip.get(ipk) ?? [];
    times.push(now);
    state.ip.delete(ipk); // re-insert so Map order tracks recency
    state.ip.set(ipk, times);
    if (state.ip.size > MAX_TRACKED_IPS) {
      const oldest = state.ip.keys().next().value;
      if (oldest !== undefined) state.ip.delete(oldest);
    }
  }

  const db = getRegistryDb();
  const key = throttleKey(usernameKey);
  const row = db
    .prepare("SELECT failures, updated_at FROM login_throttle WHERE key = ?")
    .get(key) as { failures: number; updated_at: number } | undefined;
  const failures = row && now - row.updated_at < USERNAME_FORGET_MS ? row.failures + 1 : 1;
  const wait = backoffMs(failures);
  db.prepare(
    `INSERT INTO login_throttle (key, failures, locked_until, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT (key) DO UPDATE SET failures = excluded.failures,
       locked_until = excluded.locked_until, updated_at = excluded.updated_at`,
  ).run(key, failures, wait > 0 ? now + wait : 0, now);

  maybePruneThrottle(now);
  return checkLogin(usernameKey, ip, now);
}

/** Clears the username's backoff. IP and global windows are left to expire —
 * one success from an attacking IP shouldn't wipe its failure history. */
export function recordLoginSuccess(usernameKey: string): void {
  getRegistryDb().prepare("DELETE FROM login_throttle WHERE key = ?").run(throttleKey(usernameKey));
}

let writesSincePrune = 0;

function maybePruneThrottle(now: number): void {
  if (++writesSincePrune < 100) return;
  writesSincePrune = 0;
  pruneLoginThrottle(now);
}

export function pruneLoginThrottle(now: number = Date.now()): number {
  return getRegistryDb()
    .prepare("DELETE FROM login_throttle WHERE updated_at < ? AND locked_until < ?")
    .run(now - USERNAME_FORGET_MS, now).changes;
}

/** Test helper: forget the in-memory IP and global windows. */
export function resetThrottleMemory(): void {
  globalForThrottle.__loginThrottle = undefined;
  writesSincePrune = 0;
}
