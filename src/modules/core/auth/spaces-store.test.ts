// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DomainError } from "@/modules/core/errors";
import { createAccount } from "./accounts-store";
import {
  addMember,
  countOwners,
  createSpace,
  deleteSpace,
  getMembership,
  getSpace,
  listMembers,
  listSpacesForUser,
  listSpacesSolelyOwnedBy,
  removeMember,
  renameSpace,
  replaceSealedKeys,
  setMemberRole,
} from "./spaces-store";
import { setupTestRegistry, teardownTestRegistry } from "./test-registry";
import type { RegistryDb } from "./accounts-db";

let db: RegistryDb;
let alice: string;
let bob: string;
let carol: string;

beforeEach(() => {
  db = setupTestRegistry();
  alice = createAccount({ username: "alice", role: "admin", publicKey: "pk-a" }).id;
  bob = createAccount({ username: "bob", role: "member", publicKey: "pk-b" }).id;
  carol = createAccount({ username: "carol", role: "member", publicKey: "pk-c" }).id;
});
afterEach(() => teardownTestRegistry());

function household() {
  const space = createSpace({
    name: " Household ",
    ownerId: alice,
    sealedKeyForOwner: "ka",
    now: 5,
  });
  addMember({ spaceId: space.id, userId: bob, role: "editor", sealedKey: "kb", now: 6 });
  return space;
}

describe("createSpace", () => {
  it("creates the space with its creator as owner", () => {
    const space = household();
    expect(space).toMatchObject({ name: "Household", createdBy: alice, createdAt: 5 });
    expect(getMembership(space.id, alice)).toEqual({ role: "owner", sealedKey: "ka" });
    expect(countOwners(space.id)).toBe(1);
  });

  it("validates the name", () => {
    expect(() => createSpace({ name: "  ", ownerId: alice, sealedKeyForOwner: "k" })).toThrow(
      DomainError,
    );
    expect(() =>
      createSpace({ name: "n".repeat(61), ownerId: alice, sealedKeyForOwner: "k" }),
    ).toThrow(/at most 60/);
  });

  it("is atomic: an unknown owner leaves no orphan space", () => {
    expect(() => createSpace({ name: "X", ownerId: "ghost", sealedKeyForOwner: "k" })).toThrow();
    expect(db.prepare("SELECT COUNT(*) AS n FROM spaces").get()).toEqual({ n: 0 });
  });
});

describe("membership", () => {
  it("lists spaces for a user with role and sealed key", () => {
    const space = household();
    const other = createSpace({ name: "Alpha", ownerId: bob, sealedKeyForOwner: "kb2" });
    expect(listSpacesForUser(bob)).toEqual([
      { space: getSpace(other.id), role: "owner", sealedKey: "kb2" },
      { space: getSpace(space.id), role: "editor", sealedKey: "kb" },
    ]);
    expect(listSpacesForUser(carol)).toEqual([]);
  });

  it("lists members owners first, with usernames", () => {
    const space = household();
    addMember({ spaceId: space.id, userId: carol, role: "viewer", sealedKey: "kc", now: 7 });
    expect(listMembers(space.id)).toEqual([
      { userId: alice, username: "alice", displayName: null, role: "owner", addedAt: 5 },
      { userId: bob, username: "bob", displayName: null, role: "editor", addedAt: 6 },
      { userId: carol, username: "carol", displayName: null, role: "viewer", addedAt: 7 },
    ]);
  });

  it("rejects duplicate members and unknown users", () => {
    const space = household();
    expect(() =>
      addMember({ spaceId: space.id, userId: bob, role: "viewer", sealedKey: "x" }),
    ).toThrow(/already a member/);
    expect(() =>
      addMember({ spaceId: space.id, userId: "ghost", role: "viewer", sealedKey: "x" }),
    ).toThrow(/FOREIGN KEY/);
  });

  it("changes roles but never demotes the last owner", () => {
    const space = household();
    expect(setMemberRole(space.id, bob, "viewer")).toBe(true);
    expect(getMembership(space.id, bob)?.role).toBe("viewer");
    expect(() => setMemberRole(space.id, alice, "editor")).toThrow(/at least one owner/);
    setMemberRole(space.id, bob, "owner");
    expect(countOwners(space.id)).toBe(2);
    expect(setMemberRole(space.id, alice, "editor")).toBe(true);
    expect(setMemberRole(space.id, carol, "editor")).toBe(false);
  });

  it("removes members but never the last owner", () => {
    const space = household();
    expect(() => removeMember(space.id, alice)).toThrow(/at least one owner/);
    expect(removeMember(space.id, bob)).toBe(true);
    expect(removeMember(space.id, bob)).toBe(false);
    expect(getMembership(space.id, bob)).toBeNull();
  });

  it("finds spaces a user solely owns", () => {
    const solo = household();
    const shared = createSpace({ name: "Shared", ownerId: alice, sealedKeyForOwner: "k" });
    addMember({ spaceId: shared.id, userId: carol, role: "owner", sealedKey: "k" });
    expect(listSpacesSolelyOwnedBy(alice).map((s) => s.id)).toEqual([solo.id]);
    expect(listSpacesSolelyOwnedBy(bob)).toEqual([]);
  });

  it("rename and delete (memberships cascade)", () => {
    const space = household();
    expect(renameSpace(space.id, "Home")).toBe(true);
    expect(getSpace(space.id)?.name).toBe("Home");
    expect(deleteSpace(space.id)).toBe(true);
    expect(listSpacesForUser(bob)).toEqual([]);
    expect(db.prepare("SELECT COUNT(*) AS n FROM space_members").get()).toEqual({ n: 0 });
  });
});

describe("replaceSealedKeys", () => {
  it("swaps every member's key at once", () => {
    const space = household();
    replaceSealedKeys(
      space.id,
      new Map([
        [alice, "ka2"],
        [bob, "kb2"],
      ]),
    );
    expect(getMembership(space.id, alice)?.sealedKey).toBe("ka2");
    expect(getMembership(space.id, bob)?.sealedKey).toBe("kb2");
  });

  it("writes nothing when the map doesn't match the current members", () => {
    const space = household();
    expect(() => replaceSealedKeys(space.id, new Map([[alice, "ka2"]]))).toThrow(DomainError);
    expect(() =>
      replaceSealedKeys(
        space.id,
        new Map([
          [alice, "ka2"],
          [bob, "kb2"],
          [carol, "kc2"],
        ]),
      ),
    ).toThrow(DomainError);
    expect(() =>
      replaceSealedKeys(
        space.id,
        new Map([
          [alice, "ka2"],
          [carol, "kc2"],
        ]),
      ),
    ).toThrow(DomainError);
    expect(getMembership(space.id, alice)?.sealedKey).toBe("ka");
    expect(getMembership(space.id, bob)?.sealedKey).toBe("kb");
  });

  it("re-key after removal covers only remaining members", () => {
    const space = household();
    removeMember(space.id, bob);
    replaceSealedKeys(space.id, new Map([[alice, "ka3"]]));
    expect(getMembership(space.id, alice)?.sealedKey).toBe("ka3");
  });
});
