// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { mkdirSync, rmSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const FAST_KDF = { N: 2 ** 10, r: 1, p: 1 };

let tmpRoot: string;
let vaultDir: string;
let originalDataDir: string | undefined;
let crypto: typeof import("./crypto");
let paths: typeof import("@/modules/core/env/paths");
let errors: typeof import("@/modules/core/errors");

beforeEach(async () => {
  tmpRoot = path.join(process.cwd(), ".vitest-tmp", randomUUID());
  mkdirSync(tmpRoot, { recursive: true });
  originalDataDir = process.env.APP_DATA_DIR;
  process.env.APP_DATA_DIR = path.join(tmpRoot, "data");

  vi.resetModules();
  crypto = await import("./crypto");
  paths = await import("@/modules/core/env/paths");
  errors = await import("@/modules/core/errors");
  crypto.__setKdfParamsForTests(FAST_KDF);
  vaultDir = paths.getUserDir(randomUUID());
});

afterEach(() => {
  process.env.APP_DATA_DIR = originalDataDir;
  rmSync(tmpRoot, { recursive: true, force: true });
  vi.resetModules();
});

const keyringPath = () => paths.vaultKeyringPath(vaultDir);
const readKeyringJson = () => JSON.parse(readFileSync(keyringPath(), "utf8"));

describe("recovery key format", () => {
  it("generates a well-formatted key", () => {
    const key = crypto.generateRecoveryKey();
    expect(key).toMatch(/^[0-9a-f]{8}-[0-9a-f]{8}-[0-9a-f]{8}-[0-9a-f]{8}$/);
  });

  it("generates different keys each time", () => {
    expect(crypto.generateRecoveryKey()).not.toBe(crypto.generateRecoveryKey());
  });

  it("normalizes uppercase, mixed spacing, and missing dashes to the same canonical form", () => {
    const canonical = "a1b2c3d4-e5f6a7b8-c9d0e1f2-a3b4c5d6";
    expect(crypto.normalizeRecoveryKey("A1B2C3D4-E5F6A7B8-C9D0E1F2-A3B4C5D6")).toBe(canonical);
    expect(crypto.normalizeRecoveryKey("a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6")).toBe(canonical);
    expect(crypto.normalizeRecoveryKey("  a1b2c3d4 - e5f6a7b8 -c9d0e1f2- a3b4c5d6  ")).toBe(
      canonical,
    );
  });

  it("rejects malformed input", () => {
    expect(crypto.normalizeRecoveryKey("too-short")).toBeNull();
    expect(crypto.normalizeRecoveryKey("a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6ff")).toBeNull();
    expect(crypto.normalizeRecoveryKey("not-hex-at-allxxxxxxxxxxxxxxxxxxxxxxxx")).toBeNull();
  });
});

