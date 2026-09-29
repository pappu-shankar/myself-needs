import {
  closeSync,
  existsSync,
  fsyncSync,
  linkSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  writeSync,
} from "node:fs";
import {
  randomBytes,
  scrypt,
  createCipheriv,
  createDecipheriv,
  type ScryptOptions,
} from "node:crypto";
import { z } from "zod";
import {
  getDbFilePath,
  getKeyringFilePath,
  getSessionSecretFilePath,
  PRIVATE_FILE_MODE,
} from "@/modules/core/env/paths";
import { CredentialError, VaultStateError } from "@/modules/core/errors";

/**
 * Explicit, hardened scrypt cost params rather than Node's implicit defaults
 * (N=16384) — meets OWASP's interactive-login guidance. `maxmem` must exceed
 * 128*N*r (~128MiB at these params) or scrypt throws.
 */
const SCRYPT_OPTIONS: ScryptOptions = { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 };

const KEYRING_VERSION = 1;
type KeyringSlot = "passphrase" | "recovery";

const hex = z.string().regex(/^[0-9a-f]+$/);
const wrappedDekSchema = z.object({ salt: hex, iv: hex, ciphertext: hex, authTag: hex });
const keyringSchema = z.object({
  version: z.literal(KEYRING_VERSION),
  passphrase: wrappedDekSchema,
  recovery: wrappedDekSchema,
});

type WrappedDek = z.infer<typeof wrappedDekSchema>;
type Keyring = z.infer<typeof keyringSchema>;

/** Async so a ~128MiB, ~0.3s derivation never blocks the server's event loop. */
function deriveKek(secret: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(secret, salt, 32, SCRYPT_OPTIONS, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

function aad(slot: KeyringSlot): Buffer {
  return Buffer.from(`myself-needs:keyring:v${KEYRING_VERSION}:${slot}`);
}

/** Always generates its own fresh salt/IV internally — never accepts them as
 * parameters, so the stored salt can never drift from the one actually used to
 * derive the KEK. */
async function wrapDek(dek: Buffer, secret: string, slot: KeyringSlot): Promise<WrappedDek> {
  const salt = randomBytes(16);
  const kek = await deriveKek(secret, salt);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", kek, iv);
  cipher.setAAD(aad(slot));
  const ciphertext = Buffer.concat([cipher.update(dek), cipher.final()]);
  return {
    salt: salt.toString("hex"),
    iv: iv.toString("hex"),
    ciphertext: ciphertext.toString("hex"),
    authTag: cipher.getAuthTag().toString("hex"),
  };
}

/** Throws if `secret` is wrong for this wrap — GCM's own auth-tag check, no manual comparison. */
async function unwrapDek(wrapped: WrappedDek, secret: string, slot: KeyringSlot): Promise<Buffer> {
  const kek = await deriveKek(secret, Buffer.from(wrapped.salt, "hex"));
  const decipher = createDecipheriv("aes-256-gcm", kek, Buffer.from(wrapped.iv, "hex"));
  decipher.setAAD(aad(slot));
  decipher.setAuthTag(Buffer.from(wrapped.authTag, "hex"));
  return Buffer.concat([decipher.update(Buffer.from(wrapped.ciphertext, "hex")), decipher.final()]);
}

function readKeyring(): Keyring {
  const keyringPath = getKeyringFilePath();
  if (!existsSync(keyringPath)) {
    throw new VaultStateError("No vault keyring found.");
  }
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(keyringPath, "utf8"));
  } catch {
    raw = undefined;
  }
  const parsed = keyringSchema.safeParse(raw);
  if (!parsed.success) {
    throw new VaultStateError(
      "Your vault keyring (keyring.json) is unreadable. Restore it from a backup — nothing has been changed.",
    );
  }
  return parsed.data;
}

/** Writes to a private temp file and fsyncs it before it replaces anything, so a
 * crash can never leave a half-written keyring — this file alone reconstructs
 * the database key. */
function writeTempKeyring(keyring: Keyring): string {
  const tmpPath = `${getKeyringFilePath()}.${randomBytes(6).toString("hex")}.tmp`;
  const fd = openSync(tmpPath, "wx", PRIVATE_FILE_MODE);
  try {
    writeSync(fd, JSON.stringify(keyring));
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  return tmpPath;
}

/** Atomic create-if-absent: `link` fails with EEXIST rather than overwriting, so
 * vault creation can never clobber an existing keyring. */
function createKeyringFile(keyring: Keyring): void {
  const tmpPath = writeTempKeyring(keyring);
  try {
    linkSync(tmpPath, getKeyringFilePath());
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "EEXIST") {
      throw new VaultStateError("A vault already exists here — refusing to overwrite it.");
    }
    throw err;
  } finally {
    rmSync(tmpPath, { force: true });
  }
}

function replaceKeyringFile(keyring: Keyring): void {
  const tmpPath = writeTempKeyring(keyring);
  renameSync(tmpPath, getKeyringFilePath());
}

