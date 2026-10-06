import "server-only";
import { listAudit, listDismissedAlerts, type AuditEntry } from "./audit-store";

/**
 * Security notices shown to a user about their own account, derived from the
 * audit log (pure rules, so they're easy to test) minus the ones they dismissed.
 */

export type AlertKind = "failed-logins" | "new-device" | "recovery-used" | "admin-changed";

export interface SecurityAlert {
  /** Stable id, used to dismiss it. */
  id: string;
  kind: AlertKind;
  severity: "info" | "warning";
  at: number;
  title: string;
  message: string;
}

export const ALERT_WINDOW_MS = 30 * 24 * 60 * 60_000;
export const FAILED_LOGIN_WINDOW_MS = 24 * 60 * 60_000;
export const FAILED_LOGIN_THRESHOLD = 5;

export const ALERT_EVENTS = [
  "login.failed",
  "login.new_device",
  "recovery.used",
  "account.status_changed",
  "account.role_changed",
] as const;

/** `entries` are one user's audit rows (any order). */
export function computeAlerts(
  userId: string,
  entries: readonly AuditEntry[],
  dismissed: ReadonlySet<string>,
  now: number = Date.now(),
): SecurityAlert[] {
  const alerts: SecurityAlert[] = [];
  const recent = entries.filter((e) => e.userId === userId && e.at >= now - ALERT_WINDOW_MS);

  const failures = recent
    .filter((e) => e.event === "login.failed" && e.at >= now - FAILED_LOGIN_WINDOW_MS)
    .sort((a, b) => b.at - a.at || b.id - a.id);
  if (failures.length >= FAILED_LOGIN_THRESHOLD) {
    alerts.push({
      id: `failed:${failures[0].id}`,
      kind: "failed-logins",
      severity: "warning",
      at: failures[0].at,
      title: "Failed sign-in attempts",
      message: `${failures.length} wrong-password attempts on your account in the last 24 hours. If that wasn't you, consider changing your password.`,
    });
  }

  for (const entry of recent) {
    const ua = typeof entry.detail?.uaSummary === "string" ? entry.detail.uaSummary : null;
    if (entry.event === "login.new_device") {
      alerts.push({
        id: `device:${entry.id}`,
        kind: "new-device",
        severity: "info",
        at: entry.at,
        title: "New device signed in",
        message: `Your account was signed in from a new device${ua ? ` (${ua})` : ""}. If that wasn't you, sign out that device and change your password.`,
      });
    } else if (entry.event === "recovery.used") {
      alerts.push({
        id: `recovery:${entry.id}`,
        kind: "recovery-used",
        severity: "warning",
        at: entry.at,
        title: "Recovery key used",
        message:
          "Your recovery key was used to reset your password. If that wasn't you, rotate your recovery key now.",
      });
    } else if (
      (entry.event === "account.status_changed" || entry.event === "account.role_changed") &&
      entry.actorId &&
      entry.actorId !== userId
    ) {
      alerts.push({
        id: `admin:${entry.id}`,
        kind: "admin-changed",
        severity: "info",
        at: entry.at,
        title: "An admin changed your account",
        message:
          entry.event === "account.role_changed"
            ? `An admin changed your role${entry.detail?.role ? ` to ${String(entry.detail.role)}` : ""}.`
            : `An admin changed your account status${entry.detail?.status ? ` to ${String(entry.detail.status)}` : ""}.`,
      });
    }
  }

  return alerts.filter((a) => !dismissed.has(a.id)).sort((a, b) => b.at - a.at);
}

export function listMyAlerts(userId: string, now: number = Date.now()): SecurityAlert[] {
  const entries = listAudit({
    userId,
    since: now - ALERT_WINDOW_MS,
    events: [...ALERT_EVENTS],
    limit: 500,
  });
  return computeAlerts(userId, entries, listDismissedAlerts(userId), now);
}
