import "server-only";
import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import {
  closeVault,
  getLatestMigrationCount,
  getOpenVaultMigrationCount,
  openVaultKeys,
} from "@/modules/core/db/client";
import { getKdfQueueStats } from "@/modules/core/db/crypto";
import type { AccountRole, VaultRef } from "@/modules/core/db/vault-types";
import { getDataDir } from "@/modules/core/env/paths";
import { DomainError } from "@/modules/core/errors";
import {
  endUserSessions,
  getLiveStats,
  isUserOnline,
  listLiveSessions,
} from "@/modules/core/session/session-registry";
import { deleteAccountCompletely } from "./account-lifecycle";
import {
  assertNotLastActiveAdmin,
  findById,
  listAccounts,
  setRole,
  setStatus,
  type AccountStatus,
} from "./accounts-store";
import { countAudit, listAudit, recordAudit, type AuditEntry } from "./audit-store";
import {
  createInvite as storeCreateInvite,
  INVITE_DEFAULT_TTL_MS,
  inviteState,
  listInvites,
  revokeInvite as storeRevokeInvite,
  type InviteState,
} from "./invites";
import { ipPrefix } from "./sessions-store";
import { normalizeUsername } from "./username";

/**
 * What an admin can do: manage accounts and invites, and see metadata. Never
 * reads or opens anyone's vault — no vault-connection helper is imported here
 * (enforced by src/test/architecture.test.ts); vaults are only ever *closed*.
 */

export interface AdminUserRow {
  id: string;
  username: string;
  displayName: string | null;
  role: AccountRole;
  status: AccountStatus;
  createdAt: number;
  lastLoginAt: number | null;
  online: boolean;
  liveSessions: number;
  lockedUntil: number | null;
}

export function listUsersForAdmin(now: number = Date.now()): AdminUserRow[] {
  return listAccounts().map((a) => ({
    id: a.id,
    username: a.username,
    displayName: a.displayName,
    role: a.role,
    status: a.status,
    createdAt: a.createdAt,
    lastLoginAt: a.lastLoginAt,
    online: isUserOnline(a.id),
    liveSessions: listLiveSessions(a.id).length,
    lockedUntil: a.lockedUntil && a.lockedUntil > now ? a.lockedUntil : null,
  }));
}

export interface AdminInviteRow {
  id: string;
  state: InviteState;
  note: string | null;
  createdAt: number;
  expiresAt: number;
  usedAt: number | null;
  usedBy: string | null;
}

export function listInvitesForAdmin(now: number = Date.now()): AdminInviteRow[] {
  return listInvites().map((i) => ({
    id: i.id,
    state: inviteState(i, now),
    note: i.note,
    createdAt: i.createdAt,
    expiresAt: i.expiresAt,
    usedAt: i.usedAt,
    usedBy: i.usedBy,
  }));
}

export interface HealthStats {
  accounts: number;
  activeAccounts: number;
  liveSessions: number;
  onlineUsers: number;
  openVaults: number;
  kdf: { running: number; queued: number };
  failedLogins24h: number;
  throttled24h: number;
  memoryRssBytes: number;
  uptimeSeconds: number;
}

export function getHealthStats(now: number = Date.now()): HealthStats {
  const accounts = listAccounts();
  const live = getLiveStats();
  const since = now - 24 * 60 * 60_000;
  return {
    accounts: accounts.length,
    activeAccounts: accounts.filter((a) => a.status === "active").length,
    liveSessions: live.sessions,
    onlineUsers: live.users,
    openVaults: openVaultKeys().length,
    kdf: getKdfQueueStats(),
    failedLogins24h: countAudit("login.failed", since),
    throttled24h: countAudit("login.throttled", since),
    memoryRssBytes: process.memoryUsage().rss,
    uptimeSeconds: Math.round(process.uptime()),
  };
}

// ---------------------------------------------------------------------------
// Recent security events
// ---------------------------------------------------------------------------

