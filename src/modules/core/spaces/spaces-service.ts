import "server-only";
import { randomBytes, randomUUID } from "node:crypto";
import { existsSync, renameSync, rmSync } from "node:fs";
import path from "node:path";
import { findById, findByUsername } from "@/modules/core/auth/accounts-store";
import { transaction } from "@/modules/core/auth/accounts-db";
import { recordAudit } from "@/modules/core/auth/audit-store";
import * as store from "@/modules/core/auth/spaces-store";
import type { Space, SpaceMember, SpaceModule } from "@/modules/core/auth/spaces-store";
import { closeVault, isVaultOpen, openVault, rekeyVault } from "@/modules/core/db/client";
import {
  decodeSealedBox,
  encodeSealedBox,
  openIdentity,
  seal,
  unseal,
} from "@/modules/core/db/sealing";
import type { SpaceRole, VaultRef } from "@/modules/core/db/vault-types";
import { assertSafeId, getDataDir, getUserDir } from "@/modules/core/env/paths";
import { DomainError, VaultStateError } from "@/modules/core/errors";
import { logError } from "@/modules/core/log";
import {
  cacheKey,
  forgetKey,
  forgetKeyForEveryone,
  getCachedKey,
  replaceCachedKey,
  setSessionVault,
  usersHoldingKey,
} from "@/modules/core/session/session-registry";

/**
 * Shared spaces: a vault (its own SQLCipher database) that several users can
 * open. Its DEK exists in the clear only in memory; at rest it is stored only
 * sealed to each member's X25519 public key (`space_members.sealed_key`).
 * Membership and roles live in the account registry; owner checks happen here.
 *
 * Removing a member re-keys the vault (`PRAGMA rekey` to a fresh DEK, resealed
 * to the remaining members in one registry transaction), so a removed member's
 * old key no longer opens it.
 */

export interface Actor {
  userId: string;
  sessionId?: string;
}

export interface SpaceSummary {
  id: string;
  name: string;
  role: SpaceRole;
  modules: SpaceModule[];
  memberCount: number;
  createdAt: number;
}

const spaceRef = (id: string): VaultRef => ({ kind: "space", id });
const userRef = (id: string): VaultRef => ({ kind: "user", id });

function newDek(): string {
  return randomBytes(32).toString("hex");
}

/** The caller's own personal DEK, from the session key cache. */
function personalDek(userId: string): string {
  const dek = getCachedKey(userId, userRef(userId));
  if (!dek) throw new VaultStateError("Your session has expired — sign in again");
  return dek;
}

function publicKeyOf(userId: string): string {
  const account = findById(userId);
  if (!account) throw new DomainError("That account no longer exists.");
  return account.publicKey;
}

function requireOwner(actor: Actor, spaceId: string): void {
  const membership = store.getMembership(spaceId, actor.userId);
  if (!membership) throw new DomainError("That space doesn't exist or you're not a member.");
  if (membership.role !== "owner") throw new DomainError("Only the space's owners can do that.");
}

/** The space DEK for `userId`: from the cache, else unsealed with their identity
 * key (which their cached personal DEK opens). Caches it. Null when they aren't
 * a member or their sealed key can't be opened. */
export function resolveSpaceKey(
  userId: string,
  spaceId: string,
): { role: SpaceRole; dek: string } | null {
  const membership = store.getMembership(spaceId, userId);
  if (!membership) {
    forgetKey(userId, spaceRef(spaceId));
    return null;
  }
  const cached = getCachedKey(userId, spaceRef(spaceId));
  if (cached) return { role: membership.role, dek: cached };
  const ownDek = getCachedKey(userId, userRef(userId));
  if (!ownDek) return null;
  try {
    const privateKey = openIdentity(getUserDir(userId), ownDek);
    const dek = unseal(decodeSealedBox(membership.sealedKey), privateKey).toString("hex");
    cacheKey(userId, spaceRef(spaceId), dek);
    return { role: membership.role, dek };
  } catch (err) {
    logError("spaces:unseal", err);
    return null;
  }
}

/**
 * Unseals every space key the user can open, given their personal DEK — used at
 * sign-in. Returns spaceId → DEK; spaces whose key fails to open are skipped.
 */
export function unsealSpaceKeys(userId: string, personalDekHex: string): Map<string, string> {
  const keys = new Map<string, string>();
  const memberships = store.listSpacesForUser(userId);
  if (memberships.length === 0) return keys;
  let privateKey;
  try {
    privateKey = openIdentity(getUserDir(userId), personalDekHex);
  } catch (err) {
    logError("spaces:identity", err);
    return keys;
  }
  for (const membership of memberships) {
    try {
      keys.set(
        membership.space.id,
        unseal(decodeSealedBox(membership.sealedKey), privateKey).toString("hex"),
      );
    } catch (err) {
      logError("spaces:unseal", err);
    }
  }
  return keys;
}

/**
 * Makes sure the space vault is open for this member (reopening after an LRU
 * eviction) and finishes a pending re-key now that someone holding the key is
 * here. Returns the member's role, or null when they can't use the space.
 */
