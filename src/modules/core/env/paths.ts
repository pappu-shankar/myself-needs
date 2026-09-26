import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";

/**
 * Overridable so dev/testing work (e.g. an agent exercising the app live)
 * never writes into the same vault a real user's data lives in — set
 * `APP_DATA_DIR=data-dev` (or similar) for that. Defaults to `data`, the
 * real vault location, so normal use is unaffected.
 */
const dataDir = path.join(process.cwd(), process.env.APP_DATA_DIR || "data");

export function getDataDir(): string {
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }
  return dataDir;
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
