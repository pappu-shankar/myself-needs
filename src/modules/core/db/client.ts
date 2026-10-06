import { chmodSync, copyFileSync, existsSync, readdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3-multiple-ciphers";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import {
  getMigrationsDir,
  getVaultDir,
  PRIVATE_FILE_MODE,
  vaultBackupsDir,
  vaultDbPath,
} from "@/modules/core/env/paths";
import { getConfig } from "@/modules/core/env/config";
import { DatabaseOpenError, VaultStateError } from "@/modules/core/errors";
import { currentScope } from "./request-scope";
import { vaultKey, type VaultRef } from "./vault-types";

const BACKUPS_TO_KEEP = 5;

export type VaultCloseReason = "idle" | "evicted" | "closed" | "shutdown";
export type VaultClosedListener = (ref: VaultRef, reason: VaultCloseReason) => void;

interface OpenVault {
  ref: VaultRef;
  sqlite: Database.Database;
  db: BetterSQLite3Database;
  lastUsed: number;
  idleTimer: NodeJS.Timeout | undefined;
}

/**
 * The pool of open vault connections, keyed by `vaultKey(ref)`. Lives on
 * globalThis so a Next.js dev hot-reload doesn't orphan open SQLite handles (each
 * module reload would otherwise leak them). See docs/architecture/performance.md.
 */
interface Pool {
  vaults: Map<string, OpenVault>;
  listeners: Set<VaultClosedListener>;
  testDefault: { sqlite: Database.Database; db: BetterSQLite3Database } | undefined;
}

const globalForDb = globalThis as unknown as { __vaultPool?: Pool };
const pool: Pool = (globalForDb.__vaultPool ??= {
  vaults: new Map(),
  listeners: new Set(),
  testDefault: undefined,
});

/** APP_MAX_OPEN_VAULTS, validated by the shared config (1–1000, default 50). */
function maxOpenVaults(): number {
  return getConfig().maxOpenVaults;
}

/** APP_IDLE_LOCK_MINUTES, validated by the shared config (1–1440, default 30). */
function idleMs(): number {
  return getConfig().idleLockMinutes * 60_000;
}

// ---------------------------------------------------------------------------
// Pool bookkeeping
// ---------------------------------------------------------------------------

/** Called when a vault closes for any reason, so sessions can mark themselves
 * locked. Returns an unsubscribe function. */
export function onVaultClosed(listener: VaultClosedListener): () => void {
  pool.listeners.add(listener);
  return () => pool.listeners.delete(listener);
}

function touch(entry: OpenVault): void {
  entry.lastUsed = Date.now();
}

/** One timer per vault, re-armed lazily: `touch` only bumps `lastUsed` (it runs on
 * every query), and the timer reschedules itself for the remainder when it fires
 * early. */
function armIdleTimer(entry: OpenVault, delay: number): void {
  const limit = idleMs();
  entry.idleTimer = setTimeout(() => {
    const idleFor = Date.now() - entry.lastUsed;
    if (idleFor >= limit) closeEntry(entry, "idle");
    else armIdleTimer(entry, limit - idleFor);
  }, delay);
  entry.idleTimer.unref?.();
}

function closeEntry(entry: OpenVault, reason: VaultCloseReason): void {
  const key = vaultKey(entry.ref);
  if (pool.vaults.get(key) !== entry) return;
  pool.vaults.delete(key);
  if (entry.idleTimer) clearTimeout(entry.idleTimer);
  try {
    entry.sqlite.pragma("optimize");
  } catch {
    // Best effort — never block a close on query-planner housekeeping.
  }
  entry.sqlite.close();
  for (const listener of pool.listeners) {
    try {
      listener(entry.ref, reason);
    } catch (err) {
      console.error("vault-closed listener failed", err);
    }
  }
}

