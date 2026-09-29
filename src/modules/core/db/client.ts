import { chmodSync, copyFileSync, existsSync, readdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3-multiple-ciphers";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import {
  getBackupsDir,
  getDbFilePath,
  getMigrationsDir,
  PRIVATE_FILE_MODE,
} from "@/modules/core/env/paths";
import { DatabaseOpenError, VaultStateError } from "@/modules/core/errors";

const BACKUPS_TO_KEEP = 5;

/**
 * A singleton, guarded against being re-created on every Next.js dev hot-reload
 * (each module reload would otherwise leak a new SQLite handle). See
 * docs/architecture/performance.md.
 */
const globalForDb = globalThis as unknown as {
  __sqliteConnection?: Database.Database;
  __drizzleDb?: BetterSQLite3Database;
};

export function databaseFileExists(): boolean {
  return existsSync(getDbFilePath());
}

/** Makes `getDb()` return this connection. Used by `openDatabase` and by the
 * test harness (which attaches an unencrypted in-memory database). */
export function attachDatabase(connection: Database.Database): BetterSQLite3Database {
  closeDatabase();
  globalForDb.__sqliteConnection = connection;
  globalForDb.__drizzleDb = drizzle(connection);
  return globalForDb.__drizzleDb;
}

/**
 * Opens (or creates) the encrypted database with the given raw key, then applies
 * any pending migrations. Throws `DatabaseOpenError` (message safe to show) if the
 * file can't be decrypted or migrated.
 */
export function openDatabase(key: string): void {
  closeDatabase();

  const dbPath = getDbFilePath();
  const isNewFile = !existsSync(dbPath);
  const connection = new Database(dbPath);
  try {
    connection.pragma("cipher='sqlcipher'");
    // `key` is a random 32-byte DEK (see crypto.ts), passed as a raw hex key
    // (x'...') so SQLCipher doesn't run its own KDF over it.
    connection.pragma(`key="x'${key}'"`);
    // Forces SQLite to touch the encrypted pages now, so a key/file mismatch fails
    // here rather than surfacing later as a cryptic error mid-query.
    connection.pragma("user_version");
    connection.pragma("journal_mode = WAL");
  } catch (err) {
    connection.close();
    throw new DatabaseOpenError(
      "Your vault database couldn't be decrypted with this keyring. It may belong to a different vault or be damaged — restore app.db and keyring.json together from a backup.",
      { cause: err },
    );
  }
  if (isNewFile) chmodSync(dbPath, PRIVATE_FILE_MODE);

  applyMigrations(connection, dbPath);
  connection.pragma("foreign_keys = ON");
  attachDatabase(connection);
}

interface MigrationJournal {
  entries: { idx: number; tag: string }[];
}

function readMigrationJournal(): MigrationJournal {
  const journalPath = path.join(getMigrationsDir(), "meta", "_journal.json");
  if (!existsSync(journalPath)) {
    throw new DatabaseOpenError(
      "The app's database migrations are missing (drizzle/meta/_journal.json). Reinstall the app files — your data was not touched.",
    );
  }
  return JSON.parse(readFileSync(journalPath, "utf8")) as MigrationJournal;
}

function countAppliedMigrations(connection: Database.Database): number {
  const table = connection
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = '__drizzle_migrations'",
    )
    .get();
  if (!table) return 0;
  const row = connection.prepare("SELECT count(*) AS n FROM __drizzle_migrations").get() as {
    n: number;
  };
  return row.n;
}

/** Copies the encrypted file byte-for-byte (after folding the WAL in), so the
 * backup is exactly as encrypted as the original — never a plaintext export. */
function backupBeforeMigration(connection: Database.Database, dbPath: string): string {
  connection.pragma("wal_checkpoint(TRUNCATE)");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = path.join(getBackupsDir(), `app-${stamp}-before-migration.db`);
  copyFileSync(dbPath, backupPath);
  chmodSync(backupPath, PRIVATE_FILE_MODE);
  pruneOldBackups();
  return backupPath;
}

function pruneOldBackups(): void {
  const dir = getBackupsDir();
  const backups = readdirSync(dir)
    .filter((name) => name.endsWith("-before-migration.db"))
    .sort();
  for (const name of backups.slice(0, Math.max(0, backups.length - BACKUPS_TO_KEEP))) {
    rmSync(path.join(dir, name), { force: true });
  }
}

function restoreBackup(backupPath: string, dbPath: string): void {
  rmSync(`${dbPath}-wal`, { force: true });
  rmSync(`${dbPath}-shm`, { force: true });
  copyFileSync(backupPath, dbPath);
  chmodSync(dbPath, PRIVATE_FILE_MODE);
}

/**
 * Foreign keys are switched off for the migration itself: drizzle-kit's
 * table-rebuild migrations issue `PRAGMA foreign_keys=OFF`, which SQLite ignores
 * inside the migrator's transaction — with enforcement on, rebuilding any
 * referenced table would fail. Integrity is re-verified afterwards instead, and a
 * migration that leaves dangling references is rolled back from the backup.
 */
function applyMigrations(connection: Database.Database, dbPath: string): void {
  const journal = readMigrationJournal();
  const applied = countAppliedMigrations(connection);
  if (applied >= journal.entries.length) return;

  const backupPath = applied > 0 ? backupBeforeMigration(connection, dbPath) : undefined;
  connection.pragma("foreign_keys = OFF");
  try {
    const violationsBefore = (connection.pragma("foreign_key_check") as unknown[]).length;
    migrate(drizzle(connection), { migrationsFolder: getMigrationsDir() });
    const violationsAfter = (connection.pragma("foreign_key_check") as unknown[]).length;
    if (violationsAfter > violationsBefore) {
      throw new Error(
        `Migration introduced ${violationsAfter - violationsBefore} foreign-key violation(s)`,
      );
    }
  } catch (err) {
    connection.close();
    if (backupPath) restoreBackup(backupPath, dbPath);
    throw new DatabaseOpenError(
      backupPath
        ? "An app update couldn't be applied to your vault, so it was restored from the automatic backup taken just before. Your data is unchanged."
        : "Your new vault couldn't be initialised.",
      { cause: err },
    );
  }
}

export function isDatabaseOpen(): boolean {
  return globalForDb.__drizzleDb !== undefined;
}

export function getDb(): BetterSQLite3Database {
  if (!globalForDb.__drizzleDb) {
    throw new VaultStateError("Your vault is locked. Unlock it before continuing.");
  }
  return globalForDb.__drizzleDb;
}

export function closeDatabase(): void {
  globalForDb.__sqliteConnection?.close();
  globalForDb.__sqliteConnection = undefined;
  globalForDb.__drizzleDb = undefined;
}
