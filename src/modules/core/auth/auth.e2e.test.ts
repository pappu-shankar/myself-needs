// @vitest-environment node
import { readdirSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
  SETUP_TOKEN,
  teardownMultiUserEnv,
} from "@/test/multi-user";
import { closeVault, isVaultOpen } from "@/modules/core/db/client";
import { dummyUnwrap } from "@/modules/core/db/crypto";
import { resetConfigForTests } from "@/modules/core/env/config";
import { isRecoveryKeyPending } from "@/modules/core/session/guard";
import { getSession } from "@/modules/core/session/session";
import {
  getLiveSession,
  resetSessionRegistryForTests,
} from "@/modules/core/session/session-registry";
import {
  acceptInviteAction,
  acknowledgeRecoveryKeyAction,
  loginAction,
  recoverAction,
  setupAction,
  signOutAction,
  signOutEverywhereAction,
} from "./actions";
import { signOutDeviceAction, changePasswordAction } from "./account-actions";
import { createInvite, setUserStatus } from "./admin-service";
import { countAccounts, findByUsername } from "./accounts-store";
import { listAudit } from "./audit-store";
import { ACCOUNT_DISABLED, INVALID_INVITE, INVALID_LOGIN, SETUP_DONE } from "./auth-service";
import { getInstallState } from "./install-state";
import { peekInvite } from "./invites";
import { __getOneTimeSetupTokenForTests } from "./setup-token";

let dataDir: string;

beforeEach(() => {
  dataDir = setupMultiUserEnv();
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  teardownMultiUserEnv();
});

async function login(browser: string, username: string, password = passwordFor(username)) {
  switchBrowser(browser);
  return loginAction({}, form({ username, password }));
}

const userDirs = () =>
  readdirSync(path.join(dataDir, "users")).filter((name) => !name.startsWith("."));

describe("first-run setup", () => {
  it("requires the setup token and only works once", async () => {
    expect(getInstallState()).toBe("fresh-setup");
    switchBrowser("admin");
    const password = passwordFor("admin");
    const wrong = await setupAction(
      {},
      form({
        setupToken: "not-the-token-at-all",
        username: "admin",
        password,
        confirmPassword: password,
      }),
    );
    expect(wrong.error).toMatch(/setup token/);
    expect(countAccounts()).toBe(0);

    const admin = await setupAdmin("admin");
    expect(admin.role).toBe("admin");
    expect(getInstallState()).toBe("ready");
    expect(await isRecoveryKeyPending()).toBe(true);

    const again = await setupAction(
      {},
      form({ setupToken: SETUP_TOKEN, username: "other", password, confirmPassword: password }),
    );
    expect(again.error).toBe(SETUP_DONE);
    expect(countAccounts()).toBe(1);
  });

  it("prints a one-time token when APP_SETUP_TOKEN isn't set", async () => {
    delete process.env.APP_SETUP_TOKEN;
    resetConfigForTests();
    switchBrowser("admin");
    const password = passwordFor("admin");
    const first = await setupAction(
      {},
      form({
        setupToken: "guess-guess-guess-guess",
        username: "admin",
        password,
        confirmPassword: password,
      }),
    );
    expect(first.error).toBeDefined();
    const token = __getOneTimeSetupTokenForTests()!;
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining(token));
    const ok = await setupAction(
      {},
      form({ setupToken: token, username: "admin", password, confirmPassword: password }),
    );
    expect(ok.recoveryKey).toBeDefined();
    expect(__getOneTimeSetupTokenForTests()).toBeUndefined();
  });
});

describe("login", () => {
  it("signs in, sets the cookie and records the session", async () => {
    const admin = await setupAdmin();
    await expectRedirect(login("laptop", "admin"), "/dashboard");
    const scope = await scopeOf("laptop");
    expect(scope).toMatchObject({ userId: admin.id, role: "admin", spaceRole: null });
    expect(scope.vault).toEqual({ kind: "user", id: admin.id });
    expect(listAudit({ userId: admin.id, events: ["login.succeeded"] })).toHaveLength(2);
  });

  it("gives the same error for an unknown user and a wrong password", async () => {
    await setupAdmin();
    const unknown = await login("x", "nobody-here", "whatever-password-123");
    const wrong = await login("x", "admin", "wrong-password-123456");
    expect(unknown.error).toBe(INVALID_LOGIN);
    expect(wrong.error).toBe(INVALID_LOGIN);
    expect(unknown.values).toEqual({ username: "nobody-here" });
  });

  it("throttles a username after repeated failures, known or not", async () => {
    await setupAdmin();
    for (let i = 0; i < 5; i++) {
      expect((await login("x", "admin", `wrong-password-${i}-xyz`)).error).toBe(INVALID_LOGIN);
      expect((await login("x", "ghost", `wrong-password-${i}-xyz`)).error).toBe(INVALID_LOGIN);
    }
    expect((await login("x", "admin")).error).toMatch(/Too many attempts/);
    expect((await login("x", "ghost", "anything-at-all-123")).error).toMatch(/Too many attempts/);
  });

  it("keeps a disabled account generic until the password is right", async () => {
    const admin = await setupAdmin();
    const { account: bob } = await inviteAndJoin(admin, "bob");
    setUserStatus(admin.id, bob.id, "disabled");
    expect((await login("b2", "bob", "wrong-password-123456")).error).toBe(INVALID_LOGIN);
    expect((await login("b2", "bob")).error).toBe(ACCOUNT_DISABLED);
  });

  it("ends a signed-in user's sessions when they are disabled", async () => {
    const admin = await setupAdmin();
    const { account: bob } = await inviteAndJoin(admin, "bob");
    expect((await scopeOf("bob")).userId).toBe(bob.id);
    setUserStatus(admin.id, bob.id, "disabled");
    expect(isVaultOpen({ kind: "user", id: bob.id })).toBe(false);
    await expectRedirect(scopeOf("bob"), "/login");
  });

  it("reports a busy server when the KDF queue is full", async () => {
    await setupAdmin();
    await dummyUnwrap("warm-up"); // builds the dummy keyring first
    const pending = Array.from({ length: 10 }, () => dummyUnwrap("x"));
    await Promise.resolve(); // let them all take a slot or a queue place
    const state = await login("x", "admin");
    expect(state.error).toMatch(/busy/);
    await Promise.allSettled(pending);
  });
});