function evictForRoom(): void {
  const limit = maxOpenVaults();
  while (pool.vaults.size >= limit) {
    let oldest: OpenVault | undefined;
    for (const entry of pool.vaults.values()) {
      if (!oldest || entry.lastUsed < oldest.lastUsed) oldest = entry;
    }
    if (!oldest) return;
    closeEntry(oldest, "evicted");
  }
}

// ---------------------------------------------------------------------------
// Opening a vault
// ---------------------------------------------------------------------------

/**
 * Opens (or creates) the vault's encrypted database with its DEK, applies any
 * pending migrations (backing the file up first) and adds it to the pool.
 * Idempotent: an already-open vault is just marked used. Throws
 * `DatabaseOpenError` (message safe to show) if the file can't be decrypted or
 * migrated.
 */
export function openVault(ref: VaultRef, dekHex: string): BetterSQLite3Database {
  const key = vaultKey(ref);
  const existing = pool.vaults.get(key);
  if (existing) {
    touch(existing);
    return existing.db;
  }
  // Validated because it's interpolated into a PRAGMA below.
  if (!/^[0-9a-f]{64}$/.test(dekHex)) {
    throw new VaultStateError("Invalid vault key.");
  }
  // Surface a bad APP_IDLE_LOCK_MINUTES / APP_MAX_OPEN_VAULTS before a connection exists.
  getConfig();

  const dir = getVaultDir(ref);
  const dbPath = vaultDbPath(dir);
  const isNewFile = !existsSync(dbPath);
  const connection = new Database(dbPath);
  try {
    connection.pragma("cipher='sqlcipher'");
    // A random 32-byte DEK (see crypto.ts), passed as a raw hex key (x'...') so
    // SQLCipher doesn't run its own KDF over it.
    connection.pragma(`key="x'${dekHex}'"`);
    // Forces SQLite to touch the encrypted pages now, so a key/file mismatch fails
    // here rather than surfacing later as a cryptic error mid-query.
    connection.pragma("user_version");
    connection.pragma("journal_mode = WAL");
    connection.pragma("busy_timeout = 5000");
  } catch (err) {
    connection.close();
    throw new DatabaseOpenError(
      "Your vault database couldn't be decrypted with this keyring. It may belong to a different vault or be damaged — restore app.db and keyring.json together from a backup.",
      { cause: err },
    );
  }
  if (isNewFile) chmodSync(dbPath, PRIVATE_FILE_MODE);

  applyMigrations(connection, dir, dbPath);
  connection.pragma("foreign_keys = ON");

  evictForRoom();
  const entry: OpenVault = {
    ref: { ...ref },
    sqlite: connection,
    db: drizzle(connection),
    lastUsed: Date.now(),
    idleTimer: undefined,
  };
  pool.vaults.set(key, entry);
  armIdleTimer(entry, idleMs());
  return entry.db;
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
function backupBeforeMigration(connection: Database.Database, dir: string, dbPath: string): string {
  connection.pragma("wal_checkpoint(TRUNCATE)");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupsDir = vaultBackupsDir(dir);
  const backupPath = path.join(backupsDir, `app-${stamp}-before-migration.db`);
  copyFileSync(dbPath, backupPath);
  chmodSync(backupPath, PRIVATE_FILE_MODE);
  pruneOldBackups(backupsDir);
  return backupPath;
}

function pruneOldBackups(backupsDir: string): void {
  const backups = readdirSync(backupsDir)
    .filter((name) => name.endsWith("-before-migration.db"))
    .sort();
  for (const name of backups.slice(0, Math.max(0, backups.length - BACKUPS_TO_KEEP))) {
    rmSync(path.join(backupsDir, name), { force: true });
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
function applyMigrations(connection: Database.Database, dir: string, dbPath: string): void {
  let journal: MigrationJournal;
  try {
    journal = readMigrationJournal();
  } catch (err) {
    connection.close();
    throw err;
  }
  const applied = countAppliedMigrations(connection);
  if (applied >= journal.entries.length) return;

  const backupPath = applied > 0 ? backupBeforeMigration(connection, dir, dbPath) : undefined;
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

// ---------------------------------------------------------------------------
// Public pool API
// ---------------------------------------------------------------------------

export function isVaultOpen(ref: VaultRef): boolean {
  return pool.vaults.has(vaultKey(ref));
}

export function openVaultKeys(): string[] {
  return [...pool.vaults.keys()];
}

/**
 * Migrations applied to a vault, read only when it is *already* open (never
 * opens one, and doesn't count as use for the idle timer). Null when closed.
 * For the admin dashboard, which must not open or query vaults itself.
 */
export function getOpenVaultMigrationCount(ref: VaultRef): number | null {
  const entry = pool.vaults.get(vaultKey(ref));
  if (!entry) return null;
  try {
    return countAppliedMigrations(entry.sqlite);
  } catch {
    return null;
  }
}

/** Number of migrations the app ships (the latest schema version). */
export function getLatestMigrationCount(): number {
  return readMigrationJournal().entries.length;
}

export function closeVault(ref: VaultRef): void {
  const entry = pool.vaults.get(vaultKey(ref));
  if (entry) closeEntry(entry, "closed");
}

/**
 * Re-encrypts an open vault under `newDekHex` (SQLCipher `PRAGMA rekey`). The
 * vault must already be open with its current key. WAL is folded in and the
 * journal switched to DELETE for the rekey (not supported in WAL mode), then
 * restored. The connection stays open and keeps working with the new key.
 */
export function rekeyVault(ref: VaultRef, newDekHex: string): void {
  const entry = pool.vaults.get(vaultKey(ref));
  if (!entry) throw new VaultStateError("That vault isn't open.");
  if (!/^[0-9a-f]{64}$/.test(newDekHex)) throw new VaultStateError("Invalid vault key.");
  const connection = entry.sqlite;
  connection.pragma("wal_checkpoint(TRUNCATE)");
  connection.pragma("journal_mode = DELETE");
  try {
    connection.pragma(`rekey="x'${newDekHex}'"`);
  } finally {
    connection.pragma("journal_mode = WAL");
  }
  touch(entry);
}

export function closeAllVaults(): void {
  for (const entry of [...pool.vaults.values()]) closeEntry(entry, "shutdown");
}

/**
 * The database for the current request: the open vault named by the request
 * scope. Fails closed — with no scope there is no fallback to "some" vault
 * (except the in-memory test default, and only under NODE_ENV=test).
 */
export function getDb(): BetterSQLite3Database {
  const scope = currentScope();
  if (scope) {
    const entry = pool.vaults.get(vaultKey(scope.vault));
    if (!entry) throw new VaultStateError("Your session has expired — sign in again");
    touch(entry);
    return entry.db;
  }
  if (process.env.NODE_ENV === "test" && pool.testDefault) return pool.testDefault.db;
  throw new VaultStateError("No signed-in user for this request");
}

/**
 * Test-only: makes `getDb()` return this connection whenever no request scope is
 * set (closing any previous default). `null` clears it. The harness in
 * src/test/db.ts uses this with an in-memory database.
 */
export function setTestDefaultDatabase(
  connection: Database.Database | null,
): BetterSQLite3Database | null {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("setTestDefaultDatabase is only available in tests");
  }
  const previous = pool.testDefault;
  pool.testDefault = undefined;
  if (previous && previous.sqlite !== connection) previous.sqlite.close();
  if (!connection) return null;
  pool.testDefault = { sqlite: connection, db: drizzle(connection) };
  return pool.testDefault.db;
}

/** @deprecated Test-only alias kept for older tests; use `setTestDefaultDatabase`. */
export function attachDatabase(connection: Database.Database): BetterSQLite3Database {
  return setTestDefaultDatabase(connection)!;
}

/** @deprecated Test-only alias kept for older tests; use `setTestDefaultDatabase(null)`. */
export function closeDatabase(): void {
  setTestDefaultDatabase(null);
}
