// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { randomBytes, randomUUID } from "node:crypto";
import {
  cpSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";

const REAL_MIGRATIONS = path.join(process.cwd(), "drizzle");

let workDir: string;
let migrationsDir: string;
let originalDataDir: string | undefined;
let client: typeof import("./client");
let errors: typeof import("@/modules/core/errors");
let paths: typeof import("@/modules/core/env/paths");

interface Journal {
  entries: { idx: number; when: number; tag: string; version: string; breakpoints: boolean }[];
}

function readJournal(): Journal {
  return JSON.parse(readFileSync(path.join(migrationsDir, "meta", "_journal.json"), "utf8"));
}

function writeJournal(journal: Journal): void {
  writeFileSync(path.join(migrationsDir, "meta", "_journal.json"), JSON.stringify(journal));
}

function appliedCount(): number {
  return client.getDb().get<{ n: number }>(sql`SELECT count(*) AS n FROM __drizzle_migrations`).n;
}

const key = () => randomBytes(32).toString("hex");

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
  errors = await import("@/modules/core/errors");
  paths = await import("@/modules/core/env/paths");
});

afterEach(() => {
  client.closeDatabase();
  process.env.APP_DATA_DIR = originalDataDir;
  vi.doUnmock("@/modules/core/env/paths");
  vi.resetModules();
  rmSync(workDir, { recursive: true, force: true });
});

describe("openDatabase", () => {
  it("reports a locked vault through the domain error contract", () => {
    expect(() => client.getDb()).toThrow(errors.VaultStateError);
  });

  it("creates an encrypted, owner-only file with every migration applied", () => {
    client.openDatabase(key());

    expect(appliedCount()).toBe(readJournal().entries.length);
    client.closeDatabase();

    const header = readFileSync(paths.getDbFilePath()).subarray(0, 16).toString("latin1");
    expect(header).not.toBe("SQLite format 3\0");
    expect(statSync(paths.getDbFilePath()).mode & 0o777).toBe(0o600);
  });

  it("rejects a key that doesn't match the file, without touching it", () => {
    client.openDatabase(key());
    client.closeDatabase();
    const before = readFileSync(paths.getDbFilePath());

    expect(() => client.openDatabase(key())).toThrow(errors.DatabaseOpenError);
    expect(client.isDatabaseOpen()).toBe(false);
    expect(readFileSync(paths.getDbFilePath()).equals(before)).toBe(true);
  });

  it("backs up the encrypted file before applying pending migrations", () => {
    const fullJournal = readJournal();
    writeJournal({ ...fullJournal, entries: fullJournal.entries.slice(0, -2) });
    const dek = key();
    client.openDatabase(dek);
    client.closeDatabase();

    writeJournal(fullJournal);
    client.openDatabase(dek);

    expect(appliedCount()).toBe(fullJournal.entries.length);
    const backups = readdirSync(paths.getBackupsDir());
    expect(backups).toHaveLength(1);
    expect(backups[0]).toMatch(/-before-migration\.db$/);
    expect(statSync(path.join(paths.getBackupsDir(), backups[0])).mode & 0o777).toBe(0o600);
  });

  it("does not back up when nothing is pending", () => {
    const dek = key();
    client.openDatabase(dek);
    client.closeDatabase();
    client.openDatabase(dek);

    expect(readdirSync(paths.getBackupsDir())).toHaveLength(0);
  });

  it("restores the pre-migration backup when a migration fails, keeping the data", () => {
    const dek = key();
    client.openDatabase(dek);
    client.getDb().run(sql`CREATE TABLE canary (note TEXT)`);
    client.getDb().run(sql`INSERT INTO canary VALUES ('still here')`);
    client.closeDatabase();

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

    expect(() => client.openDatabase(dek)).toThrow(/restored from the automatic backup/);
    expect(client.isDatabaseOpen()).toBe(false);

    writeJournal(journal);
    client.openDatabase(dek);
    expect(client.getDb().get<{ note: string }>(sql`SELECT note FROM canary`).note).toBe(
      "still here",
    );
    expect(
      client.getDb().get(sql`SELECT name FROM sqlite_master WHERE name = 'half_done'`),
    ).toBeUndefined();
  });

  it("refuses to open when the migrations are missing", () => {
    rmSync(path.join(migrationsDir, "meta", "_journal.json"));
    expect(() => client.openDatabase(key())).toThrow(/migrations are missing/);
  });
});
