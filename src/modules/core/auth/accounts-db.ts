import "server-only";
import { chmodSync, existsSync } from "node:fs";
import Database from "better-sqlite3-multiple-ciphers";
import { getAccountsDbPath, PRIVATE_FILE_MODE } from "@/modules/core/env/paths";
import { DatabaseOpenError } from "@/modules/core/errors";

/**
 * The account registry: `data/accounts.db`. Plain SQLite (no cipher) — it holds
 * only metadata (usernames, roles, invite hashes, session/audit history, sealed
 * space keys), never anyone's records or a password hash. Raw SQL, versioned
 * with `PRAGMA user_version`, separate from the vault schema in `drizzle/`.
 *
 * Every timestamp column is epoch milliseconds (INTEGER).
 */

export type RegistryDb = Database.Database;

/** Append-only: each entry upgrades `user_version` from its index to index + 1. */
const MIGRATIONS: readonly string[] = [
  /* 1 */ `
  CREATE TABLE accounts (
    id            TEXT PRIMARY KEY,
    username      TEXT NOT NULL UNIQUE,
    display_name  TEXT,
    color         TEXT,
    has_avatar    INTEGER NOT NULL DEFAULT 0 CHECK (has_avatar IN (0, 1)),
    role          TEXT NOT NULL CHECK (role IN ('admin', 'member')),
    status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
    public_key    TEXT NOT NULL,
    created_at    INTEGER NOT NULL,
    last_login_at INTEGER,
    failed_count  INTEGER NOT NULL DEFAULT 0,
    locked_until  INTEGER
  );
  CREATE INDEX accounts_role_status ON accounts (role, status);

  CREATE TABLE invites (
    id          TEXT PRIMARY KEY,
    token_hash  TEXT NOT NULL UNIQUE,
    created_by  TEXT REFERENCES accounts (id) ON DELETE SET NULL,
    created_at  INTEGER NOT NULL,
    expires_at  INTEGER NOT NULL,
    used_at     INTEGER,
    used_by     TEXT REFERENCES accounts (id) ON DELETE SET NULL,
    revoked_at  INTEGER,
    note        TEXT
  );
  CREATE INDEX invites_created_at ON invites (created_at);

  CREATE TABLE sessions (
    sid         TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
    created_at  INTEGER NOT NULL,
    last_seen   INTEGER NOT NULL,
    ip          TEXT,
    ip_prefix   TEXT,
    user_agent  TEXT,
    revoked_at  INTEGER
  );
  CREATE INDEX sessions_user ON sessions (user_id, created_at);

  -- No foreign keys: the audit trail must outlive the accounts it mentions
  -- (e.g. "account.deleted"). Pruned to 90 days / 5000 rows.
  CREATE TABLE audit (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    at        INTEGER NOT NULL,
    event     TEXT NOT NULL,
    user_id   TEXT,
    actor_id  TEXT,
    ip        TEXT,
    detail    TEXT
  );
  CREATE INDEX audit_at ON audit (at);
  CREATE INDEX audit_user_at ON audit (user_id, at);
  CREATE INDEX audit_event_at ON audit (event, at);

  CREATE TABLE spaces (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    created_by  TEXT REFERENCES accounts (id) ON DELETE SET NULL,
    created_at  INTEGER NOT NULL
  );

  CREATE TABLE space_members (
    space_id    TEXT NOT NULL REFERENCES spaces (id) ON DELETE CASCADE,
    user_id     TEXT NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
    role        TEXT NOT NULL CHECK (role IN ('owner', 'editor', 'viewer')),
    sealed_key  TEXT NOT NULL,
    added_at    INTEGER NOT NULL,
    PRIMARY KEY (space_id, user_id)
  );
  CREATE INDEX space_members_user ON space_members (user_id);

  CREATE TABLE alerts_dismissed (
    user_id   TEXT NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
    alert_id  TEXT NOT NULL,
    at        INTEGER NOT NULL,
    PRIMARY KEY (user_id, alert_id)
  );

  -- Per-username login backoff. Keyed by a hash of the normalized username so it
  -- behaves identically for names that have no account (no enumeration).
  CREATE TABLE login_throttle (
    key           TEXT PRIMARY KEY,
    failures      INTEGER NOT NULL,
    locked_until  INTEGER NOT NULL,
    updated_at    INTEGER NOT NULL
  );
  CREATE INDEX login_throttle_updated ON login_throttle (updated_at);
  `,
  /* 2 */ `
  -- Which app modules a shared space shows (JSON array of module names), and
  -- whether the space still needs a re-key after a member left while no one
  -- holding its key was signed in (e.g. an admin deleted that member).
  ALTER TABLE spaces ADD COLUMN modules TEXT NOT NULL DEFAULT '[]';
  ALTER TABLE spaces ADD COLUMN rekey_pending INTEGER NOT NULL DEFAULT 0 CHECK (rekey_pending IN (0, 1));
  `,
];

