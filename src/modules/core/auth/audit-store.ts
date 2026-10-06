import "server-only";
import { getRegistryDb } from "./accounts-db";

/**
 * Security log. Rows hold lifecycle metadata only — never passwords, recovery
 * keys, tokens, typed usernames or record data. `detail` is filtered to an
 * allow-list of keys with short scalar values; anything else is dropped.
 * Each event is also echoed to the console as one JSON line.
 */

export const AUDIT_RETENTION_MS = 90 * 24 * 60 * 60_000;
export const AUDIT_MAX_ROWS = 5_000;
const PRUNE_EVERY = 50;
const DETAIL_STRING_MAX = 120;

export const AUDIT_DETAIL_KEYS = [
  "reason",
  "count",
  "status",
  "role",
  "previousRole",
  "spaceId",
  "inviteId",
  "targetUserId",
  "sessionId",
  "uaSummary",
  "ipPrefix",
  "newDevice",
  "retryAfterMs",
  "via",
] as const;

export type AuditDetailKey = (typeof AUDIT_DETAIL_KEYS)[number];
export type AuditDetail = Partial<Record<AuditDetailKey, string | number | boolean | null>>;

const ALLOWED = new Set<string>(AUDIT_DETAIL_KEYS);
const EVENT_PATTERN = /^[a-z][a-z0-9_.-]{1,63}$/;

export interface AuditEntry {
  id: number;
  at: number;
  event: string;
  userId: string | null;
  actorId: string | null;
  ip: string | null;
  detail: AuditDetail | null;
}

interface AuditRow {
  id: number;
  at: number;
  event: string;
  user_id: string | null;
  actor_id: string | null;
  ip: string | null;
  detail: string | null;
}

export interface RecordAuditInput {
  /** Dotted lower-case name, e.g. "login.failed", "invite.created". */
  event: string;
  /** The account the event is about. */
  userId?: string | null;
  /** Who did it, when different (e.g. the admin). */
  actorId?: string | null;
  ip?: string | null;
  detail?: Record<string, unknown> | null;
  now?: number;
}

/** Keeps only allow-listed keys with scalar values (strings truncated). */
export function sanitizeAuditDetail(
  detail: Record<string, unknown> | null | undefined,
): AuditDetail | null {
  if (!detail) return null;
  const out: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(detail)) {
    if (!ALLOWED.has(key)) continue;
    if (value === null || typeof value === "boolean") out[key] = value;
    else if (typeof value === "number" && Number.isFinite(value)) out[key] = value;
    else if (typeof value === "string") out[key] = value.slice(0, DETAIL_STRING_MAX);
  }
  return Object.keys(out).length > 0 ? (out as AuditDetail) : null;
}

let insertsSincePrune = 0;

export function recordAudit(input: RecordAuditInput): void {
  if (!EVENT_PATTERN.test(input.event)) {
    throw new Error(`recordAudit: invalid event name "${input.event}"`);
  }
  const at = input.now ?? Date.now();
  const detail = sanitizeAuditDetail(input.detail);
  const ip = input.ip ? input.ip.slice(0, 64) : null;
  getRegistryDb()
    .prepare(
      "INSERT INTO audit (at, event, user_id, actor_id, ip, detail) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .run(
      at,
      input.event,
      input.userId ?? null,
      input.actorId ?? null,
      ip,
      detail ? JSON.stringify(detail) : null,
    );
  console.info(
    JSON.stringify({
      at: new Date(at).toISOString(),
      event: input.event,
      userId: input.userId ?? undefined,
      actorId: input.actorId ?? undefined,
      ...(detail ?? {}),
    }),
  );
  if (++insertsSincePrune >= PRUNE_EVERY) {
    insertsSincePrune = 0;
    pruneAudit(at);
  }
}

/** Drops entries older than 90 days, then keeps only the newest 5000. */
export function pruneAudit(now: number = Date.now()): number {
  const db = getRegistryDb();
  let removed = db.prepare("DELETE FROM audit WHERE at < ?").run(now - AUDIT_RETENTION_MS).changes;
  removed += db
    .prepare(
      `DELETE FROM audit WHERE id <= (SELECT id FROM audit ORDER BY id DESC LIMIT 1 OFFSET ?)`,
    )
    .run(AUDIT_MAX_ROWS).changes;
  return removed;
}

export interface ListAuditOptions {
  userId?: string;
  since?: number;
  events?: string[];
  limit?: number;
}

/** Newest first; `limit` defaults to 100, capped at 1000. */
export function listAudit(options: ListAuditOptions = {}): AuditEntry[] {
  const where: string[] = [];
  const params: (string | number)[] = [];
  if (options.userId !== undefined) {
    where.push("user_id = ?");
    params.push(options.userId);
  }
  if (options.since !== undefined) {
    where.push("at >= ?");
    params.push(options.since);
  }
  if (options.events && options.events.length > 0) {
    where.push(`event IN (${options.events.map(() => "?").join(", ")})`);
    params.push(...options.events);
  }
  const limit = Math.min(Math.max(options.limit ?? 100, 1), 1000);
  const rows = getRegistryDb()
    .prepare(
      `SELECT * FROM audit ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
       ORDER BY at DESC, id DESC LIMIT ?`,
    )
    .all(...params, limit) as AuditRow[];
  return rows.map((row) => ({
    id: row.id,
    at: row.at,
    event: row.event,
    userId: row.user_id,
    actorId: row.actor_id,
    ip: row.ip,
    detail: row.detail ? (JSON.parse(row.detail) as AuditDetail) : null,
  }));
}

/** Count of `event` rows since `since`, optionally for one user (dashboards/alerts). */
export function countAudit(event: string, since: number, userId?: string): number {
  const row = getRegistryDb()
    .prepare(
      `SELECT COUNT(*) AS n FROM audit WHERE event = ? AND at >= ? ${userId ? "AND user_id = ?" : ""}`,
    )
    .get(...(userId ? [event, since, userId] : [event, since])) as { n: number };
  return row.n;
}

// --- dismissed alerts ------------------------------------------------------

export function dismissAlert(userId: string, alertId: string, now: number = Date.now()): void {
  getRegistryDb()
    .prepare(
      `INSERT INTO alerts_dismissed (user_id, alert_id, at) VALUES (?, ?, ?)
       ON CONFLICT (user_id, alert_id) DO NOTHING`,
    )
    .run(userId, alertId.slice(0, 200), now);
}

export function listDismissedAlerts(userId: string): Set<string> {
  const rows = getRegistryDb()
    .prepare("SELECT alert_id FROM alerts_dismissed WHERE user_id = ?")
    .all(userId) as { alert_id: string }[];
  return new Set(rows.map((row) => row.alert_id));
}

/** Test helper. */
export function resetAuditPruneCounter(): void {
  insertsSincePrune = 0;
}