describe("vault lifecycle", () => {
  it("unlocks with the correct password and recovers the same DEK createVault returned", async () => {
    const { dekHex } = await crypto.createVault(vaultDir, "correct-horse-battery");
    await expect(crypto.unlockWithPassword(vaultDir, "correct-horse-battery")).resolves.toBe(
      dekHex,
    );
  });

  it("unlocks with the correct recovery key and recovers the same DEK", async () => {
    const { dekHex, recoveryKey } = await crypto.createVault(vaultDir, "correct-horse-battery");
    await expect(crypto.unlockWithRecoveryKey(vaultDir, recoveryKey)).resolves.toBe(dekHex);
  });

  it("keeps vaults in different directories independent", async () => {
    const otherDir = paths.getUserDir(randomUUID());
    const a = await crypto.createVault(vaultDir, "password-for-a");
    const b = await crypto.createVault(otherDir, "password-for-b");

    expect(a.dekHex).not.toBe(b.dekHex);
    await expect(crypto.unlockWithPassword(otherDir, "password-for-a")).rejects.toThrow(
      errors.CredentialError,
    );
    await expect(crypto.unlockWithPassword(otherDir, "password-for-b")).resolves.toBe(b.dekHex);
  });

  it("rejects a wrong password with a CredentialError", async () => {
    await crypto.createVault(vaultDir, "correct-horse-battery");
    await expect(crypto.unlockWithPassword(vaultDir, "wrong-password")).rejects.toThrow(
      errors.CredentialError,
    );
    await expect(crypto.unlockWithPassword(vaultDir, "wrong-password")).rejects.toThrow(
      "Incorrect password",
    );
  });

  it("rejects a wrong recovery key with a distinct message from a malformed one", async () => {
    await crypto.createVault(vaultDir, "correct-horse-battery");
    await expect(
      crypto.unlockWithRecoveryKey(vaultDir, "ffffffff-ffffffff-ffffffff-ffffffff"),
    ).rejects.toThrow("Incorrect recovery key");
    await expect(crypto.unlockWithRecoveryKey(vaultDir, "not-a-valid-key")).rejects.toThrow(
      "Invalid recovery key format",
    );
  });

  it("re-wraps for a new password while leaving the recovery slot untouched", async () => {
    const { dekHex, recoveryKey } = await crypto.createVault(vaultDir, "old-password");

    await crypto.rewrapPassword(vaultDir, dekHex, "new-password");

    await expect(crypto.unlockWithPassword(vaultDir, "old-password")).rejects.toThrow(
      "Incorrect password",
    );
    await expect(crypto.unlockWithPassword(vaultDir, "new-password")).resolves.toBe(dekHex);
    await expect(crypto.unlockWithRecoveryKey(vaultDir, recoveryKey)).resolves.toBe(dekHex);
  });

  it("changes the password only when the current one is right", async () => {
    const { dekHex } = await crypto.createVault(vaultDir, "old-password");

    await expect(crypto.changePassword(vaultDir, "not-it", "new-password")).rejects.toThrow(
      "Incorrect password",
    );
    await crypto.changePassword(vaultDir, "old-password", "new-password");

    await expect(crypto.unlockWithPassword(vaultDir, "new-password")).resolves.toBe(dekHex);
  });

  it("rotates the recovery key: the old key stops working, the new one and the password still do", async () => {
    const { dekHex, recoveryKey: oldKey } = await crypto.createVault(
      vaultDir,
      "correct-horse-battery",
    );

    await expect(crypto.rotateRecoveryKey(vaultDir, "wrong")).rejects.toThrow("Incorrect password");
    const newKey = await crypto.rotateRecoveryKey(vaultDir, "correct-horse-battery");

    expect(newKey).not.toBe(oldKey);
    await expect(crypto.unlockWithRecoveryKey(vaultDir, oldKey)).rejects.toThrow(
      "Incorrect recovery key",
    );
    await expect(crypto.unlockWithRecoveryKey(vaultDir, newKey)).resolves.toBe(dekHex);
    await expect(crypto.unlockWithPassword(vaultDir, "correct-horse-battery")).resolves.toBe(
      dekHex,
    );
  });

  it("fails cleanly if the keyring file is tampered with, rather than returning garbage", async () => {
    await crypto.createVault(vaultDir, "correct-horse-battery");

    const keyring = readKeyringJson();
    keyring.passphrase.ciphertext = keyring.passphrase.ciphertext.startsWith("00")
      ? "ff" + keyring.passphrase.ciphertext.slice(2)
      : "00" + keyring.passphrase.ciphertext.slice(2);
    writeFileSync(keyringPath(), JSON.stringify(keyring));

    await expect(crypto.unlockWithPassword(vaultDir, "correct-horse-battery")).rejects.toThrow(
      "Incorrect password",
    );
  });

  it("binds each wrap to its slot, so swapping slots doesn't unlock", async () => {
    const { recoveryKey } = await crypto.createVault(vaultDir, "correct-horse-battery");
    const keyring = readKeyringJson();
    writeFileSync(keyringPath(), JSON.stringify({ ...keyring, passphrase: keyring.recovery }));

    await expect(crypto.unlockWithPassword(vaultDir, recoveryKey)).rejects.toThrow(
      errors.CredentialError,
    );
  });

  it("reports an unreadable keyring as a vault problem, not a wrong password", async () => {
    await crypto.createVault(vaultDir, "correct-horse-battery");
    writeFileSync(keyringPath(), "{ not json");

    await expect(crypto.unlockWithPassword(vaultDir, "correct-horse-battery")).rejects.toThrow(
      errors.VaultStateError,
    );
  });
});

