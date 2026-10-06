import "server-only";
import { randomUUID } from "node:crypto";
import type { SpaceRole } from "@/modules/core/db/vault-types";
import { DomainError } from "@/modules/core/errors";
import { isUniqueViolation } from "./accounts-store";
import { getRegistryDb, transaction } from "./accounts-db";

/**
 * Shared-space membership. A space's DEK is never stored in the clear: each
 * member row carries it sealed to that member's public key (`sealed_key`, a
 * serialized SealedBox — opaque to this store).
 */

export type { SpaceRole };

export interface Space {
  id: string;
  name: string;
  createdBy: string | null;
  createdAt: number;
}

export interface SpaceMembership {
  space: Space;
  role: SpaceRole;
  sealedKey: string;
}

export interface SpaceMember {
  userId: string;
  username: string;
  displayName: string | null;
  role: SpaceRole;
  addedAt: number;
}

interface SpaceRow {
  id: string;
  name: string;
  created_by: string | null;
  created_at: number;
}

function toSpace(row: SpaceRow): Space {
  return { id: row.id, name: row.name, createdBy: row.created_by, createdAt: row.created_at };
}

const NAME_MAX = 60;

function cleanName(name: string): string {
  const trimmed = name.normalize("NFKC").trim();
  if (!trimmed) throw new DomainError("Give the space a name.");
  if ([...trimmed].length > NAME_MAX) {
    throw new DomainError(`Space names can be at most ${NAME_MAX} characters.`);
  }
  return trimmed;
}

export interface CreateSpaceInput {
  name: string;
  ownerId: string;
  sealedKeyForOwner: string;
  /** Lets the caller create the vault directory first and reuse its id. */
  id?: string;
  now?: number;
}

/** Creates the space with its creator as the sole owner. */
export function createSpace(input: CreateSpaceInput): Space {
  const name = cleanName(input.name);
  const id = input.id ?? randomUUID();
  const now = input.now ?? Date.now();
  transaction(() => {
    const db = getRegistryDb();
    db.prepare("INSERT INTO spaces (id, name, created_by, created_at) VALUES (?, ?, ?, ?)").run(
      id,
      name,
      input.ownerId,
      now,
    );
    db.prepare(
      `INSERT INTO space_members (space_id, user_id, role, sealed_key, added_at)
       VALUES (?, ?, 'owner', ?, ?)`,
    ).run(id, input.ownerId, input.sealedKeyForOwner, now);
  });
  return getSpace(id)!;
}

export function getSpace(id: string): Space | null {
  const row = getRegistryDb().prepare("SELECT * FROM spaces WHERE id = ?").get(id) as
    SpaceRow | undefined;
  return row ? toSpace(row) : null;
}

export function renameSpace(id: string, name: string): boolean {
  return (
    getRegistryDb().prepare("UPDATE spaces SET name = ? WHERE id = ?").run(cleanName(name), id)
      .changes === 1
  );
}

/** Removes the space row and (cascading) its memberships. The caller wipes the vault dir. */
export function deleteSpace(id: string): boolean {
  return getRegistryDb().prepare("DELETE FROM spaces WHERE id = ?").run(id).changes === 1;
}

export function listSpacesForUser(userId: string): SpaceMembership[] {
  const rows = getRegistryDb()
    .prepare(
      `SELECT s.*, m.role AS member_role, m.sealed_key AS member_sealed_key
       FROM space_members m JOIN spaces s ON s.id = m.space_id
       WHERE m.user_id = ? ORDER BY s.name COLLATE NOCASE, s.created_at`,
    )
    .all(userId) as (SpaceRow & { member_role: SpaceRole; member_sealed_key: string })[];
  return rows.map((row) => ({
    space: toSpace(row),
    role: row.member_role,
    sealedKey: row.member_sealed_key,
  }));
}

export function getMembership(
  spaceId: string,
  userId: string,
): { role: SpaceRole; sealedKey: string } | null {
  const row = getRegistryDb()
    .prepare("SELECT role, sealed_key FROM space_members WHERE space_id = ? AND user_id = ?")
    .get(spaceId, userId) as { role: SpaceRole; sealed_key: string } | undefined;
  return row ? { role: row.role, sealedKey: row.sealed_key } : null;
}

export interface AddMemberInput {
  spaceId: string;
  userId: string;
  role: SpaceRole;
  sealedKey: string;
  now?: number;
}

