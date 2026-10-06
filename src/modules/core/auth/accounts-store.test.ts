// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DomainError } from "@/modules/core/errors";
import {
  ACCOUNT_STATUS_TTL_MS,
  assertNotLastActiveAdmin,
  clearFailures,
  countActiveAdmins,
  createAccount,
  deleteAccount,
  findById,
  findByUsername,
  getAccountStatusCached,
  invalidateAccount,
  isLastActiveAdmin,
  listAccounts,
  recordFailure,
  recordLogin,
  setRole,
  setStatus,
  updateProfile,
} from "./accounts-store";
import { createInvite, getInvite, markInviteUsedBy, redeemInvite } from "./invites";
import { createSession, listUserSessions } from "./sessions-store";
import { addMember, createSpace, listMembers } from "./spaces-store";
import { dismissAlert, listDismissedAlerts, listAudit, recordAudit } from "./audit-store";
import { setupTestRegistry, teardownTestRegistry } from "./test-registry";
import type { RegistryDb } from "./accounts-db";

let db: RegistryDb;
beforeEach(() => {
  db = setupTestRegistry();
});
afterEach(() => teardownTestRegistry());

function member(username: string, role: "admin" | "member" = "member") {
  return createAccount({ username, role, publicKey: `pk-${username}` });
}

describe("createAccount / find", () => {
  it("normalizes the username and returns the stored account", () => {
    const account = createAccount({
      username: " Alice ",
      role: "admin",
      publicKey: "pk",
      displayName: " Alice A. ",
      now: 1000,
    });
    expect(account).toMatchObject({
      username: "alice",
      displayName: "Alice A.",
      role: "admin",
      status: "active",
      publicKey: "pk",
      createdAt: 1000,
      lastLoginAt: null,
      failedCount: 0,
      lockedUntil: null,
      hasAvatar: false,
    });
    expect(findByUsername("ALICE")?.id).toBe(account.id);
    expect(findById(account.id)?.username).toBe("alice");
  });

  it("rejects invalid and duplicate usernames with DomainError", () => {
    member("alice");
    expect(() => member("Alice")).toThrow(DomainError);
    expect(() => member("Alice")).toThrow(/already taken/);
    expect(() => member("a")).toThrow(/at least 3/);
  });

  it("returns null for unknown or invalid usernames", () => {
    expect(findByUsername("nobody")).toBeNull();
    expect(findByUsername("!!")).toBeNull();
  });

  it("lists accounts by username", () => {
    member("zed");
    member("amy");
    expect(listAccounts().map((a) => a.username)).toEqual(["amy", "zed"]);
  });
});

describe("profile, login, role and status", () => {
  it("updates only the given profile fields", () => {
    const a = member("alice");
    updateProfile(a.id, { color: "#AABBCC" });
    updateProfile(a.id, { hasAvatar: true });
    expect(findById(a.id)).toMatchObject({ color: "#aabbcc", hasAvatar: true, displayName: null });
    updateProfile(a.id, { displayName: "  " });
    expect(findById(a.id)?.displayName).toBeNull();
    expect(() => updateProfile(a.id, { color: "red" })).toThrow(DomainError);
    expect(() => updateProfile(a.id, { displayName: "x".repeat(61) })).toThrow(DomainError);
  });

  it("recordLogin stamps the time and clears failures", () => {
    const a = member("alice");
    for (let i = 0; i < 6; i++) recordFailure(a.id, 0);
    recordLogin(a.id, 5000);
    expect(findById(a.id)).toMatchObject({ lastLoginAt: 5000, failedCount: 0, lockedUntil: null });
  });

  it("recordFailure locks after 5 failures with doubling backoff, capped", () => {
    const a = member("alice");
    for (let i = 1; i <= 4; i++) expect(recordFailure(a.id, 0)).toBeNull();
    expect(recordFailure(a.id, 0)).toBe(30_000);
    expect(recordFailure(a.id, 0)).toBe(60_000);
    expect(recordFailure(a.id, 0)).toBe(120_000);
    for (let i = 0; i < 10; i++) recordFailure(a.id, 0);
    expect(recordFailure(a.id, 0)).toBe(15 * 60_000);
    clearFailures(a.id);
    expect(findById(a.id)).toMatchObject({ failedCount: 0, lockedUntil: null });
    expect(recordFailure("missing", 0)).toBeNull();
  });

  it("setStatus and setRole report whether a row changed", () => {
    const a = member("alice");
    expect(setStatus(a.id, "disabled")).toBe(true);
    expect(setRole(a.id, "admin")).toBe(true);
    expect(findById(a.id)).toMatchObject({ status: "disabled", role: "admin" });
    expect(setStatus("missing", "active")).toBe(false);
  });
});

