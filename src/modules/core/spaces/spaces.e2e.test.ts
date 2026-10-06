// @vitest-environment node
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3-multiple-ciphers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

vi.mock("next/headers", async () => (await import("@/test/fake-next")).nextHeaders);
vi.mock("next/navigation", async () => (await import("@/test/fake-next")).nextNavigation);
vi.mock("next/cache", async () => (await import("@/test/fake-next")).nextCache);

import { expectRedirect, switchBrowser } from "@/test/fake-next";
import {
  addGoal,
  asUser,
  form,
  goalNames,
  inviteAndJoin,
  passwordFor,
  scopeOf,
  setupAdmin,
  setupMultiUserEnv,
  teardownMultiUserEnv,
} from "@/test/multi-user";
import { defineAction, VIEWER_READ_ONLY_MESSAGE } from "@/modules/core/action/define-action";
import { loginAction, signOutAction } from "@/modules/core/auth/actions";
import { deleteMyAccountAction } from "@/modules/core/auth/account-actions";
import {
  createInviteAction,
  deleteUserAction,
  setUserRoleAction,
  setUserStatusAction,
} from "@/modules/core/auth/admin-actions";
import { findByUsername } from "@/modules/core/auth/accounts-store";
import * as spacesStore from "@/modules/core/auth/spaces-store";
import * as client from "@/modules/core/db/client";
import { runWithScope } from "@/modules/core/db/request-scope";
import { decodeSealedBox, openIdentity, unseal } from "@/modules/core/db/sealing";
import type { VaultRef } from "@/modules/core/db/vault-types";
import { getUserDir, vaultDbPath } from "@/modules/core/env/paths";
import { getCachedKey } from "@/modules/core/session/session-registry";
import {
  createSpaceAction,
  inviteMemberAction,
  leaveSpaceAction,
  removeMemberAction,
  setMemberRoleAction,
  switchVaultAction,
} from "./actions";
import { listMySpaces } from "./spaces-service";

let dataDir: string;

beforeEach(() => {
  dataDir = setupMultiUserEnv();
  vi.spyOn(console, "info").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  teardownMultiUserEnv();
});

/** A real vault-writing action, as any module would define it. */
const addGoalAction = defineAction(z.object({ name: z.string() }), ({ name }) => addGoal(name));

function canOpenWithKey(file: string, dekHex: string): boolean {
  const db = new Database(file, { readonly: true });
  try {
    db.pragma("cipher='sqlcipher'");
    db.pragma(`key="x'${dekHex}'"`);
    db.prepare("SELECT count(*) FROM sqlite_master").get();
    return true;
  } catch {
    return false;
  } finally {
    db.close();
  }
}

async function createSpace(browser: string, name: string, modules: string[] = []) {
  switchBrowser(browser);
  const fd = form({ name });
  for (const m of modules) fd.append("modules", m);
  const state = await createSpaceAction({}, fd);
  if (!state.ok) throw new Error(state.error);
  return state.data!.id;
}

async function switchTo(browser: string, target: { kind: "user" } | { kind: "space"; id: string }) {
  switchBrowser(browser);
  return switchVaultAction(target);
}

describe("isolation between users", () => {
  it("keeps each user's rows in their own vault", async () => {
    const admin = await setupAdmin("alice");
    const { account: bob } = await inviteAndJoin(admin, "bob");
    await asUser("alice", () => addGoal("alice secret"));
    await asUser("bob", () => addGoal("bob secret"));
    expect(await asUser("alice", () => goalNames())).toEqual(["alice secret"]);
    expect(await asUser("bob", () => goalNames())).toEqual(["bob secret"]);

    // B's key can't open A's file.
    const bobKey = getCachedKey(bob.id, { kind: "user", id: bob.id })!;
    const aliceFile = vaultDbPath(getUserDir(admin.id));
    expect(canOpenWithKey(aliceFile, bobKey)).toBe(false);
  });

  it("never crosses scopes between concurrent requests", async () => {
    const admin = await setupAdmin("alice");
    await inviteAndJoin(admin, "bob");
    const alice = await scopeOf("alice");
    const bob = await scopeOf("bob");
    const tick = () => new Promise((r) => setImmediate(r));
    const run = (scope: typeof alice, label: string) =>
      runWithScope(scope, async () => {
        for (let i = 0; i < 5; i++) {
          addGoal(`${label}-${i}`);
          await tick();
        }
        return goalNames();
      });
    const [a, b] = await Promise.all([run(alice, "a"), run(bob, "b")]);
    expect(a).toEqual(["a-0", "a-1", "a-2", "a-3", "a-4"]);
    expect(b).toEqual(["b-0", "b-1", "b-2", "b-3", "b-4"]);
  });
});

