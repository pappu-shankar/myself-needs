import "server-only";
import type { RequestScope } from "@/modules/core/db/vault-types";
import { getConfig } from "@/modules/core/env/config";
import { getLiveSession } from "@/modules/core/session/session-registry";
import {
  listMySpaces as listSpaces,
  type SpaceSummary,
} from "@/modules/core/spaces/spaces-service";
import { findById, listAccounts } from "./accounts-store";
import { listAudit, type AuditEntry } from "./audit-store";
import { getAvatarVersion } from "./avatar";
import { peekInvite } from "./invites";
import { ipPrefix, listUserSessions } from "./sessions-store";

/**
 * Read-only data getters for the auth/account/admin pages. Admin getters live
 * in admin-service.ts (`listUsersForAdmin`, `listInvitesForAdmin`,
 * `getHealthStats`); alerts in security-alerts.ts (`listMyAlerts`).
 */

export { getInstallState, type InstallState } from "./install-state";
export { announceSetupToken } from "./setup-token";
export { listMyAlerts, type SecurityAlert } from "./security-alerts";
export {
  listUsersForAdmin,
  listInvitesForAdmin,
  getHealthStats,
  listRecentSecurityEventsForAdmin,
  getVaultStorageStats,
  type AdminSecurityEvent,
  type VaultStorageStat,
} from "./admin-service";

export interface PickerProfile {
  username: string;
  displayName: string | null;
  color: string | null;
  hasAvatar: boolean;
  /** For the avatar URL. */
  id: string;
}

/** Active accounts for the login page's profile picker — empty unless
 * `APP_PROFILE_PICKER` is on (it reveals usernames). */
export function listProfilesForPicker(): PickerProfile[] {
  if (!getConfig().profilePicker) return [];
  return listAccounts()
    .filter((a) => a.status === "active")
    .map((a) => ({
      id: a.id,
      username: a.username,
      displayName: a.displayName,
      color: a.color,
      hasAvatar: a.hasAvatar,
    }));
}

/** Whether an invite link can still be used (for the sign-up page). */
export function getInvitePreview(token: string): { valid: boolean; expiresAt: number | null } {
  const invite = peekInvite(token);
  return { valid: Boolean(invite), expiresAt: invite?.expiresAt ?? null };
}

export interface MyProfile {
  id: string;
  username: string;
  displayName: string | null;
  color: string | null;
  hasAvatar: boolean;
  /** Avatar file mtime (ms) for the versioned avatar URL; null without a picture. */
  avatarVersion: number | null;
  role: "admin" | "member";
  createdAt: number;
  lastLoginAt: number | null;
}

export function getMyProfile(scope: RequestScope): MyProfile | null {
  const a = findById(scope.userId);
  if (!a) return null;
  return {
    id: a.id,
    username: a.username,
    displayName: a.displayName,
    color: a.color,
    hasAvatar: a.hasAvatar,
    avatarVersion: a.hasAvatar ? getAvatarVersion(a.id) : null,
    role: a.role,
    createdAt: a.createdAt,
    lastLoginAt: a.lastLoginAt,
  };
}

export interface MySession {
  sid: string;
  device: string | null;
  ipPrefix: string | null;
  createdAt: number;
  lastSeen: number;
  current: boolean;
  /** Still signed in on this server (history rows can outlive a restart). */
  live: boolean;
}

export function listMySessions(scope: RequestScope): MySession[] {
  return listUserSessions(scope.userId).map((s) => ({
    sid: s.sid,
    device: s.userAgent,
    ipPrefix: s.ipPrefix,
    createdAt: s.createdAt,
    lastSeen: s.lastSeen,
    current: s.sid === scope.sessionId,
    live: getLiveSession(s.sid) !== null,
  }));
}

export function listMySpaces(scope: RequestScope): (SpaceSummary & { active: boolean })[] {
  return listSpaces(scope.userId).map((s) => ({
    ...s,
    active: scope.vault.kind === "space" && scope.vault.id === s.id,
  }));
}

// ---------------------------------------------------------------------------
// Security log ("Recent activity")
// ---------------------------------------------------------------------------

const MY_EVENT_LABELS: Record<string, string> = {
  "login.succeeded": "Signed in",
  "login.failed": "Wrong password entered",
  "login.disabled": "Sign-in refused (account disabled)",
  "login.new_device": "Signed in from a new device",
  "recovery.failed": "Wrong recovery key entered",
  "recovery.used": "Password reset with recovery key",
  "recovery.rotated": "Recovery key replaced",
  "password.changed": "Password changed",
  logout: "Signed out",
  "logout.everywhere": "Signed out everywhere",
  "session.revoked": "Device signed out",
  "session.idle_locked": "Locked after inactivity",
  "account.created": "Account created",
  "account.status_changed": "Account status changed",
  "account.role_changed": "Account role changed",
  "invite.accepted": "Joined with an invite",
  "setup.completed": "Server set up",
  "legacy.claimed": "Existing vault claimed",
};

const VIA_LABELS: Record<string, string> = {
  password: "password",
  recovery: "recovery key",
  invite: "invite",
  setup: "setup",
  claim: "vault claim",
};

export interface MyAuditEvent {
  id: number;
  at: number;
  event: string;
  /** Human-readable description of the event. */
  label: string;
  /** First part of the IP address only (/24 or /48) — never the full address. */
  network: string | null;
  device: string | null;
  /** Short extra context ("via recovery key", "by an admin", "3 sessions"). */
  note: string | null;
}

function myEventNote(entry: AuditEntry, userId: string): string | null {
  const d = entry.detail ?? {};
  const parts: string[] = [];
  if (typeof d.via === "string" && VIA_LABELS[d.via]) parts.push(`via ${VIA_LABELS[d.via]}`);
  if (entry.event === "account.role_changed" && typeof d.role === "string") {
    parts.push(`now ${d.role}`);
  }
  if (entry.event === "account.status_changed" && typeof d.status === "string") {
    parts.push(`now ${d.status}`);
  }
  if (typeof d.count === "number" && d.count > 0) {
    parts.push(`${d.count} session${d.count === 1 ? "" : "s"}`);
  }
  if (entry.actorId && entry.actorId !== userId) parts.push("by an admin");
  return parts.length > 0 ? parts.join(", ") : null;
}

/** The signed-in user's own security log, newest first. Only labelled events
 * and allow-listed detail are returned; IPs are cut to a network prefix. */
export function listMyAuditEvents(
  userId: string,
  { limit = 25 }: { limit?: number } = {},
): MyAuditEvent[] {
  return listAudit({ userId, events: Object.keys(MY_EVENT_LABELS), limit }).map((e) => {
    const fromDetail = e.detail?.ipPrefix;
    const ua = e.detail?.uaSummary;
    return {
      id: e.id,
      at: e.at,
      event: e.event,
      label: MY_EVENT_LABELS[e.event],
      network: typeof fromDetail === "string" ? fromDetail : e.ip ? ipPrefix(e.ip) : null,
      device: typeof ua === "string" ? ua : null,
      note: myEventNote(e, userId),
    };
  });
}
