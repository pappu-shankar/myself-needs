// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { mkdirSync, rmSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

let tmpDirRelative: string;
let originalDataDir: string | undefined;
let crypto: typeof import("./crypto");
let paths: typeof import("@/modules/core/env/paths");
let errors: typeof import("@/modules/core/errors");

beforeEach(async () => {
  // `paths.ts` computes its data dir once at module load via
  // `path.join(process.cwd(), APP_DATA_DIR)`, so the override must be set
  // and the module freshly re-imported before each test.
  tmpDirRelative = path.join(".vitest-tmp", randomUUID());
  mkdirSync(path.join(process.cwd(), tmpDirRelative), { recursive: true });

  originalDataDir = process.env.APP_DATA_DIR;
  process.env.APP_DATA_DIR = tmpDirRelative;

  vi.resetModules();
  crypto = await import("./crypto");
  paths = await import("@/modules/core/env/paths");
  errors = await import("@/modules/core/errors");
});

afterEach(() => {
  process.env.APP_DATA_DIR = originalDataDir;
  rmSync(path.join(process.cwd(), tmpDirRelative), { recursive: true, force: true });
  vi.resetModules();
});

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
  it("unlocks with the correct passphrase and recovers the same DEK createVault returned", async () => {
    const { dekHex } = await crypto.createVault("correct-horse-battery");
    await expect(crypto.unlockWithPassphrase("correct-horse-battery")).resolves.toBe(dekHex);
  });

  it("unlocks with the correct recovery key and recovers the same DEK", async () => {
    const { dekHex, recoveryKey } = await crypto.createVault("correct-horse-battery");
    await expect(crypto.unlockWithRecoveryKey(recoveryKey)).resolves.toBe(dekHex);
  });

  it("rejects a wrong passphrase with a CredentialError", async () => {
    await crypto.createVault("correct-horse-battery");
    await expect(crypto.unlockWithPassphrase("wrong-passphrase")).rejects.toThrow(
      errors.CredentialError,
    );
    await expect(crypto.unlockWithPassphrase("wrong-passphrase")).rejects.toThrow(
      "Incorrect passphrase",
    );
  });

  it("rejects a wrong recovery key with a distinct message from a malformed one", async () => {
    await crypto.createVault("correct-horse-battery");
    await expect(
      crypto.unlockWithRecoveryKey("ffffffff-ffffffff-ffffffff-ffffffff"),
    ).rejects.toThrow("Incorrect recovery key");
    await expect(crypto.unlockWithRecoveryKey("not-a-valid-key")).rejects.toThrow(
      "Invalid recovery key format",
    );
  });

  it("re-wraps for a new passphrase while leaving the recovery slot untouched", async () => {
    const { dekHex, recoveryKey } = await crypto.createVault("old-passphrase");

    await crypto.rewrapForNewPassphrase(dekHex, "new-passphrase");

    await expect(crypto.unlockWithPassphrase("old-passphrase")).rejects.toThrow(
      "Incorrect passphrase",
    );
    await expect(crypto.unlockWithPassphrase("new-passphrase")).resolves.toBe(dekHex);
    await expect(crypto.unlockWithRecoveryKey(recoveryKey)).resolves.toBe(dekHex);
  });

  it("changes the passphrase only when the current one is right", async () => {
    const { dekHex } = await crypto.createVault("old-passphrase");

    await expect(crypto.changePassphrase("not-it", "new-passphrase")).rejects.toThrow(
      "Incorrect passphrase",
    );
    await crypto.changePassphrase("old-passphrase", "new-passphrase");

    await expect(crypto.unlockWithPassphrase("new-passphrase")).resolves.toBe(dekHex);
  });

  it("rotates the recovery key: the old key stops working, the new one and the passphrase still do", async () => {
    const { dekHex, recoveryKey: oldKey } = await crypto.createVault("correct-horse-battery");

    await expect(crypto.rotateRecoveryKey("wrong-passphrase")).rejects.toThrow(
      "Incorrect passphrase",
    );
    const newKey = await crypto.rotateRecoveryKey("correct-horse-battery");

    expect(newKey).not.toBe(oldKey);
    await expect(crypto.unlockWithRecoveryKey(oldKey)).rejects.toThrow("Incorrect recovery key");
    await expect(crypto.unlockWithRecoveryKey(newKey)).resolves.toBe(dekHex);
    await expect(crypto.unlockWithPassphrase("correct-horse-battery")).resolves.toBe(dekHex);
  });

  it("fails cleanly if the keyring file is tampered with, rather than returning garbage", async () => {
    await crypto.createVault("correct-horse-battery");

    const keyringPath = paths.getKeyringFilePath();
    const keyring = JSON.parse(readFileSync(keyringPath, "utf8"));
    keyring.passphrase.ciphertext = keyring.passphrase.ciphertext.startsWith("00")
      ? "ff" + keyring.passphrase.ciphertext.slice(2)
      : "00" + keyring.passphrase.ciphertext.slice(2);
    writeFileSync(keyringPath, JSON.stringify(keyring));

    await expect(crypto.unlockWithPassphrase("correct-horse-battery")).rejects.toThrow(
      "Incorrect passphrase",
    );
  });

  it("reports an unreadable keyring as a vault problem, not a wrong passphrase", async () => {
    await crypto.createVault("correct-horse-battery");
    writeFileSync(paths.getKeyringFilePath(), "{ not json");

    await expect(crypto.unlockWithPassphrase("correct-horse-battery")).rejects.toThrow(
      errors.VaultStateError,
    );
  });
});

describe("vault status and overwrite protection", () => {
  it("is decided from both files, never from the database alone", async () => {
    expect(crypto.getVaultStatus()).toBe("uninitialized");

    await crypto.createVault("correct-horse-battery");
    expect(crypto.getVaultStatus()).toBe("missing-database");

    writeFileSync(paths.getDbFilePath(), "");
    expect(crypto.getVaultStatus()).toBe("ready");

    rmSync(paths.getKeyringFilePath());
    expect(crypto.getVaultStatus()).toBe("missing-keyring");
  });

  it("refuses to create a vault over an existing keyring, even when app.db is missing", async () => {
    const { dekHex } = await crypto.createVault("first-passphrase");

    await expect(crypto.createVault("second-passphrase")).rejects.toThrow(errors.VaultStateError);
    await expect(crypto.unlockWithPassphrase("first-passphrase")).resolves.toBe(dekHex);
  });

  it("refuses to create a vault next to an existing database", async () => {
    writeFileSync(paths.getDbFilePath(), "");
    await expect(crypto.createVault("correct-horse-battery")).rejects.toThrow(
      errors.VaultStateError,
    );
  });
});

describe("file permissions", () => {
  it("writes the keyring and session secret readable by the owner only", async () => {
    await crypto.createVault("correct-horse-battery");
    await crypto.rotateRecoveryKey("correct-horse-battery");
    crypto.getOrCreateSessionSecret();

    expect(statSync(paths.getKeyringFilePath()).mode & 0o777).toBe(0o600);
    expect(statSync(paths.getSessionSecretFilePath()).mode & 0o777).toBe(0o600);
    expect(statSync(paths.getDataDir()).mode & 0o777).toBe(0o700);
  });

  it("creates the session secret once and then reuses it", () => {
    const first = crypto.getOrCreateSessionSecret();
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(crypto.getOrCreateSessionSecret()).toBe(first);
  });
});
