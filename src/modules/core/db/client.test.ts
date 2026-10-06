// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { randomBytes, randomUUID } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import Database from "better-sqlite3-multiple-ciphers";
import { sql } from "drizzle-orm";
import type { RequestScope, VaultRef } from "./vault-types";

const REAL_MIGRATIONS = path.join(process.cwd(), "drizzle");

let workDir: string;
let migrationsDir: string;
let originalDataDir: string | undefined;
let client: typeof import("./client");
let scope: typeof import("./request-scope");
let errors: typeof import("@/modules/core/errors");
let paths: typeof import("@/modules/core/env/paths");
let unsubscribe: (() => void) | undefined;

interface Journal {
  entries: { idx: number; when: number; tag: string; version: string; breakpoints: boolean }[];
}

function readJournal(): Journal {
  return JSON.parse(readFileSync(path.join(migrationsDir, "meta", "_journal.json"), "utf8"));
}

function writeJournal(journal: Journal): void {
  writeFileSync(path.join(migrationsDir, "meta", "_journal.json"), JSON.stringify(journal));
}

const key = () => randomBytes(32).toString("hex");
const userRef = (): VaultRef => ({ kind: "user", id: randomUUID() });
const spaceRef = (): VaultRef => ({ kind: "space", id: randomUUID() });

function scopeFor(vault: VaultRef): RequestScope {
  return {
    userId: vault.kind === "user" ? vault.id : randomUUID(),
    role: "member",
    sessionId: "sid",
    vault,
    spaceRole: vault.kind === "space" ? "editor" : null,
  };
}

/** Runs `fn` as a request for `vault`, the way actions/route handlers will. */
function inVault<T>(vault: VaultRef, fn: () => T): T {
  return scope.runWithScope(scopeFor(vault), fn);
}

function appliedCount(vault: VaultRef): number {
  return inVault(
    vault,
    () => client.getDb().get<{ n: number }>(sql`SELECT count(*) AS n FROM __drizzle_migrations`).n,
  );
}

const dbFile = (vault: VaultRef) => paths.vaultDbPath(paths.getVaultDir(vault));
const backupsOf = (vault: VaultRef) => paths.vaultBackupsDir(paths.getVaultDir(vault));

beforeEach(async () => {
  workDir = path.join(process.cwd(), ".vitest-tmp", randomUUID());
  migrationsDir = path.join(workDir, "migrations");
  mkdirSync(workDir, { recursive: true });
  cpSync(REAL_MIGRATIONS, migrationsDir, { recursive: true });

  originalDataDir = process.env.APP_DATA_DIR;
  process.env.APP_DATA_DIR = path.join(workDir, "data");

  vi.resetModules();
  vi.doMock("@/modules/core/env/paths", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/modules/core/env/paths")>()),
    getMigrationsDir: () => migrationsDir,
  }));
  client = await import("./client");
  scope = await import("./request-scope");
  errors = await import("@/modules/core/errors");
  paths = await import("@/modules/core/env/paths");
  // The pool lives on globalThis: start every test from an empty one.
  client.closeAllVaults();
  client.setTestDefaultDatabase(null);
});

afterEach(() => {
  vi.unstubAllEnvs();
  unsubscribe?.();
  unsubscribe = undefined;
  client.closeAllVaults();
  client.setTestDefaultDatabase(null);
  vi.useRealTimers();
  vi.doUnmock("@/modules/core/env/paths");
  process.env.APP_DATA_DIR = originalDataDir;
  rmSync(workDir, { recursive: true, force: true });
  vi.resetModules();
});

describe("getDb routing", () => {
  it("fails closed with no request scope and no test default", () => {
    expect(() => client.getDb()).toThrow(errors.VaultStateError);
    expect(() => client.getDb()).toThrow("No signed-in user for this request");
  });

  it("does not fall back to an open vault when there is no scope", () => {
    client.openVault(userRef(), key());
    expect(() => client.getDb()).toThrow("No signed-in user for this request");
  });

  it("uses the test default only outside a scope", () => {
    const memory = new Database(":memory:");
    client.setTestDefaultDatabase(memory);
    expect(client.getDb().get<{ v: number }>(sql`SELECT 1 AS v`).v).toBe(1);

    const closed = userRef();
    expect(() => inVault(closed, () => client.getDb())).toThrow(
      "Your session has expired — sign in again",
    );
  });

  it("only allows a test default under NODE_ENV=test", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(() => client.setTestDefaultDatabase(null)).toThrow(/only available in tests/);
  });

  it("routes each request to its own vault, with two vaults open under different keys", async () => {
    const alice = userRef();
    const household = spaceRef();
    client.openVault(alice, key());
    client.openVault(household, key());
    expect(client.openVaultKeys().sort()).toEqual(
      [`user:${alice.id}`, `space:${household.id}`].sort(),
    );

    inVault(alice, () => {
      client.getDb().run(sql`CREATE TABLE note (body TEXT)`);
      client.getDb().run(sql`INSERT INTO note VALUES ('alice only')`);
    });
    inVault(household, () => client.getDb().run(sql`CREATE TABLE note (body TEXT)`));

    const [aliceRows, householdRows] = await Promise.all([
      inVault(alice, async () => {
        await new Promise((r) => setTimeout(r, 2));
        return client.getDb().all<{ body: string }>(sql`SELECT body FROM note`);
      }),
      inVault(household, async () => {
        await new Promise((r) => setTimeout(r, 1));
        return client.getDb().all<{ body: string }>(sql`SELECT body FROM note`);
      }),
    ]);
    expect(aliceRows).toEqual([{ body: "alice only" }]);
    expect(householdRows).toEqual([]);
  });

  it("reports a closed vault in scope as an expired session", () => {
    const vault = userRef();
    client.openVault(vault, key());
    client.closeVault(vault);
    expect(client.isVaultOpen(vault)).toBe(false);
    expect(() => inVault(vault, () => client.getDb())).toThrow(
      "Your session has expired — sign in again",
    );
  });
});

