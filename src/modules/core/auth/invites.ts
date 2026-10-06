import "server-only";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { DomainError } from "@/modules/core/errors";
import { getRegistryDb } from "./accounts-db";

/**
 * Single-use invite links. The token (32 random bytes, base64url) is shown to
 * the admin once; only its SHA-256 is stored. Redemption is one conditional
 * UPDATE, so two concurrent redeems can never both succeed.
 */

export const INVITE_DEFAULT_TTL_MS = 72 * 60 * 60_000;
export const INVITE_MAX_TTL_MS = 14 * 24 * 60 * 60_000;
const NOTE_MAX = 200;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export type InviteState = "pending" | "used" | "revoked" | "expired";

export interface Invite {
  id: string;
  createdBy: string | null;
  createdAt: number;
  expiresAt: number;
  usedAt: number | null;
  usedBy: string | null;
  revokedAt: number | null;
  note: string | null;
}

interface InviteRow {
  id: string;
  token_hash: string;
  created_by: string | null;
  created_at: number;
  expires_at: number;
  used_at: number | null;
  used_by: string | null;
  revoked_at: number | null;
  note: string | null;
}

function toInvite(row: InviteRow): Invite {
  return {
    id: row.id,
    createdBy: row.created_by,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    usedAt: row.used_at,
    usedBy: row.used_by,
    revokedAt: row.revoked_at,
    note: row.note,
  };
}

export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function inviteState(invite: Invite, now: number = Date.now()): InviteState {
  if (invite.usedAt !== null) return "used";
  if (invite.revokedAt !== null) return "revoked";
  if (invite.expiresAt <= now) return "expired";
  return "pending";
}

export interface CreateInviteInput {
  createdBy: string | null;
  /** Defaults to 72 h from now; at most 14 days ahead. */
  expiresAt?: number;
  note?: string | null;
  now?: number;
}

/** Returns the plaintext token exactly once — it is not recoverable later. */
export function createInvite(input: CreateInviteInput): { token: string; invite: Invite } {
  const now = input.now ?? Date.now();
  const expiresAt = input.expiresAt ?? now + INVITE_DEFAULT_TTL_MS;
  if (!Number.isFinite(expiresAt) || expiresAt <= now) {
    throw new DomainError("The invite's expiry must be in the future.");
  }
  if (expiresAt - now > INVITE_MAX_TTL_MS) {
    throw new DomainError("Invites can last at most 14 days.");
  }
  const note = input.note?.trim() ? input.note.trim() : null;
  if (note && [...note].length > NOTE_MAX) {
    throw new DomainError(`The note can be at most ${NOTE_MAX} characters.`);
  }
  const token = randomBytes(32).toString("base64url");
  const id = randomUUID();
  getRegistryDb()
    .prepare(
      `INSERT INTO invites (id, token_hash, created_by, created_at, expires_at, note)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(id, hashInviteToken(token), input.createdBy, now, expiresAt, note);
  return { token, invite: getInvite(id)! };
}

export function getInvite(id: string): Invite | null {
  const row = getRegistryDb().prepare("SELECT * FROM invites WHERE id = ?").get(id) as
    InviteRow | undefined;
  return row ? toInvite(row) : null;
}

/** The invite if `token` is currently redeemable, without consuming it (for
 * rendering the sign-up form). */
export function peekInvite(token: string, now: number = Date.now()): Invite | null {
  if (!TOKEN_PATTERN.test(token)) return null;
  const row = getRegistryDb()
    .prepare(
      `SELECT * FROM invites WHERE token_hash = ?
         AND used_at IS NULL AND revoked_at IS NULL AND expires_at > ?`,
    )
    .get(hashInviteToken(token), now) as InviteRow | undefined;
  return row ? toInvite(row) : null;
}

/**
 * Atomically marks the invite used. `null` for an unknown, expired, revoked or
 * already-used token (deliberately indistinguishable). Run it inside
 * `transaction()` together with `createAccount` + `markInviteUsedBy` so a
 * failed sign-up rolls the redemption back.
 */
export function redeemInvite(token: string, now: number = Date.now()): Invite | null {
  if (!TOKEN_PATTERN.test(token)) return null;
  const row = getRegistryDb()
    .prepare(
      `UPDATE invites SET used_at = ?
       WHERE token_hash = ? AND used_at IS NULL AND revoked_at IS NULL AND expires_at > ?
       RETURNING *`,
    )
    .get(now, hashInviteToken(token), now) as InviteRow | undefined;
  return row ? toInvite(row) : null;
}

/** Records which account an already-redeemed invite created. */
export function markInviteUsedBy(inviteId: string, userId: string): void {
  getRegistryDb()
    .prepare("UPDATE invites SET used_by = ? WHERE id = ? AND used_at IS NOT NULL")
    .run(userId, inviteId);
}

/** Newest first. */
export function listInvites(options: { limit?: number } = {}): Invite[] {
  const limit = Math.min(Math.max(options.limit ?? 200, 1), 1000);
  const rows = getRegistryDb()
    .prepare("SELECT * FROM invites ORDER BY created_at DESC LIMIT ?")
    .all(limit) as InviteRow[];
  return rows.map(toInvite);
}

/** Revokes a not-yet-used invite. False when it was already used/revoked/missing. */
export function revokeInvite(id: string, now: number = Date.now()): boolean {
  return (
    getRegistryDb()
      .prepare(
        "UPDATE invites SET revoked_at = ? WHERE id = ? AND used_at IS NULL AND revoked_at IS NULL",
      )
      .run(now, id).changes === 1
  );
}

/** Deletes finished (used/revoked/expired) invites older than `olderThanMs`. */
export function pruneInvites(
  now: number = Date.now(),
  olderThanMs = 90 * 24 * 60 * 60_000,
): number {
  const cutoff = now - olderThanMs;
  return getRegistryDb()
    .prepare(
      `DELETE FROM invites WHERE created_at < ?
         AND (used_at IS NOT NULL OR revoked_at IS NOT NULL OR expires_at <= ?)`,
    )
    .run(cutoff, now).changes;
}
