import "server-only";
import { randomUUID } from "node:crypto";
import type { AccountRole } from "@/modules/core/db/vault-types";
import { DomainError } from "@/modules/core/errors";
import { getRegistryDb, transaction } from "./accounts-db";
import { backoffMs } from "./throttle";
import { checkUsername, parseUsername } from "./username";

export type { AccountRole };
export type AccountStatus = "active" | "disabled";

export interface Account {
  id: string;
  username: string;
  displayName: string | null;
  color: string | null;
  hasAvatar: boolean;
  role: AccountRole;
  status: AccountStatus;
  /** Base64 raw X25519 public key — space keys are sealed to it. */
  publicKey: string;
  createdAt: number;
  lastLoginAt: number | null;
  failedCount: number;
  lockedUntil: number | null;
}

interface AccountRow {
  id: string;
  username: string;
  display_name: string | null;
  color: string | null;
  has_avatar: number;
  role: AccountRole;
  status: AccountStatus;
  public_key: string;
  created_at: number;
  last_login_at: number | null;
  failed_count: number;
  locked_until: number | null;
}

function toAccount(row: AccountRow): Account {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    color: row.color,
    hasAvatar: row.has_avatar === 1,
    role: row.role,
    status: row.status,
    publicKey: row.public_key,
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at,
    failedCount: row.failed_count,
    lockedUntil: row.locked_until,
  };
}

const DISPLAY_NAME_MAX = 60;
const COLOR_PATTERN = /^#[0-9a-f]{6}$/i;

export interface CreateAccountInput {
  username: string;
  role: AccountRole;
  publicKey: string;
  displayName?: string | null;
  /** Lets a caller that already created the vault directory reuse its id. */
  id?: string;
  now?: number;
}

/** Throws `DomainError` for an invalid or taken username. */
export function createAccount(input: CreateAccountInput): Account {
  const check = checkUsername(input.username);
  if (!check.ok) throw new DomainError(check.message);
  if (!input.publicKey) throw new Error("createAccount: publicKey is required");
  const id = input.id ?? randomUUID();
  const now = input.now ?? Date.now();
  try {
    getRegistryDb()
      .prepare(
        `INSERT INTO accounts (id, username, display_name, role, status, public_key, created_at)
         VALUES (?, ?, ?, ?, 'active', ?, ?)`,
      )
      .run(
        id,
        check.username,
        cleanDisplayName(input.displayName),
        input.role,
        input.publicKey,
        now,
      );
  } catch (err) {
    if (isUniqueViolation(err, "accounts.username")) {
      throw new DomainError("That username is already taken.");
    }
    throw err;
  }
  invalidateAccount(id);
  return findById(id)!;
}

export function findById(id: string): Account | null {
  const row = getRegistryDb().prepare("SELECT * FROM accounts WHERE id = ?").get(id) as
    AccountRow | undefined;
  return row ? toAccount(row) : null;
}

/** Accepts the raw, user-typed username; invalid names simply find nothing. */
export function findByUsername(raw: string): Account | null {
  const username = parseUsername(raw);
  if (!username) return null;
  const row = getRegistryDb().prepare("SELECT * FROM accounts WHERE username = ?").get(username) as
    AccountRow | undefined;
  return row ? toAccount(row) : null;
}

export function listAccounts(): Account[] {
  const rows = getRegistryDb()
    .prepare("SELECT * FROM accounts ORDER BY username")
    .all() as AccountRow[];
  return rows.map(toAccount);
}

export function countAccounts(): number {
  return (getRegistryDb().prepare("SELECT COUNT(*) AS n FROM accounts").get() as { n: number }).n;
}

export function setStatus(id: string, status: AccountStatus): boolean {
  const changed =
    getRegistryDb().prepare("UPDATE accounts SET status = ? WHERE id = ?").run(status, id)
      .changes === 1;
  invalidateAccount(id);
  return changed;
}

export function setRole(id: string, role: AccountRole): boolean {
  const changed =
    getRegistryDb().prepare("UPDATE accounts SET role = ? WHERE id = ?").run(role, id).changes ===
    1;
  invalidateAccount(id);
  return changed;
}

/** Deletes the row; sessions, memberships and dismissed alerts cascade. The
 * caller wipes the vault directory. */
export function deleteAccount(id: string): boolean {
  const changed =
    getRegistryDb().prepare("DELETE FROM accounts WHERE id = ?").run(id).changes === 1;
  invalidateAccount(id);
  return changed;
}

/** A successful sign-in: stamps `last_login_at` and clears the failure counters. */
export function recordLogin(id: string, at: number = Date.now()): void {
  getRegistryDb()
    .prepare(
      "UPDATE accounts SET last_login_at = ?, failed_count = 0, locked_until = NULL WHERE id = ?",
    )
    .run(at, id);
}

export interface ProfileUpdate {
  displayName?: string | null;
  color?: string | null;
  hasAvatar?: boolean;
}