export const REGISTRY_SCHEMA_VERSION = MIGRATIONS.length;

const globalForRegistry = globalThis as unknown as { __accountsDb?: RegistryDb };

/** Applies pending migrations, each in its own transaction with its version bump. */
export function migrateRegistry(db: RegistryDb): void {
  const current = db.pragma("user_version", { simple: true }) as number;
  if (current > MIGRATIONS.length) {
    throw new DatabaseOpenError(
      "accounts.db was written by a newer version of the app. Upgrade the app before signing in.",
    );
  }
  for (let version = current; version < MIGRATIONS.length; version++) {
    db.transaction(() => {
      db.exec(MIGRATIONS[version]);
      db.pragma(`user_version = ${version + 1}`);
    })();
  }
}

/** Opens (creating if needed) a registry database at `file` and migrates it.
 * `":memory:"` is accepted for tests. */
export function openRegistryDb(file: string): RegistryDb {
  const onDisk = file !== ":memory:";
  const isNewFile = onDisk && !existsSync(file);
  let db: RegistryDb;
  try {
    db = new Database(file);
  } catch (err) {
    throw new DatabaseOpenError("The account registry (accounts.db) could not be opened.", {
      cause: err,
    });
  }
  try {
    if (isNewFile) chmodSync(file, PRIVATE_FILE_MODE);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    db.pragma("busy_timeout = 5000");
    db.pragma("synchronous = NORMAL");
    migrateRegistry(db);
    if (onDisk) {
      for (const sidecar of [`${file}-wal`, `${file}-shm`]) {
        if (existsSync(sidecar)) chmodSync(sidecar, PRIVATE_FILE_MODE);
      }
    }
  } catch (err) {
    db.close();
    if (err instanceof DatabaseOpenError) throw err;
    throw new DatabaseOpenError("The account registry (accounts.db) could not be migrated.", {
      cause: err,
    });
  }
  return db;
}

/** The process-wide registry connection, opened lazily at `<data>/accounts.db`. */
export function getRegistryDb(): RegistryDb {
  if (!globalForRegistry.__accountsDb) {
    globalForRegistry.__accountsDb = openRegistryDb(getAccountsDbPath());
  }
  return globalForRegistry.__accountsDb;
}

/** Replaces the process-wide connection (closing the previous one). Used by the
 * test helper; `null` just closes. */
export function attachRegistryDb(db: RegistryDb | null): void {
  const previous = globalForRegistry.__accountsDb;
  if (previous && previous !== db && previous.open) previous.close();
  globalForRegistry.__accountsDb = db ?? undefined;
}

export function closeRegistryDb(): void {
  attachRegistryDb(null);
}

/**
 * Runs `fn` in a registry transaction (IMMEDIATE, so concurrent writers queue
 * on `busy_timeout` instead of failing on upgrade). Nested calls become
 * savepoints, so store functions that use it can run inside a caller's
 * transaction — e.g. `redeemInvite` + `createAccount` as one unit.
 */
export function transaction<T>(fn: () => T): T {
  const db = getRegistryDb();
  if (db.inTransaction) return db.transaction(fn)();
  return db.transaction(fn).immediate();
}
