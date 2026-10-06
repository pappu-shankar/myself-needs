import "server-only";
import { isIPv4, isIPv6 } from "node:net";
import { getRegistryDb } from "./accounts-db";

/**
 * Session history/display copy. The in-memory session registry is the
 * authority on who is signed in; these rows back the Devices list, new-device
 * detection and "sign out that device". Only a user-agent *summary* is stored.
 */

export interface SessionRecord {
  sid: string;
  userId: string;
  createdAt: number;
  lastSeen: number;
  ip: string | null;
  ipPrefix: string | null;
  /** Summary such as "Chrome on macOS" — never the raw header. */
  userAgent: string | null;
  revokedAt: number | null;
}

interface SessionRow {
  sid: string;
  user_id: string;
  created_at: number;
  last_seen: number;
  ip: string | null;
  ip_prefix: string | null;
  user_agent: string | null;
  revoked_at: number | null;
}

function toSession(row: SessionRow): SessionRecord {
  return {
    sid: row.sid,
    userId: row.user_id,
    createdAt: row.created_at,
    lastSeen: row.last_seen,
    ip: row.ip,
    ipPrefix: row.ip_prefix,
    userAgent: row.user_agent,
    revokedAt: row.revoked_at,
  };
}

/** `last_seen` is only rewritten when it is at least this stale, to keep
 * per-request writes off the registry. */
export const TOUCH_INTERVAL_MS = 60_000;
export const SESSION_HISTORY_MS = 90 * 24 * 60 * 60_000;

export interface CreateSessionInput {
  sid: string;
  userId: string;
  ip?: string | null;
  /** The raw User-Agent header; it is summarized before storage. */
  userAgent?: string | null;
  now?: number;
}