/** Server-wide events an admin should see. `login.new_device` is included for
 * admin accounts only (a stolen admin login is the one that matters most). */
const ADMIN_SECURITY_EVENTS: Record<string, string> = {
  "login.failed": "Failed sign-in",
  "login.throttled": "Sign-in locked out (too many attempts)",
  "login.disabled": "Sign-in to a disabled account",
  "recovery.failed": "Failed recovery-key attempt",
  "recovery.throttled": "Recovery locked out (too many attempts)",
  "recovery.used": "Recovery key used",
  "setup.rejected": "Rejected setup attempt",
  "claim.failed": "Failed vault-claim attempt",
  "invite.created": "Invite created",
  "invite.revoked": "Invite revoked",
  "invite.accepted": "Invite accepted",
  "invite.rejected": "Invalid invite used",
};

export interface AdminSecurityEvent {
  id: number;
  at: number;
  event: string;
  label: string;
  /** The account it's about (or that did it), when known. */
  username: string | null;
  /** First part of the IP address only (/24 or /48). */
  network: string | null;
  device: string | null;
  reason: string | null;
}

function networkOf(entry: AuditEntry): string | null {
  const fromDetail = entry.detail?.ipPrefix;
  if (typeof fromDetail === "string") return fromDetail;
  return entry.ip ? ipPrefix(entry.ip) : null;
}

/** Newest first. Metadata only — no tokens, typed usernames or secrets are
 * ever stored in the audit log, and IPs are cut to a network prefix here. */
export function listRecentSecurityEventsForAdmin(limit = 50): AdminSecurityEvent[] {
  const accounts = new Map(listAccounts().map((a) => [a.id, a]));
  const adminIds = new Set(
    [...accounts.values()].filter((a) => a.role === "admin").map((a) => a.id),
  );
  const general = listAudit({ events: Object.keys(ADMIN_SECURITY_EVENTS), limit });
  const adminDevices = listAudit({ events: ["login.new_device"], limit: limit * 4 }).filter(
    (e) => e.userId !== null && adminIds.has(e.userId),
  );
  return [...general, ...adminDevices]
    .sort((a, b) => b.at - a.at || b.id - a.id)
    .slice(0, limit)
    .map((e) => {
      const who = e.userId ?? e.actorId;
      const ua = e.detail?.uaSummary;
      const reason = e.detail?.reason;
      return {
        id: e.id,
        at: e.at,
        event: e.event,
        label: ADMIN_SECURITY_EVENTS[e.event] ?? "Admin signed in from a new device",
        username: who ? (accounts.get(who)?.username ?? null) : null,
        network: networkOf(e),
        device: typeof ua === "string" ? ua : null,
        reason: typeof reason === "string" ? reason : null,
      };
    });
}

// ---------------------------------------------------------------------------
// Vault storage & migrations
// ---------------------------------------------------------------------------

const VAULT_DIR_NAME = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export interface VaultStorageStat {
  kind: VaultRef["kind"];
  id: string;
  /** Username for a personal vault; null for a space (its name is members' data). */
  owner: string | null;
  /** All files in the vault's directory, backups included. */
  sizeBytes: number;
  /** Applied migrations, or null when the vault is closed (it is never opened for this). */
  migrationsApplied: number | null;
  migrationsLatest: number;
  /** mtime of the newest file in backups/, or null with none. */
  newestBackupAt: number | null;
}

function dirSize(dir: string): number {
  let total = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    try {
      if (entry.isDirectory()) total += dirSize(full);
      else if (entry.isFile()) total += statSync(full).size;
    } catch {
      // A file removed mid-scan (e.g. a WAL checkpoint) — skip it.
    }
  }
  return total;
}

function newestMtime(dir: string): number | null {
  if (!existsSync(dir)) return null;
  let newest: number | null = null;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    try {
      const mtime = statSync(path.join(dir, entry.name)).mtimeMs;
      if (newest === null || mtime > newest) newest = mtime;
    } catch {
      // Pruned mid-scan.
    }
  }
  return newest === null ? null : Math.floor(newest);
}

