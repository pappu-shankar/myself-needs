// @vitest-environment node
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3-multiple-ciphers";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", async () => (await import("@/test/fake-next")).nextHeaders);
vi.mock("next/navigation", async () => (await import("@/test/fake-next")).nextNavigation);
vi.mock("next/cache", async () => (await import("@/test/fake-next")).nextCache);

import { expectRedirect, switchBrowser } from "@/test/fake-next";
import {
  asUser,
  form,
  goalNames,
  setupAdmin,
  setupMultiUserEnv,
  teardownMultiUserEnv,
} from "@/test/multi-user";
import { createVault } from "@/modules/core/db/crypto";
import { getMigrationsDir } from "@/modules/core/env/paths";
import { claimAction, loginAction } from "./actions";
import { countAccounts, findByUsername } from "./accounts-store";
import { getInstallState } from "./install-state";
import { CredentialError } from "@/modules/core/errors";
import { __setClaimFailpointForTests, claimLegacyVault, CLAIM_MARKER } from "./legacy-claim";

const PASSPHRASE = "old-pass"; // legacy passphrases could be 8 characters

let dataDir: string;

/** Builds a pre-multi-user vault in the data root: keyring.json + app.db,
 * backups/ and the fashion folders. */
async function makeLegacyVault(): Promise<void> {
  mkdirSync(dataDir, { recursive: true });
  const { dekHex } = await createVault(dataDir, PASSPHRASE);
  const sqlite = new Database(path.join(dataDir, "app.db"));
  sqlite.pragma("cipher='sqlcipher'");
  sqlite.pragma(`key="x'${dekHex}'"`);
  sqlite.pragma("journal_mode = WAL");
  migrate(drizzle(sqlite), { migrationsFolder: getMigrationsDir() });
  sqlite.prepare("INSERT INTO plans_goals (name) VALUES (?)").run("legacy goal");
  sqlite.close();
  mkdirSync(path.join(dataDir, "backups"));
  writeFileSync(path.join(dataDir, "backups", "app-old-before-migration.db"), "backup");
  mkdirSync(path.join(dataDir, "fashion-photos"));
  writeFileSync(path.join(dataDir, "fashion-photos", "a.jpg"), "photo");
  mkdirSync(path.join(dataDir, "fashion-garments"));
}

function claim(username = "owner", passphrase = PASSPHRASE) {
  switchBrowser("claimer");
  return claimAction({}, form({ username, passphrase }));
}

const rootItems = () => readdirSync(dataDir).sort();

beforeEach(() => {
  dataDir = setupMultiUserEnv();
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  __setClaimFailpointForTests(null);
  vi.restoreAllMocks();
  teardownMultiUserEnv();
});

describe("legacy claim", () => {
  it("moves the old vault into the new admin's account and signs in", async () => {
    await makeLegacyVault();
    expect(getInstallState()).toBe("legacy-claim");
    await expectRedirect(claim(), "/dashboard");

    const me = findByUsername("owner")!;
    expect(me.role).toBe("admin");
    const userDir = path.join(dataDir, "users", me.id);
    for (const item of [
      "app.db",
      "keyring.json",
      "backups",
      "fashion-photos",
      "fashion-garments",
    ]) {
      expect(existsSync(path.join(userDir, item))).toBe(true);
      expect(existsSync(path.join(dataDir, item))).toBe(false);
    }
    expect(readFileSync(path.join(userDir, "fashion-photos", "a.jpg"), "utf8")).toBe("photo");
    expect(existsSync(path.join(dataDir, CLAIM_MARKER))).toBe(false);
    expect(getInstallState()).toBe("ready");
    expect(await asUser("claimer", () => goalNames())).toEqual(["legacy goal"]);

    // The old passphrase is now the password.
    switchBrowser("other");
    await expectRedirect(
      loginAction({}, form({ username: "owner", password: PASSPHRASE })),
      "/dashboard",
    );
  });

  it("leaves every file in place on a wrong passphrase", async () => {
    await makeLegacyVault();
    const before = rootItems();
    const state = await claim("owner", "wrong-passphrase");
    expect(state.error).toMatch(/doesn't open/);
    expect(rootItems()).toEqual(before);
    expect(countAccounts()).toBe(0);
    expect(getInstallState()).toBe("legacy-claim");
  });

  it("is refused once accounts exist, without touching the old files", async () => {
    await setupAdmin("admin");
    await makeLegacyVault();
    const before = rootItems();
    expect(getInstallState()).toBe("ready");
    const state = await claim();
    expect(state.error).toMatch(/already set up/);
    expect(rootItems()).toEqual(before);
  });

  it("reports a half-present legacy vault as broken", async () => {
    await makeLegacyVault();
    const { rmSync } = await import("node:fs");
    rmSync(path.join(dataDir, "app.db"));
    rmSync(path.join(dataDir, "app.db-wal"), { force: true });
    expect(getInstallState()).toBe("legacy-broken");
  });

  const steps = [
    "marker-written",
    "moved:app.db",
    "moved:keyring.json",
    "moved:backups",
    "moved:fashion-photos",
    "renamed",
    "account-created",
  ];

  for (const step of steps) {
    it(`resumes on the next request after a crash at ${step}`, async () => {
      await makeLegacyVault();
      __setClaimFailpointForTests(step);
      const state = await claim();
      expect(state.error).toBeDefined();
      __setClaimFailpointForTests(null);

      expect(getInstallState()).toBe("ready");
      const me = findByUsername("owner")!;
      expect(existsSync(path.join(dataDir, "users", me.id, "app.db"))).toBe(true);
      expect(existsSync(path.join(dataDir, "users", `${me.id}.partial`))).toBe(false);
      expect(existsSync(path.join(dataDir, CLAIM_MARKER))).toBe(false);
      switchBrowser("again");
      await expectRedirect(
        loginAction({}, form({ username: "owner", password: PASSPHRASE })),
        "/dashboard",
      );
      expect(await asUser("again", () => goalNames())).toEqual(["legacy goal"]);
    });
  }

  it("an interrupted claim resumes only with the right passphrase", async () => {
    await makeLegacyVault();
    __setClaimFailpointForTests("moved:keyring.json");
    expect((await claim()).error).toBeDefined();
    __setClaimFailpointForTests(null);
    await expect(
      claimLegacyVault({ username: "owner", passphrase: "nope-nope" }),
    ).rejects.toBeInstanceOf(CredentialError);
    const { account } = await claimLegacyVault({ username: "ignored", passphrase: PASSPHRASE });
    expect(account.username).toBe("owner");
    expect(getInstallState()).toBe("ready");
  });
});