describe("spaces", () => {
  it("shares a space with an editor while personal data stays private", async () => {
    const admin = await setupAdmin("alice");
    const { account: bob } = await inviteAndJoin(admin, "bob");
    await asUser("bob", () => addGoal("bob private"));

    const spaceId = await createSpace("alice", "Household", ["finance", "house"]);
    expect(listMySpaces(admin.id)).toMatchObject([
      {
        id: spaceId,
        name: "Household",
        role: "owner",
        modules: ["finance", "house"],
        memberCount: 1,
      },
    ]);
    expect((await switchTo("alice", { kind: "space", id: spaceId })).data).toEqual({
      spaceRole: "owner",
    });
    expect(await addGoalAction({ name: "shared rent" })).toEqual({ ok: true });

    switchBrowser("alice");
    expect(
      await inviteMemberAction({}, form({ spaceId, username: "bob", role: "editor" })),
    ).toEqual({ ok: true });

    await switchTo("bob", { kind: "space", id: spaceId });
    const bobScope = await scopeOf("bob");
    expect(bobScope).toMatchObject({ vault: { kind: "space", id: spaceId }, spaceRole: "editor" });
    expect(await asUser("bob", () => goalNames())).toEqual(["shared rent"]);
    switchBrowser("bob");
    expect(await addGoalAction({ name: "bob adds groceries" })).toEqual({ ok: true });
    expect(await asUser("alice", () => goalNames())).toEqual(["shared rent", "bob adds groceries"]);

    await switchTo("bob", { kind: "user" });
    expect(await asUser("bob", () => goalNames())).toEqual(["bob private"]);
    expect(bob.id).toBeDefined();
  });

  it("rejects a viewer's writes but allows reads", async () => {
    const admin = await setupAdmin("alice");
    const { account: bob } = await inviteAndJoin(admin, "bob");
    const spaceId = await createSpace("alice", "Household");
    switchBrowser("alice");
    await inviteMemberAction({}, form({ spaceId, username: "bob", role: "editor" }));
    await setMemberRoleAction({}, form({ spaceId, userId: bob.id, role: "viewer" }));

    await switchTo("bob", { kind: "space", id: spaceId });
    expect((await scopeOf("bob")).spaceRole).toBe("viewer");
    switchBrowser("bob");
    expect(await addGoalAction({ name: "nope" })).toEqual({ error: VIEWER_READ_ONLY_MESSAGE });
    expect(await asUser("bob", () => goalNames())).toEqual([]);
  });

  it("only owners manage members", async () => {
    const admin = await setupAdmin("alice");
    await inviteAndJoin(admin, "bob");
    await inviteAndJoin(admin, "carol");
    const spaceId = await createSpace("alice", "Household");
    switchBrowser("alice");
    await inviteMemberAction({}, form({ spaceId, username: "bob", role: "editor" }));
    switchBrowser("bob");
    const state = await inviteMemberAction(
      {},
      form({ spaceId, username: "carol", role: "editor" }),
    );
    expect(state.error).toMatch(/owners/);
  });

  it("re-keys on removal so the removed member's old key stops working", async () => {
    const admin = await setupAdmin("alice");
    const { account: bob } = await inviteAndJoin(admin, "bob");
    const spaceId = await createSpace("alice", "Household");
    const ref: VaultRef = { kind: "space", id: spaceId };
    await switchTo("alice", { kind: "space", id: spaceId });
    await addGoalAction({ name: "shared" });
    switchBrowser("alice");
    await inviteMemberAction({}, form({ spaceId, username: "bob", role: "editor" }));
    await switchTo("bob", { kind: "space", id: spaceId });
    const oldKey = getCachedKey(bob.id, ref)!;
    expect(oldKey).toMatch(/^[0-9a-f]{64}$/);

    switchBrowser("alice");
    expect(await removeMemberAction({}, form({ spaceId, userId: bob.id }))).toEqual({ ok: true });

    // Bob is bounced back to his own vault and can't come back.
    expect((await scopeOf("bob")).vault).toEqual({ kind: "user", id: bob.id });
    expect((await switchTo("bob", { kind: "space", id: spaceId })).error).toMatch(/not a member/);
    expect(getCachedKey(bob.id, ref)).toBeNull();

    // The file no longer opens with the old key; the owner's new sealed key does.
    const newKey = getCachedKey(admin.id, ref)!;
    expect(newKey).not.toBe(oldKey);
    client.closeVault(ref);
    const file = vaultDbPath(path.join(dataDir, "spaces", spaceId));
    expect(canOpenWithKey(file, oldKey)).toBe(false);
    expect(canOpenWithKey(file, newKey)).toBe(true);
    const sealed = spacesStore.getMembership(spaceId, admin.id)!.sealedKey;
    const aliceKey = getCachedKey(admin.id, { kind: "user", id: admin.id })!;
    expect(
      unseal(decodeSealedBox(sealed), openIdentity(getUserDir(admin.id), aliceKey)).toString("hex"),
    ).toBe(newKey);
    // And the owner keeps working (reopens with the new key).
    expect(await asUser("alice", () => goalNames())).toEqual(["shared"]);
  });

  it("re-keys later when nobody holding the key is online", async () => {
    const admin = await setupAdmin("admin");
    await inviteAndJoin(admin, "carol");
    const { account: bob } = await inviteAndJoin(admin, "bob");
    const spaceId = await createSpace("carol", "Shared");
    switchBrowser("carol");
    await inviteMemberAction({}, form({ spaceId, username: "bob", role: "editor" }));
    switchBrowser("carol");
    await expectRedirect(signOutAction(), "/login");
    switchBrowser("bob");
    await expectRedirect(signOutAction(), "/login");

    switchBrowser("admin");
    expect(await deleteUserAction({}, form({ userId: bob.id, confirmUsername: "bob" }))).toEqual({
      ok: true,
    });
    expect(spacesStore.isRekeyPending(spaceId)).toBe(true);

    switchBrowser("carol");
    await expectRedirect(
      loginAction({}, form({ username: "carol", password: passwordFor("carol") })),
      "/dashboard",
    );
    await switchTo("carol", { kind: "space", id: spaceId });
    expect(spacesStore.isRekeyPending(spaceId)).toBe(false);
    expect(await asUser("carol", () => goalNames())).toEqual([]);
  });

  it("lets a member leave, and the sole member delete their account with their spaces", async () => {
    const admin = await setupAdmin("alice");
    const { account: bob } = await inviteAndJoin(admin, "bob");
    const spaceId = await createSpace("alice", "Household");
    switchBrowser("alice");
    await inviteMemberAction({}, form({ spaceId, username: "bob", role: "editor" }));
    switchBrowser("bob");
    await expectRedirect(leaveSpaceAction({}, form({ spaceId })), "/spaces");
    expect(listMySpaces(bob.id)).toEqual([]);

    const solo = await createSpace("bob", "Bob only");
    switchBrowser("bob");
    await expectRedirect(
      deleteMyAccountAction({}, form({ password: passwordFor("bob"), confirmUsername: "bob" })),
      "/login",
    );
    expect(findByUsername("bob")).toBeNull();
    expect(spacesStore.getSpace(solo)).toBeNull();
    expect(existsSync(path.join(dataDir, "spaces", solo))).toBe(false);
    expect(existsSync(path.join(dataDir, "users", bob.id))).toBe(false);
    expect(readdirSync(path.join(dataDir, "users")).filter((n) => n.startsWith(".trash"))).toEqual(
      [],
    );
  });

  it("refuses to delete an account that solely owns a space with other members", async () => {
    const admin = await setupAdmin("alice");
    await inviteAndJoin(admin, "bob");
    const spaceId = await createSpace("bob", "Bob's");
    switchBrowser("bob");
    await inviteMemberAction({}, form({ spaceId, username: "alice", role: "viewer" }));
    const state = await deleteMyAccountAction(
      {},
      form({ password: passwordFor("bob"), confirmUsername: "bob" }),
    );
    expect(state.error).toMatch(/only owner of "Bob's"/);
    expect(findByUsername("bob")).not.toBeNull();
  });
});

