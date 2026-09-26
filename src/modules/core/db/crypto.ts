import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { randomBytes, scryptSync, createCipheriv, createDecipheriv } from "node:crypto";
import { getKeyringFilePath, getSessionSecretFilePath } from "@/modules/core/env/paths";

/**
 * Explicit, hardened scrypt cost params rather than Node's implicit defaults
 * (N=16384) — meets OWASP's interactive-login guidance. `maxmem` must exceed
 * 128*N*r (~128MiB at these params) or scryptSync throws.
 */
const SCRYPT_N = 131072;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_MAXMEM = 256 * 1024 * 1024;

const KEYRING_VERSION = 1;
type KeyringSlot = "passphrase" | "recovery";

interface WrappedDek {
  salt: string;
  iv: string;
  ciphertext: string;
  authTag: string;
}

interface Keyring {
  version: number;
  passphrase: WrappedDek;
  recovery: WrappedDek;
}

function deriveKek(secret: string, salt: Buffer): Buffer {
  return scryptSync(secret, salt, 32, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: SCRYPT_MAXMEM,
  });
}

/** Always generates its own fresh salt/IV internally — never accepts them as
 * parameters, so the stored salt can never drift from the one actually used to
 * derive the KEK. */
function wrapDek(dek: Buffer, secret: string, slot: KeyringSlot): WrappedDek {
  const salt = randomBytes(16);
  const kek = deriveKek(secret, salt);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", kek, iv);
  cipher.setAAD(Buffer.from(`myself-needs:keyring:v${KEYRING_VERSION}:${slot}`));
  const ciphertext = Buffer.concat([cipher.update(dek), cipher.final()]);
  return {
    salt: salt.toString("hex"),
    iv: iv.toString("hex"),
    ciphertext: ciphertext.toString("hex"),
    authTag: cipher.getAuthTag().toString("hex"),
  };
}

/** Throws if `secret` is wrong for this wrap — GCM's own auth-tag check, no manual comparison. */
function unwrapDek(wrapped: WrappedDek, secret: string, slot: KeyringSlot): Buffer {
  const kek = deriveKek(secret, Buffer.from(wrapped.salt, "hex"));
  const decipher = createDecipheriv("aes-256-gcm", kek, Buffer.from(wrapped.iv, "hex"));
  decipher.setAAD(Buffer.from(`myself-needs:keyring:v${KEYRING_VERSION}:${slot}`));
  decipher.setAuthTag(Buffer.from(wrapped.authTag, "hex"));
  return Buffer.concat([decipher.update(Buffer.from(wrapped.ciphertext, "hex")), decipher.final()]);
}

function readKeyring(): Keyring | null {
  const keyringPath = getKeyringFilePath();
  if (!existsSync(keyringPath)) return null;
  return JSON.parse(readFileSync(keyringPath, "utf8"));
}

/** Atomic write (tmp + rename) — this file alone reconstructs the database key, so a
 * half-written copy on crash would be catastrophic. */
function writeKeyring(keyring: Keyring): void {
  const keyringPath = getKeyringFilePath();
  const tmpPath = `${keyringPath}.tmp`;
  writeFileSync(tmpPath, JSON.stringify(keyring));
  renameSync(tmpPath, keyringPath);
}

export function generateRecoveryKey(): string {
  const hex = randomBytes(16).toString("hex");
  return [hex.slice(0, 8), hex.slice(8, 16), hex.slice(16, 24), hex.slice(24, 32)].join("-");
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

export function createVault(passphrase: string): { recoveryKey: string; dekHex: string } {
  const dek = randomBytes(32);
  const recoveryKey = generateRecoveryKey();

  const passphraseWrap = wrapDek(dek, passphrase, "passphrase");
  const recoveryWrap = wrapDek(dek, recoveryKey, "recovery");
  writeKeyring({ version: KEYRING_VERSION, passphrase: passphraseWrap, recovery: recoveryWrap });

  return { recoveryKey, dekHex: dek.toString("hex") };
}

export function unlockWithPassphrase(passphrase: string): string {
  const keyring = readKeyring();
  if (!keyring) throw new Error("No vault found");
  try {
    return unwrapDek(keyring.passphrase, passphrase, "passphrase").toString("hex");
  } catch {
    throw new Error("Incorrect passphrase");
  }
}

export function unlockWithRecoveryKey(recoveryKeyInput: string): string {
  const normalized = normalizeRecoveryKey(recoveryKeyInput);
  if (!normalized) throw new Error("Invalid recovery key format");

  const keyring = readKeyring();
  if (!keyring) throw new Error("No vault found");
  try {
    return unwrapDek(keyring.recovery, normalized, "recovery").toString("hex");
  } catch {
    throw new Error("Incorrect recovery key");
  }
}

/** Re-wraps the DEK under a new passphrase-derived KEK only — the recovery slot is
 * left untouched, so the original recovery key stays valid afterward. */
export function rewrapForNewPassphrase(dekHex: string, newPassphrase: string): void {
  const keyring = readKeyring();
  if (!keyring) throw new Error("No vault found");
  const dek = Buffer.from(dekHex, "hex");
  const passphraseWrap = wrapDek(dek, newPassphrase, "passphrase");
  writeKeyring({ ...keyring, passphrase: passphraseWrap });
}

/** Generated once on first run and reused — not derived from the passphrase, since
 * it protects the session cookie, not the database file. */
export function getOrCreateSessionSecret(): string {
  const secretPath = getSessionSecretFilePath();
  if (existsSync(secretPath)) {
    return readFileSync(secretPath, "utf8");
  }
  const secret = randomBytes(32).toString("hex");
  writeFileSync(secretPath, secret, "utf8");
  return secret;
}