export function ensureSpaceOpen(userId: string, spaceId: string): SpaceRole | null {
  const resolved = resolveSpaceKey(userId, spaceId);
  if (!resolved) return null;
  try {
    openVault(spaceRef(spaceId), resolved.dek);
    if (store.isRekeyPending(spaceId)) rekeySpace(spaceId, resolved.dek);
  } catch (err) {
    logError("spaces:open", err);
    return null;
  }
  return resolved.role;
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export function listMySpaces(userId: string): SpaceSummary[] {
  return store.listSpacesForUser(userId).map(({ space, role }) => ({
    id: space.id,
    name: space.name,
    role,
    modules: store.getSpaceModules(space.id),
    memberCount: store.listMembers(space.id).length,
    createdAt: space.createdAt,
  }));
}

/** Members of a space the actor belongs to. */
export function listSpaceMembers(actor: Actor, spaceId: string): SpaceMember[] {
  if (!store.getMembership(spaceId, actor.userId)) {
    throw new DomainError("That space doesn't exist or you're not a member.");
  }
  return store.listMembers(spaceId);
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

export function createSpace(actor: Actor, name: string, modules: readonly string[]): Space {
  const id = randomUUID();
  const ref = spaceRef(id);
  const dek = newDek();
  const sealedKeyForOwner = encodeSealedBox(
    seal(Buffer.from(dek, "hex"), publicKeyOf(actor.userId)),
  );
  try {
    openVault(ref, dek);
    const space = transaction(() => {
      const created = store.createSpace({ id, name, ownerId: actor.userId, sealedKeyForOwner });
      store.setSpaceModules(id, modules);
      return created;
    });
    cacheKey(actor.userId, ref, dek);
    recordAudit({ event: "space.created", userId: actor.userId, detail: { spaceId: id } });
    return space;
  } catch (err) {
    closeVault(ref);
    trashVaultDir("spaces", id);
    throw err;
  }
}

/** Points the session at another vault: the user's own, or a space they can unseal. */
export function switchVault(actor: Actor, target: VaultRef): { spaceRole: SpaceRole | null } {
  if (!actor.sessionId) throw new VaultStateError("No session to switch.");
  if (target.kind === "user") {
    if (target.id !== actor.userId) throw new DomainError("You can only open your own vault.");
    openVault(target, personalDek(actor.userId));
    setSessionVault(actor.sessionId, target);
    return { spaceRole: null };
  }
  assertSafeId(target.id);
  const role = ensureSpaceOpen(actor.userId, target.id);
  if (!role) throw new DomainError("That space doesn't exist or you're not a member.");
  setSessionVault(actor.sessionId, target);
  return { spaceRole: role };
}

export function inviteMember(
  actor: Actor,
  spaceId: string,
  username: string,
  role: SpaceRole,
): SpaceMember {
  requireOwner(actor, spaceId);
  const account = findByUsername(username);
  if (!account || account.status !== "active") {
    throw new DomainError("There's no active account with that username.");
  }
  if (account.id === actor.userId) throw new DomainError("You're already in this space.");
  const resolved = resolveSpaceKey(actor.userId, spaceId);
  if (!resolved) throw new VaultStateError("This space's key isn't available — sign in again.");
  store.addMember({
    spaceId,
    userId: account.id,
    role,
    sealedKey: encodeSealedBox(seal(Buffer.from(resolved.dek, "hex"), account.publicKey)),
  });
  recordAudit({
    event: "space.member_added",
    userId: account.id,
    actorId: actor.userId,
    detail: { spaceId, role },
  });
  return store.listMembers(spaceId).find((m) => m.userId === account.id)!;
}

export function setMemberRole(
  actor: Actor,
  spaceId: string,
  userId: string,
  role: SpaceRole,
): void {
  requireOwner(actor, spaceId);
  if (!store.setMemberRole(spaceId, userId, role)) {
    throw new DomainError("That person isn't a member of this space.");
  }
  recordAudit({
    event: "space.member_role_changed",
    userId,
    actorId: actor.userId,
    detail: { spaceId, role },
  });
}

/** Owner removes someone (or anyone removes themselves), then the space is re-keyed. */
export function removeMember(actor: Actor, spaceId: string, userId: string): void {
  if (userId !== actor.userId) requireOwner(actor, spaceId);
  const key = anyHeldKey(spaceId, actor.userId);
  if (!store.removeMember(spaceId, userId)) {
    throw new DomainError("That person isn't a member of this space.");
  }
  forgetKey(userId, spaceRef(spaceId));
  recordAudit({
    event: userId === actor.userId ? "space.left" : "space.member_removed",
    userId,
    actorId: actor.userId,
    detail: { spaceId },
  });
  rekeyOrDefer(spaceId, key);
}

export function leaveSpace(actor: Actor, spaceId: string): void {
  removeMember(actor, spaceId, actor.userId);
}

export function deleteSpace(actor: Actor, spaceId: string): void {
  requireOwner(actor, spaceId);
  destroySpace(spaceId);
  recordAudit({ event: "space.deleted", userId: actor.userId, detail: { spaceId } });
}

export function renameSpace(actor: Actor, spaceId: string, name: string): void {
  requireOwner(actor, spaceId);
  store.renameSpace(spaceId, name);
}

export function setSpaceModules(
  actor: Actor,
  spaceId: string,
  modules: readonly string[],
): SpaceModule[] {
  requireOwner(actor, spaceId);
  return store.setSpaceModules(spaceId, modules);
}

// ---------------------------------------------------------------------------
// Re-keying
// ---------------------------------------------------------------------------

/** A key for the space held by `preferredUserId`, else by anyone online. */
function anyHeldKey(spaceId: string, preferredUserId?: string): string | null {
  if (preferredUserId) {
    const resolved = resolveSpaceKey(preferredUserId, spaceId);
    if (resolved) return resolved.dek;
  }
  for (const holder of usersHoldingKey(spaceRef(spaceId))) {
    const dek = getCachedKey(holder, spaceRef(spaceId));
    if (dek) return dek;
  }
  return null;
}

function rekeyOrDefer(spaceId: string, currentDek: string | null): void {
  if (store.listMembers(spaceId).length === 0) {
    destroySpace(spaceId);
    return;
  }
  if (!currentDek) {
    store.markRekeyPending(spaceId);
    return;
  }
  try {
    rekeySpace(spaceId, currentDek);
  } catch (err) {
    logError("spaces:rekey", err);
    store.markRekeyPending(spaceId);
  }
}

/**
 * Re-encrypts the space under a fresh DEK and reseals it to every current
 * member. The registry update and the `PRAGMA rekey` run in one registry
 * transaction: if the rekey throws, the sealed keys roll back with it.
 */
export function rekeySpace(spaceId: string, currentDek: string): string {
  const ref = spaceRef(spaceId);
  const members = store.listMembers(spaceId);
  const fresh = newDek();
  const sealed = new Map<string, string>();
  for (const member of members) {
    sealed.set(
      member.userId,
      encodeSealedBox(seal(Buffer.from(fresh, "hex"), publicKeyOf(member.userId))),
    );
  }
  openVault(ref, currentDek);
  transaction(() => {
    store.replaceSealedKeys(spaceId, sealed);
    store.clearRekeyPending(spaceId);
    rekeyVault(ref, fresh);
  });
  replaceCachedKey(ref, fresh);
  recordAudit({ event: "space.rekeyed", detail: { spaceId, count: members.length } });
  return fresh;
}

// ---------------------------------------------------------------------------
// Account deletion support
// ---------------------------------------------------------------------------

/**
 * Removes a user from every space before their account is deleted. Spaces they
 * were alone in are destroyed; where they were the only owner, the
 * longest-standing remaining member becomes owner. Each affected space is
 * re-keyed now if anyone online holds its key, otherwise on next use.
 */
export function removeUserFromAllSpaces(userId: string, actorId: string | null): void {
  for (const { space, role } of store.listSpacesForUser(userId)) {
    const members = store.listMembers(space.id);
    if (members.length <= 1) {
      destroySpace(space.id);
      continue;
    }
    const key = anyHeldKey(space.id, userId);
    transaction(() => {
      if (role === "owner" && store.countOwners(space.id) <= 1) {
        const successor = members
          .filter((m) => m.userId !== userId)
          .sort((a, b) => a.addedAt - b.addedAt)[0];
        store.setMemberRole(space.id, successor.userId, "owner");
      }
      store.removeMember(space.id, userId);
    });
    forgetKey(userId, spaceRef(space.id));
    recordAudit({
      event: "space.member_removed",
      userId,
      actorId,
      detail: { spaceId: space.id, reason: "account-deleted" },
    });
    rekeyOrDefer(space.id, key);
  }
}

/** Spaces where `userId` is the only owner and other people are members. */
export function listSpacesBlockingDeletion(userId: string): Space[] {
  return store
    .listSpacesSolelyOwnedBy(userId)
    .filter((space) => store.listMembers(space.id).length > 1);
}

function destroySpace(spaceId: string): void {
  const ref = spaceRef(spaceId);
  forgetKeyForEveryone(ref);
  if (isVaultOpen(ref)) closeVault(ref);
  store.deleteSpace(spaceId);
  trashVaultDir("spaces", spaceId);
}

/** Renames `<data>/<kind>/<id>` to a `.trash-` sibling first (so a crash never
 * leaves a half-deleted vault looking live), then removes it. */
export function trashVaultDir(kind: "users" | "spaces", id: string): void {
  assertSafeId(id);
  const parent = path.join(getDataDir(), kind);
  const dir = path.join(parent, id);
  if (!existsSync(dir)) return;
  const trash = path.join(parent, `.trash-${id}-${randomBytes(4).toString("hex")}`);
  renameSync(dir, trash);
  rmSync(trash, { recursive: true, force: true });
}
