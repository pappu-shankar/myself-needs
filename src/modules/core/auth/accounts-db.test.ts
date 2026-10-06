// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { openRegistryDb, REGISTRY_SCHEMA_VERSION, migrateRegistry } from "./accounts-db";

const dirs: string[] = [];
function tempDir(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "registry-"));
  dirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("openRegistryDb", () => {
  it("creates the file 0600 in WAL mode with foreign keys on", () => {
    const file = path.join(tempDir(), "accounts.db");
    const db = openRegistryDb(file);
    expect(statSync(file).mode & 0o777).toBe(0o600);
    expect(db.pragma("journal_mode", { simple: true })).toBe("wal");
    expect(db.pragma("foreign_keys", { simple: true })).toBe(1);
    expect(db.pragma("user_version", { simple: true })).toBe(REGISTRY_SCHEMA_VERSION);
    db.close();
  });

  it("creates every table", () => {
    const db = openRegistryDb(":memory:");
    const tables = (
      db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]
    ).map((row) => row.name);
    expect(tables).toEqual(
      expect.arrayContaining([
        "accounts",
        "invites",
        "sessions",
        "audit",
        "spaces",
        "space_members",
        "alerts_dismissed",
        "login_throttle",
      ]),
    );
    db.close();
  });

  it("is idempotent across reopen", () => {
    const file = path.join(tempDir(), "accounts.db");
    openRegistryDb(file).close();
    const db = openRegistryDb(file);
    migrateRegistry(db);
    expect(db.pragma("user_version", { simple: true })).toBe(REGISTRY_SCHEMA_VERSION);
    db.close();
  });

  it("refuses a database from a newer app version", () => {
    const file = path.join(tempDir(), "accounts.db");
    const db = openRegistryDb(file);
    db.pragma(`user_version = ${REGISTRY_SCHEMA_VERSION + 1}`);
    db.close();
    expect(() => openRegistryDb(file)).toThrow(/newer version/);
  });

  it("enforces role and status checks", () => {
    const db = openRegistryDb(":memory:");
    const insert = db.prepare(
      "INSERT INTO accounts (id, username, role, status, public_key, created_at) VALUES (?, ?, ?, ?, 'pk', 0)",
    );
    expect(() => insert.run("1", "a", "root", "active")).toThrow(/CHECK/);
    expect(() => insert.run("2", "b", "member", "zombie")).toThrow(/CHECK/);
    db.close();
  });
});