describe("invites", () => {
  it("creates an account, signs in and shows the recovery key once", async () => {
    const admin = await setupAdmin();
    const { account, recoveryKey } = await inviteAndJoin(admin, "bob");
    expect(account.role).toBe("member");
    expect(recoveryKey).toMatch(/^[0-9a-f]{8}(-[0-9a-f]{8}){3}$/);
    expect(await isRecoveryKeyPending()).toBe(true);
    await expectRedirect(acknowledgeRecoveryKeyAction(), "/dashboard");
    expect(await isRecoveryKeyPending()).toBe(false);
    expect((await scopeOf("bob")).userId).toBe(account.id);
  });

  it("can't be reused", async () => {
    const admin = await setupAdmin();
    const { token } = createInvite(admin.id, {});
    const pw = passwordFor("carol");
    switchBrowser("carol");
    expect(
      (
        await acceptInviteAction(
          {},
          form({ token, username: "carol", password: pw, confirmPassword: pw }),
        )
      ).recoveryKey,
    ).toBeDefined();
    switchBrowser("dave");
    const second = await acceptInviteAction(
      {},
      form({ token, username: "dave", password: pw, confirmPassword: pw }),
    );
    expect(second.error).toBe(INVALID_INVITE);
    expect(findByUsername("dave")).toBeNull();
    expect(userDirs()).toHaveLength(2);
  });

  it("is atomic: a failed sign-up leaves the invite usable and no vault behind", async () => {
    const admin = await setupAdmin();
    const { token } = createInvite(admin.id, {});
    const pw = passwordFor("x");
    switchBrowser("x");
    const taken = await acceptInviteAction(
      {},
      form({ token, username: "admin", password: pw, confirmPassword: pw }),
    );
    expect(taken.error).toMatch(/taken/);
    expect(peekInvite(token)).not.toBeNull();
    expect(userDirs()).toHaveLength(1);
  });

  it("lets only one of two concurrent redemptions win", async () => {
    const admin = await setupAdmin();
    const { token } = createInvite(admin.id, {});
    const pw = passwordFor("race");
    switchBrowser("r1");
    const results = await Promise.all([
      acceptInviteAction(
        {},
        form({ token, username: "race-one", password: pw, confirmPassword: pw }),
      ),
      acceptInviteAction(
        {},
        form({ token, username: "race-two", password: pw, confirmPassword: pw }),
      ),
    ]);
    expect(results.filter((r) => r.recoveryKey)).toHaveLength(1);
    expect(results.filter((r) => r.error === INVALID_INVITE)).toHaveLength(1);
    expect(countAccounts()).toBe(2);
    expect(userDirs()).toHaveLength(2);
  });
});

describe("recovery", () => {
  it("verifies the key, then resets the password and signs in", async () => {
    const admin = await setupAdmin();
    const { recoveryKey } = await inviteAndJoin(admin, "bob");
    switchBrowser("phone");
    const verified = await recoverAction({}, form({ username: "bob", recoveryKey }));
    expect(verified.verified).toBe(true);
    const fresh = "brand-new-password-for-bob";
    await expectRedirect(
      recoverAction(
        {},
        form({ username: "bob", recoveryKey, newPassword: fresh, confirmPassword: fresh }),
      ),
      "/dashboard",
    );
    await expectRedirect(scopeOf("bob"), "/login"); // other sessions ended
    expect((await login("p2", "bob")).error).toBe(INVALID_LOGIN);
    await expectRedirect(login("p3", "bob", fresh), "/dashboard");
    expect(listAudit({ events: ["recovery.used"] })).toHaveLength(1);
  });

  it("gives the same error for an unknown user and a wrong key", async () => {
    await setupAdmin();
    switchBrowser("x");
    const key = "00000000-00000000-00000000-00000000";
    const a = await recoverAction({}, form({ username: "nobody", recoveryKey: key }));
    const b = await recoverAction({}, form({ username: "admin", recoveryKey: key }));
    expect(a.error).toBe(b.error);
  });
});

