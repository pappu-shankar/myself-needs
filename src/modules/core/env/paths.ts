import { chmodSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";

const PRIVATE_DIR_MODE = 0o700;
const PRIVATE_FILE_MODE = 0o600;

/**
 * Overridable so dev/testing work (e.g. an agent exercising the app live)
 * never writes into the same vault a real user's data lives in — set
 * `APP_DATA_DIR=data-dev` (or an absolute path) for that. Defaults to `data`,
 * the real vault location. Resolved per call so tests can swap it.
 */
function resolveDataDir(): string {
  return path.resolve(
    /* turbopackIgnore: true */ process.cwd(),
    process.env.APP_DATA_DIR || "data",
  );
}

const hardened = new Set<string>();

/** Tightens permissions on vault files created before permissions were enforced
 * (other local users must not be able to read the keyring or session secret). */
function hardenExistingFiles(dir: string): void {
  if (hardened.has(dir)) return;
  hardened.add(dir);
  chmodSync(dir, PRIVATE_DIR_MODE);
  for (const name of ["app.db", "keyring.json", "session-secret.bin"]) {
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

export function getDbFilePath(): string {
  return path.join(getDataDir(), "app.db");
}

export function getKeyringFilePath(): string {
  return path.join(getDataDir(), "keyring.json");
}

export function getSessionSecretFilePath(): string {
  return path.join(getDataDir(), "session-secret.bin");
}

/** Encrypted copies of app.db taken automatically before a schema migration. */
export function getBackupsDir(): string {
  return ensurePrivateDir(path.join(getDataDir(), "backups"));
}

export function getMigrationsDir(): string {
  return path.join(/* turbopackIgnore: true */ process.cwd(), "drizzle");
}

export { PRIVATE_FILE_MODE };