export function addMember(input: AddMemberInput): void {
  try {
    getRegistryDb()
      .prepare(
        `INSERT INTO space_members (space_id, user_id, role, sealed_key, added_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(input.spaceId, input.userId, input.role, input.sealedKey, input.now ?? Date.now());
  } catch (err) {
    if (isUniqueViolation(err)) throw new DomainError("That person is already a member.");
    throw err;
  }
}

/** Throws `DomainError` when demoting the space's last owner. */
export function setMemberRole(spaceId: string, userId: string, role: SpaceRole): boolean {
  return transaction(() => {
    const current = getMembership(spaceId, userId);
    if (!current) return false;
    if (current.role === "owner" && role !== "owner") assertNotLastOwner(spaceId);
    return (
      getRegistryDb()
        .prepare("UPDATE space_members SET role = ? WHERE space_id = ? AND user_id = ?")
        .run(role, spaceId, userId).changes === 1
    );
  });
}

/** Throws `DomainError` when removing the space's last owner. The caller
 * re-keys the space afterwards (`replaceSealedKeys`). */
export function removeMember(spaceId: string, userId: string): boolean {
  return transaction(() => {
    const current = getMembership(spaceId, userId);
    if (!current) return false;
    if (current.role === "owner") assertNotLastOwner(spaceId);
    return (
      getRegistryDb()
        .prepare("DELETE FROM space_members WHERE space_id = ? AND user_id = ?")
        .run(spaceId, userId).changes === 1
    );
  });
}

export function listMembers(spaceId: string): SpaceMember[] {
  const rows = getRegistryDb()
    .prepare(
      `SELECT m.user_id, a.username, a.display_name, m.role, m.added_at
       FROM space_members m JOIN accounts a ON a.id = m.user_id
       WHERE m.space_id = ?
       ORDER BY CASE m.role WHEN 'owner' THEN 0 WHEN 'editor' THEN 1 ELSE 2 END, a.username`,
    )
    .all(spaceId) as {
    user_id: string;
    username: string;
    display_name: string | null;
    role: SpaceRole;
    added_at: number;
  }[];
  return rows.map((row) => ({
    userId: row.user_id,
    username: row.username,
    displayName: row.display_name,
    role: row.role,
    addedAt: row.added_at,
  }));
}

export function countOwners(spaceId: string): number {
  return (
    getRegistryDb()
      .prepare("SELECT COUNT(*) AS n FROM space_members WHERE space_id = ? AND role = 'owner'")
      .get(spaceId) as { n: number }
  ).n;
}

export function assertNotLastOwner(spaceId: string): void {
  if (countOwners(spaceId) <= 1) {
    throw new DomainError("A space needs at least one owner. Make someone else an owner first.");
  }
}

/** Spaces where `userId` is the only owner — deleting that account would
 * orphan them, so the caller must resolve these first. */
export function listSpacesSolelyOwnedBy(userId: string): Space[] {
  const rows = getRegistryDb()
    .prepare(
      `SELECT s.* FROM spaces s JOIN space_members m ON m.space_id = s.id
       WHERE m.user_id = ? AND m.role = 'owner'
         AND (SELECT COUNT(*) FROM space_members o WHERE o.space_id = s.id AND o.role = 'owner') = 1`,
    )
    .all(userId) as SpaceRow[];
  return rows.map(toSpace);
}

/**
 * Re-key: swaps every member's sealed key in one transaction. The map must
 * cover exactly the current members — a missing or extra user throws (nothing
 * is written), so no member is ever left holding the old key.
 */
export function replaceSealedKeys(spaceId: string, sealedKeys: Map<string, string>): void {
  transaction(() => {
    const db = getRegistryDb();
    const members = (
      db.prepare("SELECT user_id FROM space_members WHERE space_id = ?").all(spaceId) as {
        user_id: string;
      }[]
    ).map((row) => row.user_id);
    const sameSet =
      members.length === sealedKeys.size && members.every((userId) => sealedKeys.has(userId));
    if (!sameSet) {
      throw new DomainError("Space membership changed while re-keying. Try again.");
    }
    const update = db.prepare(
      "UPDATE space_members SET sealed_key = ? WHERE space_id = ? AND user_id = ?",
    );
    for (const [userId, sealedKey] of sealedKeys) update.run(sealedKey, spaceId, userId);
  });
}

// --- module visibility + pending re-key (registry v2) ----------------------

/** App modules a space can show. Kept here (not in the vault) so the sidebar
 * can be built without opening the space's database. */
export const SPACE_MODULES = ["finance", "health", "mental", "plans", "house", "fashion"] as const;
export type SpaceModule = (typeof SPACE_MODULES)[number];

function parseModules(text: string | null | undefined): SpaceModule[] {
  try {
    const value = JSON.parse(text ?? "[]") as unknown;
    if (!Array.isArray(value)) return [];
    return SPACE_MODULES.filter((name) => value.includes(name));
  } catch {
    return [];
  }
}

export function getSpaceModules(spaceId: string): SpaceModule[] {
  const row = getRegistryDb().prepare("SELECT modules FROM spaces WHERE id = ?").get(spaceId) as
    { modules: string } | undefined;
  return parseModules(row?.modules);
}

/** Unknown names are dropped; order follows `SPACE_MODULES`. */
export function setSpaceModules(spaceId: string, modules: readonly string[]): SpaceModule[] {
  const clean = SPACE_MODULES.filter((name) => modules.includes(name));
  getRegistryDb()
    .prepare("UPDATE spaces SET modules = ? WHERE id = ?")
    .run(JSON.stringify(clean), spaceId);
  return clean;
}

export function markRekeyPending(spaceId: string): void {
  getRegistryDb().prepare("UPDATE spaces SET rekey_pending = 1 WHERE id = ?").run(spaceId);
}

export function clearRekeyPending(spaceId: string): void {
  getRegistryDb().prepare("UPDATE spaces SET rekey_pending = 0 WHERE id = ?").run(spaceId);
}

export function isRekeyPending(spaceId: string): boolean {
  const row = getRegistryDb()
    .prepare("SELECT rekey_pending FROM spaces WHERE id = ?")
    .get(spaceId) as { rekey_pending: number } | undefined;
  return row?.rekey_pending === 1;
}