/** Per-vault disk usage, schema version and backup freshness, read from the
 * filesystem (plus an already-open connection's migration count). */
export function getVaultStorageStats(): VaultStorageStat[] {
  const dataDir = getDataDir();
  let latest: number;
  try {
    latest = getLatestMigrationCount();
  } catch {
    latest = 0;
  }
  const out: VaultStorageStat[] = [];
  for (const [kind, folder] of [
    ["user", "users"],
    ["space", "spaces"],
  ] as const) {
    const root = path.join(dataDir, folder);
    if (!existsSync(root)) continue;
    for (const entry of readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory() || !VAULT_DIR_NAME.test(entry.name)) continue;
      const dir = path.join(root, entry.name);
      const ref: VaultRef = { kind, id: entry.name };
      out.push({
        kind,
        id: entry.name,
        owner: kind === "user" ? (findById(entry.name)?.username ?? null) : null,
        sizeBytes: dirSize(dir),
        migrationsApplied: getOpenVaultMigrationCount(ref),
        migrationsLatest: latest,
        newestBackupAt: newestMtime(path.join(dir, "backups")),
      });
    }
  }
  return out.sort((a, b) => b.sizeBytes - a.sizeBytes);
}

/** Returns the plaintext token exactly once. */
export function createInvite(
  actorId: string,
  input: { note?: string | null; ttlHours?: number },
  now: number = Date.now(),
): { token: string; inviteId: string; expiresAt: number } {
  const ttl = input.ttlHours ? input.ttlHours * 60 * 60_000 : INVITE_DEFAULT_TTL_MS;
  const { token, invite } = storeCreateInvite({
    createdBy: actorId,
    expiresAt: now + ttl,
    note: input.note,
    now,
  });
  recordAudit({ event: "invite.created", actorId, detail: { inviteId: invite.id } });
  return { token, inviteId: invite.id, expiresAt: invite.expiresAt };
}

export function revokeInvite(actorId: string, inviteId: string): void {
  if (!storeRevokeInvite(inviteId)) {
    throw new DomainError("That invite was already used, revoked or doesn't exist.");
  }
  recordAudit({ event: "invite.revoked", actorId, detail: { inviteId } });
}

function requireTarget(userId: string) {
  const account = findById(userId);
  if (!account) throw new DomainError("That account doesn't exist.");
  return account;
}

/** Disabling ends the user's sessions at once and closes their vault. */
export function setUserStatus(actorId: string, userId: string, status: AccountStatus): void {
  const target = requireTarget(userId);
  if (target.status === status) return;
  if (status === "disabled") {
    if (userId === actorId) throw new DomainError("You can't disable your own account.");
    assertNotLastActiveAdmin(userId);
  }
  setStatus(userId, status);
  if (status === "disabled") {
    endUserSessions(userId, { reason: "disabled" });
    closeVault({ kind: "user", id: userId });
  }
  recordAudit({
    event: "account.status_changed",
    userId,
    actorId,
    detail: { status, targetUserId: userId },
  });
}

export function setUserRole(actorId: string, userId: string, role: AccountRole): void {
  const target = requireTarget(userId);
  if (target.role === role) return;
  if (role !== "admin") assertNotLastActiveAdmin(userId);
  setRole(userId, role);
  recordAudit({
    event: "account.role_changed",
    userId,
    actorId,
    detail: { role, previousRole: target.role, targetUserId: userId },
  });
}

/** `confirmUsername` must match the account's username (typed by the admin). */
export function deleteUser(actorId: string, userId: string, confirmUsername: string): void {
  const target = requireTarget(userId);
  if (normalizeUsername(confirmUsername) !== target.username) {
    throw new DomainError("Type the username exactly to confirm.");
  }
  if (userId === actorId) {
    throw new DomainError("Delete your own account from your account settings instead.");
  }
  assertNotLastActiveAdmin(userId);
  deleteAccountCompletely(userId, actorId);
}