describe("opening a vault", () => {
  it("creates an encrypted, owner-only file in the vault dir with every migration applied", () => {
    const vault = userRef();
    client.openVault(vault, key());

    expect(appliedCount(vault)).toBe(readJournal().entries.length);
    expect(inVault(vault, () => client.getDb().get(sql`PRAGMA busy_timeout`))).toEqual({
      timeout: 5000,
    });
    client.closeVault(vault);

    expect(dbFile(vault)).toBe(path.join(workDir, "data", "users", vault.id, "app.db"));
    const header = readFileSync(dbFile(vault)).subarray(0, 16).toString("latin1");
    expect(header).not.toBe("SQLite format 3\0");
    expect(statSync(dbFile(vault)).mode & 0o777).toBe(0o600);
  });

  it("is idempotent while open", () => {
    const vault = userRef();
    const dek = key();
    const first = client.openVault(vault, dek);
    expect(client.openVault(vault, dek)).toBe(first);
    expect(client.openVaultKeys()).toHaveLength(1);
  });

  it("rejects a malformed key before touching the file", () => {
    const vault = userRef();
    expect(() => client.openVault(vault, "abc'; DROP")).toThrow(errors.VaultStateError);
    expect(existsSync(dbFile(vault))).toBe(false);
  });

  it("rejects a key that doesn't match the file, without touching it", () => {
    const vault = userRef();
    client.openVault(vault, key());
    client.closeVault(vault);
    const before = readFileSync(dbFile(vault));

    expect(() => client.openVault(vault, key())).toThrow(errors.DatabaseOpenError);
    expect(client.isVaultOpen(vault)).toBe(false);
    expect(readFileSync(dbFile(vault)).equals(before)).toBe(true);
  });

  it("refuses an unsafe vault id", () => {
    expect(() => client.openVault({ kind: "user", id: "../../escape" }, key())).toThrow(
      errors.VaultStateError,
    );
  });
});

describe("migrations and backups, per vault", () => {
  it("backs up only the migrating vault's file, into that vault's backups dir", () => {
    const fullJournal = readJournal();
    writeJournal({ ...fullJournal, entries: fullJournal.entries.slice(0, -2) });
    const a = userRef();
    const b = userRef();
    const dekA = key();
    client.openVault(a, dekA);
    client.closeVault(a);

    writeJournal(fullJournal);
    client.openVault(a, dekA);
    client.openVault(b, key());

    expect(appliedCount(a)).toBe(fullJournal.entries.length);
    expect(appliedCount(b)).toBe(fullJournal.entries.length);
    const backups = readdirSync(backupsOf(a));
    expect(backups).toHaveLength(1);
    expect(backups[0]).toMatch(/-before-migration\.db$/);
    expect(statSync(path.join(backupsOf(a), backups[0])).mode & 0o777).toBe(0o600);
    expect(readdirSync(backupsOf(b))).toHaveLength(0);
  });

  it("does not back up when nothing is pending", () => {
    const vault = userRef();
    const dek = key();
    client.openVault(vault, dek);
    client.closeVault(vault);
    client.openVault(vault, dek);

    expect(readdirSync(backupsOf(vault))).toHaveLength(0);
  });

  it("restores the pre-migration backup when a migration fails, keeping the data", () => {
    const vault = userRef();
    const dek = key();
    client.openVault(vault, dek);
    inVault(vault, () => {
      client.getDb().run(sql`CREATE TABLE canary (note TEXT)`);
      client.getDb().run(sql`INSERT INTO canary VALUES ('still here')`);
    });
    client.closeVault(vault);

    const journal = readJournal();
    const last = journal.entries[journal.entries.length - 1];
    const tag = "9999_broken";
    writeFileSync(
      path.join(migrationsDir, `${tag}.sql`),
      "CREATE TABLE half_done (id integer);\n--> statement-breakpoint\nSELECT * FROM table_that_does_not_exist;",
    );
    writeJournal({
      ...journal,
      entries: [...journal.entries, { ...last, idx: last.idx + 1, when: Date.now() + 1000, tag }],
    });

    expect(() => client.openVault(vault, dek)).toThrow(/restored from the automatic backup/);
    expect(client.isVaultOpen(vault)).toBe(false);

    writeJournal(journal);
    client.openVault(vault, dek);
    inVault(vault, () => {
      expect(client.getDb().get<{ note: string }>(sql`SELECT note FROM canary`).note).toBe(
        "still here",
      );
      expect(
        client.getDb().get(sql`SELECT name FROM sqlite_master WHERE name = 'half_done'`),
      ).toBeUndefined();
    });
  });

  it("refuses to open when the migrations are missing", () => {
    rmSync(path.join(migrationsDir, "meta", "_journal.json"));
    expect(() => client.openVault(userRef(), key())).toThrow(/migrations are missing/);
  });
});