describe("last-admin helpers", () => {
  it("counts only active admins", () => {
    const root = member("root", "admin");
    const second = member("second", "admin");
    member("user");
    expect(countActiveAdmins()).toBe(2);
    expect(isLastActiveAdmin(root.id)).toBe(false);
    setStatus(second.id, "disabled");
    expect(countActiveAdmins()).toBe(1);
    expect(isLastActiveAdmin(root.id)).toBe(true);
    expect(() => assertNotLastActiveAdmin(root.id)).toThrow(/only active admin/);
  });

  it("never flags members, disabled admins or unknown ids", () => {
    const user = member("user");
    const off = member("off", "admin");
    setStatus(off.id, "disabled");
    expect(isLastActiveAdmin(user.id)).toBe(false);
    expect(isLastActiveAdmin(off.id)).toBe(false);
    expect(isLastActiveAdmin("missing")).toBe(false);
    expect(() => assertNotLastActiveAdmin(user.id)).not.toThrow();
  });
});

describe("account status cache", () => {
  it("serves from cache for 5 s, then re-reads", () => {
    const a = member("alice");
    expect(getAccountStatusCached(a.id, 0)).toEqual({ status: "active", role: "member" });
    // Out-of-band change (no invalidation): still cached within the TTL.
    db.prepare("UPDATE accounts SET status = 'disabled' WHERE id = ?").run(a.id);
    expect(getAccountStatusCached(a.id, ACCOUNT_STATUS_TTL_MS - 1)?.status).toBe("active");
    expect(getAccountStatusCached(a.id, ACCOUNT_STATUS_TTL_MS)?.status).toBe("disabled");
  });

  it("is invalidated immediately by store mutations and invalidateAccount", () => {
    const a = member("alice");
    getAccountStatusCached(a.id, 0);
    setStatus(a.id, "disabled");
    expect(getAccountStatusCached(a.id, 1)?.status).toBe("disabled");
    setRole(a.id, "admin");
    expect(getAccountStatusCached(a.id, 2)?.role).toBe("admin");
    db.prepare("UPDATE accounts SET status = 'active' WHERE id = ?").run(a.id);
    invalidateAccount(a.id);
    expect(getAccountStatusCached(a.id, 3)?.status).toBe("active");
    deleteAccount(a.id);
    expect(getAccountStatusCached(a.id, 4)).toBeNull();
  });
});

describe("deleteAccount", () => {
  it("cascades user-owned rows and keeps history", () => {
    const admin = member("root", "admin");
    const a = member("alice");
    const { token, invite } = createInvite({ createdBy: admin.id, now: 0 });
    redeemInvite(token, 1);
    markInviteUsedBy(invite.id, a.id);
    createSession({ sid: "s1", userId: a.id, now: 0 });
    const space = createSpace({ name: "Home", ownerId: admin.id, sealedKeyForOwner: "k0" });
    addMember({ spaceId: space.id, userId: a.id, role: "editor", sealedKey: "k1" });
    dismissAlert(a.id, "alert-1");
    recordAudit({ event: "account.created", userId: a.id, actorId: admin.id });

    expect(deleteAccount(a.id)).toBe(true);
    expect(findById(a.id)).toBeNull();
    expect(listUserSessions(a.id, { includeRevoked: true })).toEqual([]);
    expect(listMembers(space.id).map((m) => m.userId)).toEqual([admin.id]);
    expect(listDismissedAlerts(a.id).size).toBe(0);
    expect(getInvite(invite.id)).toMatchObject({ usedBy: null, usedAt: 1 });
    expect(listAudit({ userId: a.id })).toHaveLength(1);
    expect(deleteAccount(a.id)).toBe(false);
  });

  it("nulls invites.created_by and spaces.created_by when the creator is deleted", () => {
    const admin = member("root", "admin");
    const other = member("other");
    const { invite } = createInvite({ createdBy: admin.id });
    const space = createSpace({ name: "Shared", ownerId: other.id, sealedKeyForOwner: "k" });
    db.prepare("UPDATE spaces SET created_by = ? WHERE id = ?").run(admin.id, space.id);
    deleteAccount(admin.id);
    expect(getInvite(invite.id)?.createdBy).toBeNull();
    const row = db.prepare("SELECT created_by FROM spaces WHERE id = ?").get(space.id) as {
      created_by: string | null;
    };
    expect(row.created_by).toBeNull();
  });
});
