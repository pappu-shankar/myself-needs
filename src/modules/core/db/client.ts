import { existsSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3-multiple-ciphers";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { getDbFilePath } from "@/modules/core/env/paths";

const MIGRATIONS_FOLDER = path.join(process.cwd(), "drizzle");

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

/** Opens (or creates) the encrypted database file with the given key. Throws if
 * the key is wrong for an existing file. */
export function openDatabase(key: string): void {
  if (globalForDb.__sqliteConnection) {
    globalForDb.__sqliteConnection.close();
  }

  const connection = new Database(getDbFilePath());
  try {
    connection.pragma("cipher='sqlcipher'");
    // `key` is already a 32-byte value from scrypt (see crypto.ts) — passed as a raw
    // hex key (x'...') rather than a passphrase, so SQLCipher doesn't re-derive it.
    connection.pragma(`key="x'${key}'"`);

    // Forces SQLite to actually touch the encrypted pages now, so a wrong key
    // fails here rather than surfacing later as a cryptic error mid-query.
    connection.pragma("user_version");

    connection.pragma("journal_mode = WAL");
    connection.pragma("foreign_keys = ON");
  } catch (err) {
    connection.close();
    throw err;
  }

  globalForDb.__sqliteConnection = connection;
  globalForDb.__drizzleDb = drizzle(connection);

  // Applied programmatically against our own already-authenticated connection —
  // see the note at the top of drizzle.config.ts for why the drizzle-kit CLI's
  // migrate/push commands must never be used against this encrypted file.
  if (existsSync(path.join(MIGRATIONS_FOLDER, "meta", "_journal.json"))) {
    migrate(globalForDb.__drizzleDb, { migrationsFolder: MIGRATIONS_FOLDER });
  }
}

export function isDatabaseOpen(): boolean {
  return globalForDb.__drizzleDb !== undefined;
}

export function getDb(): BetterSQLite3Database {
  if (!globalForDb.__drizzleDb) {
    throw new Error("Database is not open — call openDatabase() after a successful unlock first.");
  }
  return globalForDb.__drizzleDb;
}

export function closeDatabase(): void {
  globalForDb.__sqliteConnection?.close();
  globalForDb.__sqliteConnection = undefined;
  globalForDb.__drizzleDb = undefined;
}