export function createSession(input: CreateSessionInput): SessionRecord {
  const now = input.now ?? Date.now();
  const ip = input.ip ? (parseIp(input.ip)?.address ?? null) : null;
  getRegistryDb()
    .prepare(
      `INSERT INTO sessions (sid, user_id, created_at, last_seen, ip, ip_prefix, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.sid,
      input.userId,
      now,
      now,
      ip,
      ip ? ipPrefix(ip) : null,
      input.userAgent == null ? null : summarizeUserAgent(input.userAgent),
    );
  return getSession(input.sid)!;
}

export function getSession(sid: string): SessionRecord | null {
  const row = getRegistryDb().prepare("SELECT * FROM sessions WHERE sid = ?").get(sid) as
    SessionRow | undefined;
  return row ? toSession(row) : null;
}

/** Returns true when the row was updated (it is throttled to once a minute). */
export function touchSession(sid: string, now: number = Date.now()): boolean {
  return (
    getRegistryDb()
      .prepare(
        "UPDATE sessions SET last_seen = ? WHERE sid = ? AND revoked_at IS NULL AND last_seen <= ?",
      )
      .run(now, sid, now - TOUCH_INTERVAL_MS).changes === 1
  );
}

export function revokeSession(sid: string, now: number = Date.now()): boolean {
  return (
    getRegistryDb()
      .prepare("UPDATE sessions SET revoked_at = ? WHERE sid = ? AND revoked_at IS NULL")
      .run(now, sid).changes === 1
  );
}

/** Revokes every live session of the user (optionally sparing one). Returns the
 * revoked sids so the caller can drop them from the in-memory registry. */
export function revokeUserSessions(
  userId: string,
  options: { exceptSid?: string; now?: number } = {},
): string[] {
  const db = getRegistryDb();
  const now = options.now ?? Date.now();
  const rows = db
    .prepare(
      "UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL AND sid != ? RETURNING sid",
    )
    .all(now, userId, options.exceptSid ?? "") as { sid: string }[];
  return rows.map((row) => row.sid);
}

/** Newest first. Revoked sessions are included only when asked for. */
export function listUserSessions(
  userId: string,
  options: { includeRevoked?: boolean; limit?: number } = {},
): SessionRecord[] {
  const limit = Math.min(Math.max(options.limit ?? 100, 1), 500);
  const rows = getRegistryDb()
    .prepare(
      `SELECT * FROM sessions WHERE user_id = ? ${options.includeRevoked ? "" : "AND revoked_at IS NULL"}
       ORDER BY created_at DESC LIMIT ?`,
    )
    .all(userId, limit) as SessionRow[];
  return rows.map(toSession);
}

/**
 * True when the user has signed in before but never with this browser/OS
 * summary from this network prefix. A user's very first session is *not* a new
 * device (there is nothing to compare against, and no one to warn). Call it
 * before `createSession` for the new sign-in.
 */
export function isNewDevice(
  userId: string,
  uaSummary: string | null,
  ipPrefixValue: string | null,
): boolean {
  const db = getRegistryDb();
  const any = db.prepare("SELECT 1 FROM sessions WHERE user_id = ? LIMIT 1").get(userId);
  if (!any) return false;
  const seen = db
    .prepare(
      "SELECT 1 FROM sessions WHERE user_id = ? AND user_agent IS ? AND ip_prefix IS ? LIMIT 1",
    )
    .get(userId, uaSummary, ipPrefixValue);
  return !seen;
}

/** Deletes session history older than 90 days (revoked or long idle). */
export function pruneSessions(now: number = Date.now()): number {
  const cutoff = now - SESSION_HISTORY_MS;
  return getRegistryDb()
    .prepare(
      "DELETE FROM sessions WHERE last_seen < ? OR (revoked_at IS NOT NULL AND revoked_at < ?)",
    )
    .run(cutoff, cutoff).changes;
}

// --- user agent ------------------------------------------------------------

const BROWSERS: [RegExp, string][] = [
  [/\bEdg(?:e|A|iOS)?\//, "Edge"],
  [/\b(?:OPR|Opera)\//, "Opera"],
  [/\bSamsungBrowser\//, "Samsung Internet"],
  [/\bVivaldi\//, "Vivaldi"],
  [/\b(?:Firefox|FxiOS)\//, "Firefox"],
  [/\b(?:Chrome|CriOS|Chromium)\//, "Chrome"],
  [/\bVersion\/[\d.]+.*\bSafari\//, "Safari"],
  [/\bcurl\//, "curl"],
];

const SYSTEMS: [RegExp, string][] = [
  [/\b(?:iPhone|iPod)\b/, "iOS"],
  [/\biPad\b/, "iPadOS"],
  [/\bAndroid\b/, "Android"],
  [/\bCrOS\b/, "ChromeOS"],
  [/\bWindows\b/, "Windows"],
  [/\b(?:Macintosh|Mac OS X)\b/, "macOS"],
  [/\bLinux\b/, "Linux"],
];

/** "Chrome on macOS"-style label; never echoes the raw header. */
export function summarizeUserAgent(ua: string | null | undefined): string {
  const header = (ua ?? "").slice(0, 512);
  const browser = BROWSERS.find(([pattern]) => pattern.test(header))?.[1];
  const system = SYSTEMS.find(([pattern]) => pattern.test(header))?.[1];
  if (browser && system) return `${browser} on ${system}`;
  if (browser) return browser;
  if (system) return `Browser on ${system}`;
  return "Unknown device";
}

// --- IP addresses ----------------------------------------------------------

export interface ParsedIp {
  version: 4 | 6;
  /** Canonical form: dotted IPv4 (IPv4-mapped IPv6 is unwrapped), full IPv6. */
  address: string;
}

export function parseIp(raw: string): ParsedIp | null {
  let ip = raw.trim();
  if (ip.startsWith("[") && ip.endsWith("]")) ip = ip.slice(1, -1);
  const zone = ip.indexOf("%");
  if (zone >= 0) ip = ip.slice(0, zone);
  if (isIPv4(ip)) return { version: 4, address: ip };
  if (!isIPv6(ip)) return null;
  const groups = expandIpv6(ip);
  if (!groups) return null;
  // ::ffff:a.b.c.d — an IPv4 client on a dual-stack socket.
  if (groups.slice(0, 5).every((g) => g === 0) && groups[5] === 0xffff) {
    return {
      version: 4,
      address: [groups[6] >> 8, groups[6] & 255, groups[7] >> 8, groups[7] & 255].join("."),
    };
  }
  return { version: 6, address: groups.map((g) => g.toString(16)).join(":") };
}

/** Network prefix used for "same network" display and new-device detection:
 * IPv4 /24, IPv6 /48 by default. */
export function ipPrefix(ip: string, v6Bits: 48 | 64 = 48): string | null {
  const parsed = parseIp(ip);
  if (!parsed) return null;
  if (parsed.version === 4) {
    const [a, b, c] = parsed.address.split(".");
    return `${a}.${b}.${c}.0/24`;
  }
  const groups = expandIpv6(parsed.address)!;
  const kept = v6Bits / 16;
  return `${groups
    .slice(0, kept)
    .map((g) => g.toString(16))
    .join(":")}::/${v6Bits}`;
}

function expandIpv6(ip: string): number[] | null {
  let text = ip.toLowerCase();
  const tail: number[] = [];
  const v4 = text.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (v4) {
    const octets = v4[1].split(".").map(Number);
    tail.push((octets[0] << 8) | octets[1], (octets[2] << 8) | octets[3]);
    text = text.slice(0, -v4[1].length);
    if (text.endsWith(":") && !text.endsWith("::")) text = text.slice(0, -1);
  }
  const parts = text.split("::");
  if (parts.length > 2) return null;
  const head = parts[0] ? parts[0].split(":") : [];
  const rest = parts.length === 2 && parts[1] ? parts[1].split(":") : [];
  const missing = 8 - tail.length - head.length - rest.length;
  if (parts.length === 1 ? missing !== 0 : missing < 0) return null;
  const groups = [
    ...head.map((h) => parseInt(h, 16)),
    ...new Array<number>(parts.length === 2 ? missing : 0).fill(0),
    ...rest.map((h) => parseInt(h, 16)),
    ...tail,
  ];
  return groups.length === 8 && groups.every((g) => Number.isInteger(g) && g >= 0 && g <= 0xffff)
    ? groups
    : null;
}
