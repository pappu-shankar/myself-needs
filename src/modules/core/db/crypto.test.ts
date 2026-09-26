import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { mkdirSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

let tmpDirRelative: string;
let originalDataDir: string | undefined;
let crypto: typeof import("./crypto");
let paths: typeof import("@/modules/core/env/paths");

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
  it("unlocks with the correct passphrase and recovers the same DEK createVault returned", () => {
    const { dekHex } = crypto.createVault("correct-horse-battery");
    expect(crypto.unlockWithPassphrase("correct-horse-battery")).toBe(dekHex);
  });

  it("unlocks with the correct recovery key and recovers the same DEK", () => {
    const { dekHex, recoveryKey } = crypto.createVault("correct-horse-battery");
    expect(crypto.unlockWithRecoveryKey(recoveryKey)).toBe(dekHex);
  });

  it("rejects a wrong passphrase", () => {
    crypto.createVault("correct-horse-battery");
    expect(() => crypto.unlockWithPassphrase("wrong-passphrase")).toThrow("Incorrect passphrase");
  });

  it("rejects a wrong recovery key with a distinct message from a malformed one", () => {
    crypto.createVault("correct-horse-battery");
    expect(() => crypto.unlockWithRecoveryKey("ffffffff-ffffffff-ffffffff-ffffffff")).toThrow(
      "Incorrect recovery key",
    );
    expect(() => crypto.unlockWithRecoveryKey("not-a-valid-key")).toThrow(
      "Invalid recovery key format",
    );
  });

  it("re-wraps for a new passphrase while leaving the recovery slot untouched", () => {
    const { dekHex, recoveryKey } = crypto.createVault("old-passphrase");

    crypto.rewrapForNewPassphrase(dekHex, "new-passphrase");

    expect(() => crypto.unlockWithPassphrase("old-passphrase")).toThrow("Incorrect passphrase");
    expect(crypto.unlockWithPassphrase("new-passphrase")).toBe(dekHex);
    expect(crypto.unlockWithRecoveryKey(recoveryKey)).toBe(dekHex);
  });

  it("fails cleanly if the keyring file is tampered with, rather than returning garbage", () => {
    crypto.createVault("correct-horse-battery");

    const keyringPath = paths.getKeyringFilePath();
    const keyring = JSON.parse(readFileSync(keyringPath, "utf8"));
    keyring.passphrase.ciphertext = keyring.passphrase.ciphertext.startsWith("00")
      ? "ff" + keyring.passphrase.ciphertext.slice(2)
      : "00" + keyring.passphrase.ciphertext.slice(2);
    writeFileSync(keyringPath, JSON.stringify(keyring));

    expect(() => crypto.unlockWithPassphrase("correct-horse-battery")).toThrow(
      "Incorrect passphrase",
    );
  });
});
