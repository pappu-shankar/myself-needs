import { chmodSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { currentScope } from "@/modules/core/db/request-scope";
import type { VaultRef } from "@/modules/core/db/vault-types";
import { VaultStateError } from "@/modules/core/errors";

const PRIVATE_DIR_MODE = 0o700;
const PRIVATE_FILE_MODE = 0o600;

/**
 * Overridable so dev/testing work (e.g. an agent exercising the app live)
 * never writes into the same vaults real users' data lives in — set
 * `APP_DATA_DIR=data-dev` (or an absolute path) for that. Defaults to `data`,
 * the real location. Resolved per call so tests can swap it.
 *
 * Layout:
 * ```
 * <data>/accounts.db, session-secret.bin, avatars/
 * <data>/users/<uuid>/app.db, keyring.json, backups/, fashion-*
 * <data>/spaces/<uuid>/app.db, backups/, ...
 * <data>/app.db, keyring.json        (pre-multi-user layout, until claimed)
 * ```
 */
function resolveDataDir(): string {
  return path.resolve(
    /* turbopackIgnore: true */ process.cwd(),
    process.env.APP_DATA_DIR || "data",
  );
}

const hardened = new Set<string>();

/** Tightens permissions on files created before permissions were enforced
 * (other local users must not be able to read keyrings or the session secret). */
function hardenExistingFiles(dir: string): void {
  if (hardened.has(dir)) return;
  hardened.add(dir);
  chmodSync(dir, PRIVATE_DIR_MODE);
  for (const name of ["app.db", "keyring.json", "session-secret.bin", "accounts.db"]) {
    const file = path.join(/* turbopackIgnore: true */ dir, name);
    if (existsSync(/* turbopackIgnore: true */ file)) chmodSync(file, PRIVATE_FILE_MODE);
  }
}

export function getDataDir(): string {
  const dir = resolveDataDir();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true, mode: PRIVATE_DIR_MODE });
  }
  hardenExistingFiles(dir);
  return dir;
}

export function ensurePrivateDir(dir: string): string {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true, mode: PRIVATE_DIR_MODE });
  }
  return dir;
}

const SAFE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** Every id that becomes part of a filesystem path goes through this first, so a
 * crafted id (`../..`, an absolute path, a NUL byte) can never escape the data dir.
 * Ids are `crypto.randomUUID()` — lower-case canonical UUIDs. */
export function assertSafeId(id: string): string {
  if (typeof id !== "string" || !SAFE_ID.test(id)) {
    throw new VaultStateError("Invalid id.");
  }
  return id;
}

export function getAccountsDbPath(): string {
  return path.join(getDataDir(), "accounts.db");
}

export function getSessionSecretFilePath(): string {
  return path.join(getDataDir(), "session-secret.bin");
}

/** `<data>/users/<id>`, created owner-only. */
export function getUserDir(userId: string): string {
  assertSafeId(userId);
  return ensurePrivateDir(path.join(ensurePrivateDir(path.join(getDataDir(), "users")), userId));
}

/** `<data>/spaces/<id>`, created owner-only. */
export function getSpaceDir(spaceId: string): string {
  assertSafeId(spaceId);
  return ensurePrivateDir(path.join(ensurePrivateDir(path.join(getDataDir(), "spaces")), spaceId));
}

export function getVaultDir(ref: VaultRef): string {
  if (ref.kind === "user") return getUserDir(ref.id);
  if (ref.kind === "space") return getSpaceDir(ref.id);
  throw new VaultStateError("Unknown vault kind.");
}

export function vaultDbPath(dir: string): string {
  return path.join(dir, "app.db");
}

export function vaultKeyringPath(dir: string): string {
  return path.join(dir, "keyring.json");
}

/** Encrypted copies of a vault's app.db taken automatically before a schema migration. */
export function vaultBackupsDir(dir: string): string {
  return ensurePrivateDir(path.join(dir, "backups"));
}

export function getAvatarsDir(): string {
  return ensurePrivateDir(path.join(getDataDir(), "avatars"));
}

/** The pre-multi-user single vault, read only by the legacy claim flow. */
export function getLegacyDbPath(): string {
  return path.join(getDataDir(), "app.db");
}

export function getLegacyKeyringPath(): string {
  return path.join(getDataDir(), "keyring.json");
}

/** Vault dir of the current request's scope (for per-vault files such as fashion
 * photos). Throws when no user is bound — never falls back to a shared dir. */
export function getCurrentVaultDataDir(): string {
  const scope = currentScope();
  if (!scope) throw new VaultStateError("No signed-in user for this request");
  return getVaultDir(scope.vault);
}

export function getMigrationsDir(): string {
  return path.join(/* turbopackIgnore: true */ process.cwd(), "drizzle");
}

export { PRIVATE_FILE_MODE, PRIVATE_DIR_MODE };