describe("KDF parameters", () => {
  it("persists the params a keyring was created with", async () => {
    await crypto.createVault(vaultDir, "correct-horse-battery");
    expect(readKeyringJson().kdf).toEqual(FAST_KDF);
  });

  it("keeps a keyring's own params when re-wrapping, even after the defaults change", async () => {
    const { dekHex } = await crypto.createVault(vaultDir, "old-password");
    crypto.__setKdfParamsForTests({ N: 2 ** 11, r: 1, p: 1 });

    await crypto.rewrapPassword(vaultDir, dekHex, "new-password");
    await crypto.rotateRecoveryKey(vaultDir, "new-password");

    expect(readKeyringJson().kdf).toEqual(FAST_KDF);
    await expect(crypto.unlockWithPassword(vaultDir, "new-password")).resolves.toBe(dekHex);
  });

  it("still unlocks a legacy keyring that has no kdf field (N=2^17, r=8, p=1)", async () => {
    crypto.__setKdfParamsForTests(crypto.LEGACY_KDF);
    const { dekHex } = await crypto.createVault(vaultDir, "correct-horse-battery");
    const { kdf, ...legacy } = readKeyringJson();
    expect(kdf).toEqual(crypto.LEGACY_KDF);
    writeFileSync(keyringPath(), JSON.stringify(legacy));

    crypto.__setKdfParamsForTests(FAST_KDF);
    await expect(crypto.unlockWithPassword(vaultDir, "correct-horse-battery")).resolves.toBe(
      dekHex,
    );
  });

  it("rejects absurd params in a keyring as unreadable instead of running them", async () => {
    await crypto.createVault(vaultDir, "correct-horse-battery");
    writeFileSync(
      keyringPath(),
      JSON.stringify({ ...readKeyringJson(), kdf: { N: 2 ** 24, r: 8, p: 1 } }),
    );
    await expect(crypto.unlockWithPassword(vaultDir, "correct-horse-battery")).rejects.toThrow(
      errors.VaultStateError,
    );
  });

  it("calibrates to a power-of-two N within [2^15, 2^20]", async () => {
    crypto.__setKdfParamsForTests(null);
    const params = await crypto.calibrateKdf();
    expect(params.r).toBe(8);
    expect(params.p).toBe(1);
    expect(params.N).toBeGreaterThanOrEqual(2 ** 15);
    expect(params.N).toBeLessThanOrEqual(2 ** 20);
    expect(Math.log2(params.N) % 1).toBe(0);
    await expect(crypto.calibrateKdf()).resolves.toBe(params);
  });

  it("refuses the test override outside tests", () => {
    vi.stubEnv("NODE_ENV", "production");
    try {
      expect(() => crypto.__setKdfParamsForTests(FAST_KDF)).toThrow(/only available in tests/);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe("KDF concurrency limit", () => {
  it("runs 2, queues 8 and rejects the rest with KdfBusyError", async () => {
    const { dekHex } = await crypto.createVault(vaultDir, "correct-horse-battery");

    const attempts = Array.from({ length: 12 }, () =>
      crypto.unlockWithPassword(vaultDir, "correct-horse-battery"),
    );
    expect(crypto.getKdfQueueStats()).toEqual({ running: 2, queued: 8 });

    const results = await Promise.allSettled(attempts);
    const busy = results.filter(
      (r) => r.status === "rejected" && r.reason instanceof crypto.KdfBusyError,
    );
    const ok = results.filter((r) => r.status === "fulfilled" && r.value === dekHex);
    expect(busy).toHaveLength(2);
    expect(ok).toHaveLength(10);
    expect(crypto.getKdfQueueStats()).toEqual({ running: 0, queued: 0 });
  });
});

describe("dummy unwrap", () => {
  it("resolves for any password without revealing anything", async () => {
    await expect(crypto.dummyUnwrap("whatever")).resolves.toBeUndefined();
    await expect(crypto.dummyUnwrap("")).resolves.toBeUndefined();
  });

  it("goes through the same KDF path as a real unlock", async () => {
    await crypto.dummyUnwrap("warm-up"); // builds the dummy keyring

    const pending = crypto.dummyUnwrap("x");
    await Promise.resolve(); // let it reach the KDF slot
    await Promise.resolve();
    expect(crypto.getKdfQueueStats().running).toBe(1);
    await pending;

    await crypto.createVault(vaultDir, "correct-horse-battery");
    const saturating = Array.from({ length: 10 }, () =>
      crypto.unlockWithPassword(vaultDir, "correct-horse-battery"),
    );
    await expect(crypto.dummyUnwrap("x")).rejects.toThrow(crypto.KdfBusyError);
    await Promise.all(saturating);
  });
});

describe("identity storage", () => {
  it("stores an identity in the keyring without disturbing the wraps", async () => {
    const { dekHex } = await crypto.createVault(vaultDir, "correct-horse-battery");
    expect(crypto.readKeyringIdentity(vaultDir)).toBeNull();

    const identity = {
      publicKey: Buffer.alloc(32, 1).toString("base64"),
      privateKey: { iv: "aaaa", ciphertext: "bbbb", tag: "cccc" },
    };
    crypto.writeKeyringIdentity(vaultDir, identity);

    expect(crypto.readKeyringIdentity(vaultDir)).toEqual(identity);
    expect(statSync(keyringPath()).mode & 0o777).toBe(0o600);
    await expect(crypto.unlockWithPassword(vaultDir, "correct-horse-battery")).resolves.toBe(
      dekHex,
    );
    await crypto.changePassword(vaultDir, "correct-horse-battery", "another-password");
    expect(crypto.readKeyringIdentity(vaultDir)).toEqual(identity);
  });
});

describe("vault status and overwrite protection", () => {
  it("is decided from both files, never from the database alone", async () => {
    expect(crypto.getVaultStatus(vaultDir)).toBe("uninitialized");

    await crypto.createVault(vaultDir, "correct-horse-battery");
    expect(crypto.getVaultStatus(vaultDir)).toBe("missing-database");

    writeFileSync(paths.vaultDbPath(vaultDir), "");
    expect(crypto.getVaultStatus(vaultDir)).toBe("ready");

    rmSync(keyringPath());
    expect(crypto.getVaultStatus(vaultDir)).toBe("missing-keyring");
  });

  it("refuses to create a vault over an existing keyring, even when app.db is missing", async () => {
    const { dekHex } = await crypto.createVault(vaultDir, "first-password");

    await expect(crypto.createVault(vaultDir, "second-password")).rejects.toThrow(
      errors.VaultStateError,
    );
    await expect(crypto.unlockWithPassword(vaultDir, "first-password")).resolves.toBe(dekHex);
  });

  it("refuses to create a vault next to an existing database", async () => {
    writeFileSync(paths.vaultDbPath(vaultDir), "");
    await expect(crypto.createVault(vaultDir, "correct-horse-battery")).rejects.toThrow(
      errors.VaultStateError,
    );
  });
});

describe("file permissions", () => {
  it("writes the keyring and session secret readable by the owner only", async () => {
    await crypto.createVault(vaultDir, "correct-horse-battery");
    await crypto.rotateRecoveryKey(vaultDir, "correct-horse-battery");
    crypto.getOrCreateSessionSecret();

    expect(statSync(keyringPath()).mode & 0o777).toBe(0o600);
    expect(statSync(paths.getSessionSecretFilePath()).mode & 0o777).toBe(0o600);
    expect(statSync(paths.getDataDir()).mode & 0o777).toBe(0o700);
    expect(statSync(vaultDir).mode & 0o777).toBe(0o700);
  });

  it("creates the session secret once and then reuses it", () => {
    const first = crypto.getOrCreateSessionSecret();
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(crypto.getOrCreateSessionSecret()).toBe(first);
  });
});