describe("pool limits", () => {
  it("evicts the least recently used vault above APP_MAX_OPEN_VAULTS", () => {
    vi.stubEnv("APP_MAX_OPEN_VAULTS", "2");
    vi.useFakeTimers({ toFake: ["Date"] });
    const closed: [string, string][] = [];
    unsubscribe = client.onVaultClosed((ref, reason) => closed.push([ref.id, reason]));

    const a = userRef();
    const b = userRef();
    const c = userRef();
    vi.setSystemTime(1_000);
    client.openVault(a, key());
    vi.setSystemTime(2_000);
    client.openVault(b, key());
    vi.setSystemTime(3_000);
    inVault(a, () => client.getDb()); // a is now more recent than b
    vi.setSystemTime(4_000);
    client.openVault(c, key());

    expect(client.isVaultOpen(a)).toBe(true);
    expect(client.isVaultOpen(b)).toBe(false);
    expect(client.isVaultOpen(c)).toBe(true);
    expect(closed).toEqual([[b.id, "evicted"]]);
  });

  it("closes a vault after APP_IDLE_LOCK_MINUTES without use and tells listeners", () => {
    vi.stubEnv("APP_IDLE_LOCK_MINUTES", "1");
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
    const closed: [string, string][] = [];
    unsubscribe = client.onVaultClosed((ref, reason) => closed.push([ref.id, reason]));

    const vault = userRef();
    client.openVault(vault, key());
    vi.advanceTimersByTime(30_000);
    inVault(vault, () => client.getDb()); // activity resets the idle clock
    vi.advanceTimersByTime(45_000);
    expect(client.isVaultOpen(vault)).toBe(true);

    vi.advanceTimersByTime(15_000);
    expect(client.isVaultOpen(vault)).toBe(false);
    expect(closed).toEqual([[vault.id, "idle"]]);
  });

  it("rejects APP_IDLE_LOCK_MINUTES=0 (the shared config requires at least 1 minute)", () => {
    vi.stubEnv("APP_IDLE_LOCK_MINUTES", "0");
    expect(() => client.openVault(userRef(), key())).toThrow(/APP_IDLE_LOCK_MINUTES/);
  });

  it("reports explicit and shutdown closes to listeners", () => {
    const closed: [string, string][] = [];
    unsubscribe = client.onVaultClosed((ref, reason) => closed.push([ref.id, reason]));
    const a = userRef();
    const b = userRef();
    client.openVault(a, key());
    client.openVault(b, key());

    client.closeVault(a);
    client.closeAllVaults();

    expect(closed).toEqual([
      [a.id, "closed"],
      [b.id, "shutdown"],
    ]);
    expect(client.openVaultKeys()).toEqual([]);
  });
});

describe("rekeyVault", () => {
  it("re-encrypts an open vault so only the new key opens it, keeping data and the connection", () => {
    const vault = spaceRef();
    const oldKey = key();
    const newKey = key();
    client.openVault(vault, oldKey);
    inVault(vault, () => client.getDb().run(sql`INSERT INTO plans_goals (name) VALUES ('kept')`));

    client.rekeyVault(vault, newKey);
    // The live connection keeps working.
    inVault(vault, () => client.getDb().run(sql`INSERT INTO plans_goals (name) VALUES ('after')`));
    client.closeVault(vault);

    expect(() => client.openVault(vault, oldKey)).toThrow(errors.DatabaseOpenError);
    client.openVault(vault, newKey);
    const names = inVault(vault, () =>
      client.getDb().all<{ name: string }>(sql`SELECT name FROM plans_goals ORDER BY id`),
    ).map((row) => row.name);
    expect(names).toEqual(["kept", "after"]);
  });

  it("requires the vault to be open and a well-formed key", () => {
    const vault = spaceRef();
    expect(() => client.rekeyVault(vault, key())).toThrow("That vault isn't open.");
    client.openVault(vault, key());
    expect(() => client.rekeyVault(vault, "nope")).toThrow("Invalid vault key.");
  });
});