export type VaultStatus = "uninitialized" | "ready" | "missing-database" | "missing-keyring";

/**
 * Decided from BOTH files, never from one alone: a missing app.db next to an
 * existing keyring (or vice versa) means something was moved or lost, and
 * treating it as "first run" would destroy the surviving half of the vault.
 */
export function getVaultStatus(): VaultStatus {
  const hasKeyring = existsSync(getKeyringFilePath());
  const hasDatabase = existsSync(getDbFilePath());
  if (hasKeyring && hasDatabase) return "ready";
  if (hasKeyring) return "missing-database";
  if (hasDatabase) return "missing-keyring";
  return "uninitialized";
}

export function generateRecoveryKey(): string {
  const value = randomBytes(16).toString("hex");
  return [value.slice(0, 8), value.slice(8, 16), value.slice(16, 24), value.slice(24, 32)].join(
    "-",
  );
}

/** Strips whitespace/dashes, lowercases, validates, and re-formats canonically — or
 * returns null for a malformed input, checked before any expensive scrypt call. */
export function normalizeRecoveryKey(input: string): string | null {
  const compact = input.trim().toLowerCase().replace(/[\s-]/g, "");
  if (!/^[0-9a-f]{32}$/.test(compact)) return null;
  return [
    compact.slice(0, 8),
    compact.slice(8, 16),
    compact.slice(16, 24),
    compact.slice(24, 32),
  ].join("-");
}

export async function createVault(
  passphrase: string,
): Promise<{ recoveryKey: string; dekHex: string }> {
  if (getVaultStatus() !== "uninitialized") {
    throw new VaultStateError("A vault already exists here — refusing to overwrite it.");
  }
  const dek = randomBytes(32);
  const recoveryKey = generateRecoveryKey();

  const [passphraseWrap, recoveryWrap] = await Promise.all([
    wrapDek(dek, passphrase, "passphrase"),
    wrapDek(dek, recoveryKey, "recovery"),
  ]);
  createKeyringFile({
    version: KEYRING_VERSION,
    passphrase: passphraseWrap,
    recovery: recoveryWrap,
  });

  return { recoveryKey, dekHex: dek.toString("hex") };
}

export async function unlockWithPassphrase(passphrase: string): Promise<string> {
  const keyring = readKeyring();
  try {
    return (await unwrapDek(keyring.passphrase, passphrase, "passphrase")).toString("hex");
  } catch {
    throw new CredentialError("Incorrect passphrase");
  }
}

export async function unlockWithRecoveryKey(recoveryKeyInput: string): Promise<string> {
  const normalized = normalizeRecoveryKey(recoveryKeyInput);
  if (!normalized) throw new CredentialError("Invalid recovery key format");

  const keyring = readKeyring();
  try {
    return (await unwrapDek(keyring.recovery, normalized, "recovery")).toString("hex");
  } catch {
    throw new CredentialError("Incorrect recovery key");
  }
}

/** Re-wraps the DEK under a new passphrase-derived KEK only — the recovery slot is
 * left untouched, so the original recovery key stays valid afterward. */
export async function rewrapForNewPassphrase(dekHex: string, newPassphrase: string): Promise<void> {
  const keyring = readKeyring();
  const passphraseWrap = await wrapDek(Buffer.from(dekHex, "hex"), newPassphrase, "passphrase");
  replaceKeyringFile({ ...keyring, passphrase: passphraseWrap });
}

/** Verifies the current passphrase, then re-wraps under the new one. */
export async function changePassphrase(
  currentPassphrase: string,
  newPassphrase: string,
): Promise<void> {
  const dekHex = await unlockWithPassphrase(currentPassphrase);
  await rewrapForNewPassphrase(dekHex, newPassphrase);
}

/** Replaces the recovery slot with a freshly generated key — the old recovery key
 * stops working immediately. Requires the passphrase, not just an open session. */
export async function rotateRecoveryKey(passphrase: string): Promise<string> {
  const keyring = readKeyring();
  const dekHex = await unlockWithPassphrase(passphrase);
  const recoveryKey = generateRecoveryKey();
  const recoveryWrap = await wrapDek(Buffer.from(dekHex, "hex"), recoveryKey, "recovery");
  replaceKeyringFile({ ...keyring, recovery: recoveryWrap });
  return recoveryKey;
}

/** Generated once on first run and reused — not derived from the passphrase, since
 * it protects the session cookie, not the database file. Created exclusively with
 * owner-only permissions so two concurrent first requests can't race each other. */
export function getOrCreateSessionSecret(): string {
  const secretPath = getSessionSecretFilePath();
  if (!existsSync(secretPath)) {
    try {
      const fd = openSync(secretPath, "wx", PRIVATE_FILE_MODE);
      try {
        writeSync(fd, randomBytes(32).toString("hex"));
        fsyncSync(fd);
      } finally {
        closeSync(fd);
      }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
    }
  }
  return readFileSync(secretPath, "utf8");
}