/** Partial update — omitted fields are left alone. Throws `DomainError` on bad input. */
export function updateProfile(id: string, update: ProfileUpdate): Account | null {
  const sets: string[] = [];
  const values: (string | number | null)[] = [];
  if (update.displayName !== undefined) {
    sets.push("display_name = ?");
    values.push(cleanDisplayName(update.displayName));
  }
  if (update.color !== undefined) {
    if (update.color !== null && !COLOR_PATTERN.test(update.color)) {
      throw new DomainError("Pick a colour in #rrggbb format.");
    }
    sets.push("color = ?");
    values.push(update.color === null ? null : update.color.toLowerCase());
  }
  if (update.hasAvatar !== undefined) {
    sets.push("has_avatar = ?");
    values.push(update.hasAvatar ? 1 : 0);
  }
  if (sets.length > 0) {
    getRegistryDb()
      .prepare(`UPDATE accounts SET ${sets.join(", ")} WHERE id = ?`)
      .run(...values, id);
  }
  return findById(id);
}

export function countActiveAdmins(): number {
  return (
    getRegistryDb()
      .prepare("SELECT COUNT(*) AS n FROM accounts WHERE role = 'admin' AND status = 'active'")
      .get() as { n: number }
  ).n;
}

/** True when `id` is the only active admin — disabling, deleting or demoting it
 * would leave nobody able to administer the app. */
export function isLastActiveAdmin(id: string): boolean {
  const account = findById(id);
  if (!account || account.role !== "admin" || account.status !== "active") return false;
  return countActiveAdmins() <= 1;
}

/** Throws `DomainError` if the change would remove the last active admin. */
export function assertNotLastActiveAdmin(id: string): void {
  if (isLastActiveAdmin(id)) {
    throw new DomainError("This is the only active admin. Make someone else an admin first.");
  }
}

/**
 * Per-account failure counter (shown to admins as "locked out"). Uses the same
 * backoff as the login throttle: 5 failures → 30 s, doubling, capped at 15 min.
 * Returns the new `locked_until`, or `null` while still under the threshold.
 */
export function recordFailure(id: string, now: number = Date.now()): number | null {
  return transaction(() => {
    const db = getRegistryDb();
    const row = db.prepare("SELECT failed_count FROM accounts WHERE id = ?").get(id) as
      { failed_count: number } | undefined;
    if (!row) return null;
    const failures = row.failed_count + 1;
    const wait = backoffMs(failures);
    const lockedUntil = wait > 0 ? now + wait : null;
    db.prepare("UPDATE accounts SET failed_count = ?, locked_until = ? WHERE id = ?").run(
      failures,
      lockedUntil,
      id,
    );
    return lockedUntil;
  });
}

export function clearFailures(id: string): void {
  getRegistryDb()
    .prepare("UPDATE accounts SET failed_count = 0, locked_until = NULL WHERE id = ?")
    .run(id);
}

// --- Status cache ----------------------------------------------------------
// Every authenticated request checks that the account is still active; this
// keeps that off the database for 5 s. Mutations here invalidate immediately,
// and callers that change accounts out-of-band call `invalidateAccount`.

export const ACCOUNT_STATUS_TTL_MS = 5_000;

export interface AccountStatusSnapshot {
  status: AccountStatus;
  role: AccountRole;
}

interface CacheEntry {
  value: AccountStatusSnapshot | null;
  expiresAt: number;
}

const globalForCache = globalThis as unknown as { __accountStatusCache?: Map<string, CacheEntry> };

function statusCache(): Map<string, CacheEntry> {
  globalForCache.__accountStatusCache ??= new Map();
  return globalForCache.__accountStatusCache;
}

/** `null` when the account no longer exists. */
export function getAccountStatusCached(
  id: string,
  now: number = Date.now(),
): AccountStatusSnapshot | null {
  const cache = statusCache();
  const hit = cache.get(id);
  if (hit && hit.expiresAt > now) return hit.value;
  const row = getRegistryDb().prepare("SELECT status, role FROM accounts WHERE id = ?").get(id) as
    AccountStatusSnapshot | undefined;
  const value = row ? { status: row.status, role: row.role } : null;
  if (cache.size > 10_000) cache.clear();
  cache.set(id, { value, expiresAt: now + ACCOUNT_STATUS_TTL_MS });
  return value;
}

export function invalidateAccount(id: string): void {
  statusCache().delete(id);
}

export function resetAccountStatusCache(): void {
  statusCache().clear();
}

// --- helpers ---------------------------------------------------------------

function cleanDisplayName(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.normalize("NFKC").trim();
  if (trimmed.length === 0) return null;
  if ([...trimmed].length > DISPLAY_NAME_MAX) {
    throw new DomainError(`Display name can be at most ${DISPLAY_NAME_MAX} characters.`);
  }
  return trimmed;
}

export function isUniqueViolation(err: unknown, column?: string): boolean {
  if (!(err instanceof Error)) return false;
  const code = (err as Error & { code?: string }).code;
  if (code !== "SQLITE_CONSTRAINT_UNIQUE" && code !== "SQLITE_CONSTRAINT_PRIMARYKEY") return false;
  return column === undefined || err.message.includes(column);
}
