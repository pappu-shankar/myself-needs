// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, rmSync, statSync } from "node:fs";
import path from "node:path";

let tmpRoot: string;
let dataDir: string;
let originalDataDir: string | undefined;
let paths: typeof import("./paths");
let scope: typeof import("@/modules/core/db/request-scope");
let errors: typeof import("@/modules/core/errors");

beforeEach(async () => {
  tmpRoot = path.join(process.cwd(), ".vitest-tmp", randomUUID());
  mkdirSync(tmpRoot, { recursive: true });
  dataDir = path.join(tmpRoot, "data");
  originalDataDir = process.env.APP_DATA_DIR;
  process.env.APP_DATA_DIR = dataDir;

  vi.resetModules();
  paths = await import("./paths");
  scope = await import("@/modules/core/db/request-scope");
  errors = await import("@/modules/core/errors");
});

afterEach(() => {
  process.env.APP_DATA_DIR = originalDataDir;
  rmSync(tmpRoot, { recursive: true, force: true });
  vi.resetModules();
});

describe("assertSafeId", () => {
  it("accepts ids from crypto.randomUUID()", () => {
    const id = randomUUID();
    expect(paths.assertSafeId(id)).toBe(id);
  });

  it.each([
    "",
    "..",
    "../../etc",
    "/abs/path",
    "a/b",
    "user\0",
    `${randomUUID()}/..`,
    randomUUID().toUpperCase(),
    "00000000-0000-0000-0000-000000000000",
  ])("rejects %j", (id) => {
    expect(() => paths.assertSafeId(id)).toThrow(errors.VaultStateError);
  });
});

describe("vault directories", () => {
  it("puts user and space vaults in owner-only dirs under the data dir", () => {
    const userId = randomUUID();
    const spaceId = randomUUID();

    const userDir = paths.getUserDir(userId);
    const spaceDir = paths.getSpaceDir(spaceId);

    expect(userDir).toBe(path.join(dataDir, "users", userId));
    expect(spaceDir).toBe(path.join(dataDir, "spaces", spaceId));
    for (const dir of [userDir, spaceDir, path.dirname(userDir), path.dirname(spaceDir)]) {
      expect(statSync(dir).mode & 0o777).toBe(0o700);
    }
    expect(paths.getVaultDir({ kind: "user", id: userId })).toBe(userDir);
    expect(paths.getVaultDir({ kind: "space", id: spaceId })).toBe(spaceDir);
  });

  it("never creates a directory for an unsafe id", () => {
    expect(() => paths.getUserDir("../escape")).toThrow(errors.VaultStateError);
    expect(() => paths.getVaultDir({ kind: "space", id: "../../x" })).toThrow(
      errors.VaultStateError,
    );
    expect(existsSync(path.join(dataDir, "escape"))).toBe(false);
  });

  it("names a vault's files inside its dir", () => {
    const dir = paths.getUserDir(randomUUID());
    expect(paths.vaultDbPath(dir)).toBe(path.join(dir, "app.db"));
    expect(paths.vaultKeyringPath(dir)).toBe(path.join(dir, "keyring.json"));
    expect(paths.vaultBackupsDir(dir)).toBe(path.join(dir, "backups"));
    expect(statSync(path.join(dir, "backups")).mode & 0o777).toBe(0o700);
  });

  it("keeps the shared files and legacy layout at the top of the data dir", () => {
    expect(paths.getAccountsDbPath()).toBe(path.join(dataDir, "accounts.db"));
    expect(paths.getSessionSecretFilePath()).toBe(path.join(dataDir, "session-secret.bin"));
    expect(paths.getAvatarsDir()).toBe(path.join(dataDir, "avatars"));
    expect(paths.getLegacyDbPath()).toBe(path.join(dataDir, "app.db"));
    expect(paths.getLegacyKeyringPath()).toBe(path.join(dataDir, "keyring.json"));
  });
});

describe("getCurrentVaultDataDir", () => {
  it("throws when no user is bound to the request", () => {
    expect(() => paths.getCurrentVaultDataDir()).toThrow(errors.VaultStateError);
  });

  it("returns the scoped vault's dir", () => {
    const spaceId = randomUUID();
    const dir = scope.runWithScope(
      {
        userId: randomUUID(),
        role: "member",
        sessionId: "sid",
        vault: { kind: "space", id: spaceId },
        spaceRole: "editor",
      },
      () => paths.getCurrentVaultDataDir(),
    );
    expect(dir).toBe(path.join(dataDir, "spaces", spaceId));
  });
});