describe("sessions", () => {
  it("signing out one device revokes only that session", async () => {
    const admin = await setupAdmin();
    await expectRedirect(login("laptop", "admin"), "/dashboard");
    await expectRedirect(login("phone", "admin"), "/dashboard");
    const phone = await scopeOf("phone");
    switchBrowser("laptop");
    expect(await signOutDeviceAction({}, form({ sid: phone.sessionId }))).toEqual({ ok: true });
    await expectRedirect(scopeOf("phone"), "/login");
    expect((await scopeOf("laptop")).userId).toBe(admin.id);
    expect((await scopeOf("admin")).userId).toBe(admin.id);
  });

  it("can't sign out someone else's device", async () => {
    const admin = await setupAdmin();
    await inviteAndJoin(admin, "bob");
    const bob = await scopeOf("bob");
    switchBrowser("admin");
    const state = await signOutDeviceAction({}, form({ sid: bob.sessionId }));
    expect(state.error).toMatch(/isn't signed in/);
    expect((await scopeOf("bob")).sessionId).toBe(bob.sessionId);
  });

  it("sign out ends this session; sign out everywhere ends all of them", async () => {
    await setupAdmin();
    await expectRedirect(login("laptop", "admin"), "/dashboard");
    await expectRedirect(login("phone", "admin"), "/dashboard");
    switchBrowser("laptop");
    await expectRedirect(signOutAction(), "/login");
    await expectRedirect(scopeOf("laptop"), "/login");
    expect(await scopeOf("phone")).toBeDefined();
    switchBrowser("phone");
    await expectRedirect(signOutEverywhereAction(), "/login");
    await expectRedirect(scopeOf("admin"), "/login");
  });

  it("changing the password signs out the other devices", async () => {
    await setupAdmin();
    await expectRedirect(login("phone", "admin"), "/dashboard");
    switchBrowser("admin");
    const next = "another-long-password-1";
    const state = await changePasswordAction(
      {},
      form({ currentPassword: passwordFor("admin"), newPassword: next, confirmNewPassword: next }),
    );
    expect(state).toEqual({ ok: true });
    await expectRedirect(scopeOf("phone"), "/login");
    expect(await scopeOf("admin")).toBeDefined();
    await expectRedirect(login("x", "admin", next), "/dashboard");
  });

  it("an idle close of the personal vault ends that user's sessions", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    const admin = await setupAdmin();
    const { account: bob } = await inviteAndJoin(admin, "bob");
    vi.advanceTimersByTime(20 * 60_000);
    await scopeOf("admin"); // admin active, bob idle
    vi.advanceTimersByTime(11 * 60_000);
    expect(isVaultOpen({ kind: "user", id: bob.id })).toBe(false);
    await expectRedirect(scopeOf("bob"), "/login");
    expect((await scopeOf("admin")).userId).toBe(admin.id);
    expect(listAudit({ userId: bob.id, events: ["session.idle_locked"] })).toHaveLength(1);
  });

  it("an evicted vault reopens transparently", async () => {
    process.env.APP_MAX_OPEN_VAULTS = "1";
    const admin = await setupAdmin();
    await asUser("admin", () => addGoal("admin goal"));
    await inviteAndJoin(admin, "bob"); // evicts the admin's vault
    expect(isVaultOpen({ kind: "user", id: admin.id })).toBe(false);
    expect(await asUser("admin", () => goalNames())).toEqual(["admin goal"]);
    expect(isVaultOpen({ kind: "user", id: admin.id })).toBe(true);
  });

  it("an explicitly closed vault also reopens from the key cache", async () => {
    const admin = await setupAdmin();
    closeVault({ kind: "user", id: admin.id });
    expect(await asUser("admin", () => goalNames())).toEqual([]);
  });

  it("expires at the absolute max age", async () => {
    process.env.APP_SESSION_MAX_HOURS = "1";
    resetConfigForTests();
    vi.useFakeTimers({ toFake: ["Date"] });
    await setupAdmin();
    const { sessionId } = await scopeOf("admin");
    vi.setSystemTime(Date.now() + 61 * 60_000);
    await expectRedirect(scopeOf("admin"), "/login");
    expect(getLiveSession(sessionId)).toBeNull();
    delete process.env.APP_SESSION_MAX_HOURS;
  });

  it("a server restart signs everyone out", async () => {
    await setupAdmin();
    resetSessionRegistryForTests();
    await expectRedirect(scopeOf("admin"), "/login");
  });

  it("a forged cookie for another user is rejected", async () => {
    const admin = await setupAdmin();
    const { account: bob } = await inviteAndJoin(admin, "bob");
    switchBrowser("admin");
    const session = await getSession();
    session.uid = bob.id; // sid still admin's
    await session.save();
    await expectRedirect(scopeOf("admin"), "/login");
  });
});
