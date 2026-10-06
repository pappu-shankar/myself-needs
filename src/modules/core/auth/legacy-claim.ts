import "server-only";
import { randomUUID } from "node:crypto";
import {
  closeSync,
  existsSync,
  fsyncSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  writeSync,
} from "node:fs";
import path from "node:path";
import Database from "better-sqlite3-multiple-ciphers";
import { z } from "zod";
import { getVaultStatus, unlockWithPassword } from "@/modules/core/db/crypto";
import { ensureIdentity } from "@/modules/core/db/sealing";
import {
  assertSafeId,
  ensurePrivateDir,
  getDataDir,
  PRIVATE_FILE_MODE,
  vaultDbPath,
} from "@/modules/core/env/paths";
import { DatabaseOpenError, DomainError } from "@/modules/core/errors";
import { countAccounts, createAccount, findById, type Account } from "./accounts-store";
import { recordAudit } from "./audit-store";
import { checkUsername } from "./username";

/**
 * Turning the pre-multi-user single vault (`data/app.db` + `keyring.json`) into
 * the first admin's personal vault, without ever deleting a file:
 *
 * 1. Verify the old passphrase against the legacy keyring (nothing is touched on
 *    a wrong passphrase), fold the WAL into app.db, and add an identity key pair
 *    to the keyring.
 * 2. Write the crash marker `data/.claim.json` (user id, username, public key).
 * 3. Rename each legacy item into `data/users/<id>.partial/`.
 * 4. Rename `<id>.partial` → `<id>`.
 * 5. Create the admin account, then remove the marker.
 *
 * Steps 3–5 need no secret, so whenever the marker exists `resumeLegacyClaim()`
 * can finish them — on the next request (via `getInstallState`) or the next
 * claim attempt. Every step is idempotent.
 */

export const CLAIM_MARKER = ".claim.json";

/** Moved in this order; missing ones are skipped. */
export const LEGACY_ITEMS = [
  "app.db",
  "app.db-wal",
  "app.db-shm",
  "keyring.json",
  "backups",
  "fashion-photos",
  "fashion-garments",
] as const;

const markerSchema = z.object({
  version: z.literal(1),
  userId: z.string(),
  username: z.string(),
  publicKey: z.string(),
  startedAt: z.number(),
});
export type ClaimMarker = z.infer<typeof markerSchema>;

function markerPath(): string {
  return path.join(getDataDir(), CLAIM_MARKER);
}

export function hasClaimMarker(): boolean {
  return existsSync(markerPath());
}

export function readClaimMarker(): ClaimMarker | null {
  if (!hasClaimMarker()) return null;
  try {
    const marker = markerSchema.parse(JSON.parse(readFileSync(markerPath(), "utf8")));
    assertSafeId(marker.userId);
    return marker;
  } catch {
    throw new DomainError(
      `The claim marker (${CLAIM_MARKER} in the data folder) is unreadable. Nothing was deleted — check the data folder by hand.`,
    );
  }
}

function writeMarker(marker: ClaimMarker): void {
  const tmp = `${markerPath()}.tmp`;
  const fd = openSync(tmp, "w", PRIVATE_FILE_MODE);
  try {
    writeSync(fd, JSON.stringify(marker));
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(tmp, markerPath());
}

// --- test failpoints --------------------------------------------------------

let failpoint: string | null = null;

/** Test-only: throw right after the named step ("marker-written",
 * "moved:<item>", "renamed", "account-created"). */
export function __setClaimFailpointForTests(name: string | null): void {
  if (process.env.NODE_ENV !== "test") throw new Error("test only");
  failpoint = name;
}

function reached(step: string): void {
  if (failpoint === step) throw new Error(`claim failpoint: ${step}`);
}

// --- steps --------------------------------------------------------------------

/** Opens the legacy database just long enough to fold its WAL into app.db (so
 * moving the files can't lose committed writes) and prove the key matches. */
function checkpointLegacyDb(dataDir: string, dekHex: string): void {
  const connection = new Database(vaultDbPath(dataDir));
  try {
    connection.pragma("cipher='sqlcipher'");
    connection.pragma(`key="x'${dekHex}'"`);
    connection.pragma("user_version");
    connection.pragma("wal_checkpoint(TRUNCATE)");
  } catch (err) {
    throw new DatabaseOpenError(
      "Your existing vault couldn't be opened with its keyring. Nothing was changed.",
      { cause: err },
    );
  } finally {
    connection.close();
  }
}

/** Where the legacy keyring currently lives (it moves during the claim). */
function currentVaultDir(marker: ClaimMarker): string {
  const users = path.join(getDataDir(), "users");
  for (const dir of [
    path.join(users, marker.userId),
    path.join(users, `${marker.userId}.partial`),
  ]) {
    if (existsSync(path.join(dir, "keyring.json"))) return dir;
  }
  return getDataDir();
}

/**
 * Finishes an interrupted claim (steps 3–5). Returns the admin account, or null
 * when there is no claim in progress.
 */
export function resumeLegacyClaim(): Account | null {
  const marker = readClaimMarker();
  if (!marker) return null;
  const dataDir = getDataDir();
  const users = ensurePrivateDir(path.join(dataDir, "users"));
  const finalDir = path.join(users, marker.userId);
  const partialDir = path.join(users, `${marker.userId}.partial`);

  if (!existsSync(finalDir)) {
    ensurePrivateDir(partialDir);
    for (const item of LEGACY_ITEMS) {
      const from = path.join(dataDir, item);
      const to = path.join(partialDir, item);
      if (existsSync(from) && !existsSync(to)) renameSync(from, to);
      reached(`moved:${item}`);
    }
    renameSync(partialDir, finalDir);
  }
  reached("renamed");

  let account = findById(marker.userId);
  if (!account) {
    if (countAccounts() > 0) {
      throw new DomainError(
        "Accounts were created while a claim was in progress. Nothing was deleted — check the data folder by hand.",
      );
    }
    account = createAccount({
      id: marker.userId,
      username: marker.username,
      role: "admin",
      publicKey: marker.publicKey,
    });
  }
  reached("account-created");

  rmSync(markerPath(), { force: true });
  recordAudit({ event: "legacy.claimed", userId: account.id });
  return account;
}

/**
 * Claims the legacy vault as the first admin. Throws `CredentialError` for a
 * wrong passphrase (nothing touched), `DomainError` when the install already
 * has accounts or has no legacy vault. Resumes an interrupted claim when the
 * passphrase opens the keyring wherever it currently is.
 */
export async function claimLegacyVault(input: {
  username: string;
  passphrase: string;
}): Promise<{ account: Account; dekHex: string }> {
  const existing = readClaimMarker();
  if (existing) {
    const dekHex = await unlockWithPassword(currentVaultDir(existing), input.passphrase);
    const account = resumeLegacyClaim()!;
    return { account, dekHex };
  }

  if (countAccounts() > 0) {
    throw new DomainError("This app already has accounts — sign in instead.");
  }
  const dataDir = getDataDir();
  if (getVaultStatus(dataDir) !== "ready") {
    throw new DomainError("There's no existing vault to claim here.");
  }
  const check = checkUsername(input.username);
  if (!check.ok) throw new DomainError(check.message);

  const dekHex = await unlockWithPassword(dataDir, input.passphrase);
  checkpointLegacyDb(dataDir, dekHex);
  const publicKey = ensureIdentity(dataDir, dekHex);

  const userId = randomUUID();
  writeMarker({ version: 1, userId, username: check.username, publicKey, startedAt: Date.now() });
  reached("marker-written");

  const account = resumeLegacyClaim()!;
  return { account, dekHex };
}