describe("admin", () => {
  it("manages accounts without ever opening anyone else's vault", async () => {
    const admin = await setupAdmin("alice");
    const { account: bob } = await inviteAndJoin(admin, "bob");
    const spaceId = await createSpace("bob", "Bob's");
    const openVault = vi.spyOn(client, "openVault");
    const getDb = vi.spyOn(client, "getDb");

    switchBrowser("alice");
    const invite = await createInviteAction({}, form({ note: "for carol" }));
    expect(invite.data?.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(await setUserRoleAction({}, form({ userId: bob.id, role: "admin" }))).toEqual({
      ok: true,
    });
    expect(await setUserStatusAction({}, form({ userId: bob.id, status: "disabled" }))).toEqual({
      ok: true,
    });
    expect(await deleteUserAction({}, form({ userId: bob.id, confirmUsername: "bob" }))).toEqual({
      ok: true,
    });
    // The session guard only ever touches the admin's own personal vault.
    expect(openVault.mock.calls.map(([ref]) => ref)).toEqual(
      openVault.mock.calls.map(() => ({ kind: "user", id: admin.id })),
    );
    expect(getDb).not.toHaveBeenCalled();
    expect(spacesStore.getSpace(spaceId)).toBeNull();
  });

  it("refuses non-admins and keeps the last admin", async () => {
    const admin = await setupAdmin("alice");
    const { account: bob } = await inviteAndJoin(admin, "bob");
    switchBrowser("bob");
    await expectRedirect(createInviteAction({}, form({})), "/dashboard");
    switchBrowser("alice");
    expect((await setUserRoleAction({}, form({ userId: admin.id, role: "member" }))).error).toMatch(
      /only active admin/,
    );
    expect(bob.role).toBe("member");
  });
});
