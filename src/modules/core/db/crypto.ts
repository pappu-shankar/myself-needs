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
import { randomBytes, scrypt, createCipheriv, createDecipheriv } from "node:crypto";
import { z } from "zod";
import {
  getSessionSecretFilePath,
  PRIVATE_FILE_MODE,
  vaultDbPath,
  vaultKeyringPath,
} from "@/modules/core/env/paths";
import { CredentialError, VaultStateError } from "@/modules/core/errors";

/*
 * Each vault (a directory holding app.db + keyring.json) has a random 32-byte DEK.
 * The keyring stores that DEK wrapped twice — once under a password-derived KEK,
 * once under a recovery-key-derived KEK — with scrypt as the KDF and AES-256-GCM
 * (AAD bound to the slot name) as the wrap.
 */

const KEYRING_VERSION = 1;
type KeyringSlot = "passphrase" | "recovery";

// ---------------------------------------------------------------------------
// KDF parameters
// ---------------------------------------------------------------------------

export interface KdfParams {
  N: number;
  r: number;
  p: number;
}

/** What every keyring written before per-keyring params existed was wrapped with. */
export const LEGACY_KDF: Readonly<KdfParams> = Object.freeze({ N: 2 ** 17, r: 8, p: 1 });

const CALIBRATION_TARGET_MS = 250;
const CALIBRATION_MIN_LOG2N = 15;
const CALIBRATION_MAX_LOG2N = 20;

const isPowerOfTwo = (n: number) => Number.isInteger(n) && n > 0 && (n & (n - 1)) === 0;

/** Bounds for params *read from a keyring* — wide enough for test params, tight
 * enough that a corrupted file can't request a multi-GB derivation. */
const kdfSchema = z.object({
  N: z
    .number()
    .int()
    .min(2 ** 10)
    .max(2 ** CALIBRATION_MAX_LOG2N)
    .refine(isPowerOfTwo, "N must be a power of two"),
  r: z.number().int().min(1).max(16),
  p: z.number().int().min(1).max(4),
});

/** scrypt needs ~128·N·r·p bytes; `maxmem` must exceed that or Node throws. */
function scryptMaxmem({ N, r, p }: KdfParams): number {
  return 128 * N * r * p + 32 * 1024 * 1024;
}

function rawScrypt(secret: string, salt: Buffer, params: KdfParams): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      secret,
      salt,
      32,
      { N: params.N, r: params.r, p: params.p, maxmem: scryptMaxmem(params) },
      (err, key) => (err ? reject(err) : resolve(key)),
    );
  });
}

let calibrated: KdfParams | undefined;
let testKdfOverride: KdfParams | undefined;

/**
 * Picks scrypt params for *new* keyrings so one derivation takes ≈250 ms on this
 * host: times N=2^15 (r=8, p=1), then scales N by the nearest power of two,
 * clamped to [2^15, 2^20] (32 MiB – 1 GiB of memory per derivation; the
 * semaphore caps how many run at once). Cached for the process lifetime.
 */
export async function calibrateKdf(): Promise<KdfParams> {
  if (testKdfOverride) return testKdfOverride;
  if (calibrated) return calibrated;
  const probe: KdfParams = { N: 2 ** CALIBRATION_MIN_LOG2N, r: 8, p: 1 };
  const start = performance.now();
  await withKdfSlot(() => rawScrypt("calibration", randomBytes(16), probe));
  const elapsed = Math.max(performance.now() - start, 1);
  const steps = Math.floor(Math.log2(CALIBRATION_TARGET_MS / elapsed));
  const log2N = Math.min(
    CALIBRATION_MAX_LOG2N,
    Math.max(CALIBRATION_MIN_LOG2N, CALIBRATION_MIN_LOG2N + steps),
  );
  calibrated = { N: 2 ** log2N, r: 8, p: 1 };
  return calibrated;
}

/** Test-only: forces cheap KDF params for new keyrings and the dummy keyring, so
 * the suite doesn't spend ~250 ms per derivation. `null` restores the defaults. */
export function __setKdfParamsForTests(params: KdfParams | null): void {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("__setKdfParamsForTests is only available in tests");
  }
  testKdfOverride = params ? kdfSchema.parse(params) : undefined;
  dummyKeyring = undefined;
}

// ---------------------------------------------------------------------------
// KDF concurrency limit
// ---------------------------------------------------------------------------

/** Thrown when too many password derivations are already running or queued.
 * Message is safe to show. */
export class KdfBusyError extends Error {
  constructor() {
    super("The server is busy signing other people in — try again in a moment.");
    this.name = "KdfBusyError";
  }
}

const KDF_MAX_RUNNING = 2;
const KDF_MAX_QUEUED = 8;
let kdfRunning = 0;
const kdfQueue: (() => void)[] = [];

/** Each derivation holds ~128 MiB, so an unthrottled burst of sign-in attempts
 * would exhaust memory. Acquisition is synchronous: the caller learns it's over
 * capacity before any await. */
function acquireKdfSlot(): Promise<void> {
  if (kdfRunning < KDF_MAX_RUNNING) {
    kdfRunning++;
    return Promise.resolve();
  }
  if (kdfQueue.length >= KDF_MAX_QUEUED) return Promise.reject(new KdfBusyError());
  // The slot is handed over directly on release, so `kdfRunning` stays counted.
  return new Promise((resolve) => kdfQueue.push(resolve));
}

function releaseKdfSlot(): void {
  const next = kdfQueue.shift();
  if (next) next();
  else kdfRunning--;
}

async function withKdfSlot<T>(fn: () => Promise<T>): Promise<T> {
  await acquireKdfSlot();
  try {
    return await fn();
  } finally {
    releaseKdfSlot();
  }
}

/** For the admin health view. */
export function getKdfQueueStats(): { running: number; queued: number } {
  return { running: kdfRunning, queued: kdfQueue.length };
}

/** Async so a ~128 MiB, ~0.25 s derivation never blocks the server's event loop. */
function deriveKek(secret: string, salt: Buffer, params: KdfParams): Promise<Buffer> {
  return withKdfSlot(() => rawScrypt(secret, salt, params));
}

// ---------------------------------------------------------------------------
// Keyring file
// ---------------------------------------------------------------------------

const hex = z.string().regex(/^[0-9a-f]+$/);
const b64 = z.string().regex(/^[A-Za-z0-9+/]+={0,2}$/);
const wrappedDekSchema = z.object({ salt: hex, iv: hex, ciphertext: hex, authTag: hex });
const identitySchema = z.object({
  /** base64 of the raw 32-byte X25519 public key. */
  publicKey: b64,
  /** pkcs8 private key, AES-256-GCM-encrypted under a key derived from the DEK. */
  privateKey: z.object({ iv: b64, ciphertext: b64, tag: b64 }),
});
const keyringSchema = z.object({
  version: z.literal(KEYRING_VERSION),
  passphrase: wrappedDekSchema,
  recovery: wrappedDekSchema,
  /** Absent on keyrings written before per-keyring params: means LEGACY_KDF. */
  kdf: kdfSchema.optional(),
  identity: identitySchema.optional(),
});

type WrappedDek = z.infer<typeof wrappedDekSchema>;
type Keyring = z.infer<typeof keyringSchema>;
export type KeyringIdentity = z.infer<typeof identitySchema>;

function kdfOf(keyring: Keyring): KdfParams {
  return keyring.kdf ?? LEGACY_KDF;
}

function aad(slot: KeyringSlot): Buffer {
  return Buffer.from(`myself-needs:keyring:v${KEYRING_VERSION}:${slot}`);
}

/** Always generates its own fresh salt/IV internally — never accepts them as
 * parameters, so the stored salt can never drift from the one actually used to
 * derive the KEK. */
async function wrapDek(
  dek: Buffer,
  secret: string,
  slot: KeyringSlot,
  params: KdfParams,
): Promise<WrappedDek> {
  const salt = randomBytes(16);
  const kek = await deriveKek(secret, salt, params);
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
async function unwrapDek(
  wrapped: WrappedDek,
  secret: string,
  slot: KeyringSlot,
  params: KdfParams,
): Promise<Buffer> {
  const kek = await deriveKek(secret, Buffer.from(wrapped.salt, "hex"), params);
  const decipher = createDecipheriv("aes-256-gcm", kek, Buffer.from(wrapped.iv, "hex"));
  decipher.setAAD(aad(slot));
  decipher.setAuthTag(Buffer.from(wrapped.authTag, "hex"));
  return Buffer.concat([decipher.update(Buffer.from(wrapped.ciphertext, "hex")), decipher.final()]);
}

/** Runs the unwrap but turns any failure other than "server busy" into a
 * CredentialError — a wrong secret surfaces as a GCM auth failure. */
async function unwrapOrCredentialError(
  keyring: Keyring,
  secret: string,
  slot: KeyringSlot,
  message: string,
): Promise<string> {
  try {
    return (await unwrapDek(keyring[slot], secret, slot, kdfOf(keyring))).toString("hex");
  } catch (err) {
    if (err instanceof KdfBusyError) throw err;
    throw new CredentialError(message);
  }
}

function readKeyring(dir: string): Keyring {
  const keyringPath = vaultKeyringPath(dir);
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
function writeTempKeyring(dir: string, keyring: Keyring): string {
  const tmpPath = `${vaultKeyringPath(dir)}.${randomBytes(6).toString("hex")}.tmp`;
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
function createKeyringFile(dir: string, keyring: Keyring): void {
  const tmpPath = writeTempKeyring(dir, keyring);
  try {
    linkSync(tmpPath, vaultKeyringPath(dir));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "EEXIST") {
      throw new VaultStateError("A vault already exists here — refusing to overwrite it.");
    }
    throw err;
  } finally {
    rmSync(tmpPath, { force: true });
  }
}

function replaceKeyringFile(dir: string, keyring: Keyring): void {
  const tmpPath = writeTempKeyring(dir, keyring);
  renameSync(tmpPath, vaultKeyringPath(dir));
}

// ---------------------------------------------------------------------------
// Vault lifecycle
// ---------------------------------------------------------------------------

export type VaultStatus = "uninitialized" | "ready" | "missing-database" | "missing-keyring";

/**
 * Decided from BOTH files, never from one alone: a missing app.db next to an
 * existing keyring (or vice versa) means something was moved or lost, and
 * treating it as "first run" would destroy the surviving half of the vault.
 */
export function getVaultStatus(dir: string): VaultStatus {
  const hasKeyring = existsSync(vaultKeyringPath(dir));
  const hasDatabase = existsSync(vaultDbPath(dir));
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
  dir: string,
  password: string,
): Promise<{ recoveryKey: string; dekHex: string }> {
  if (getVaultStatus(dir) !== "uninitialized") {
    throw new VaultStateError("A vault already exists here — refusing to overwrite it.");
  }
  const dek = randomBytes(32);
  const recoveryKey = generateRecoveryKey();
  const kdf = await calibrateKdf();

  const [passphraseWrap, recoveryWrap] = await Promise.all([
    wrapDek(dek, password, "passphrase", kdf),
    wrapDek(dek, recoveryKey, "recovery", kdf),
  ]);
  createKeyringFile(dir, {
    version: KEYRING_VERSION,
    passphrase: passphraseWrap,
    recovery: recoveryWrap,
    kdf: { ...kdf },
  });

  return { recoveryKey, dekHex: dek.toString("hex") };
}

export async function unlockWithPassword(dir: string, password: string): Promise<string> {
  const keyring = readKeyring(dir);
  return unwrapOrCredentialError(keyring, password, "passphrase", "Incorrect password");
}

export async function unlockWithRecoveryKey(
  dir: string,
  recoveryKeyInput: string,
): Promise<string> {
  const normalized = normalizeRecoveryKey(recoveryKeyInput);
  if (!normalized) throw new CredentialError("Invalid recovery key format");

  const keyring = readKeyring(dir);
  return unwrapOrCredentialError(keyring, normalized, "recovery", "Incorrect recovery key");
}

/** Re-wraps the DEK under a new password-derived KEK only — the recovery slot is
 * left untouched, so the original recovery key stays valid afterward. Uses the
 * keyring's existing KDF params (they're keyring-wide). */
export async function rewrapPassword(
  dir: string,
  dekHex: string,
  newPassword: string,
): Promise<void> {
  const keyring = readKeyring(dir);
  const passphraseWrap = await wrapDek(
    Buffer.from(dekHex, "hex"),
    newPassword,
    "passphrase",
    kdfOf(keyring),
  );
  replaceKeyringFile(dir, { ...readKeyring(dir), passphrase: passphraseWrap });
}

/** Verifies the current password, then re-wraps under the new one. */
export async function changePassword(
  dir: string,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const dekHex = await unlockWithPassword(dir, currentPassword);
  await rewrapPassword(dir, dekHex, newPassword);
}

/** Replaces the recovery slot with a freshly generated key — the old recovery key
 * stops working immediately. Requires the password, not just an open session. */
export async function rotateRecoveryKey(dir: string, password: string): Promise<string> {
  const dekHex = await unlockWithPassword(dir, password);
  const keyring = readKeyring(dir);
  const recoveryKey = generateRecoveryKey();
  const recoveryWrap = await wrapDek(
    Buffer.from(dekHex, "hex"),
    recoveryKey,
    "recovery",
    kdfOf(keyring),
  );
  replaceKeyringFile(dir, { ...readKeyring(dir), recovery: recoveryWrap });
  return recoveryKey;
}

// ---------------------------------------------------------------------------
// Dummy unwrap (no username enumeration)
// ---------------------------------------------------------------------------

let dummyKeyring: Promise<Keyring> | undefined;

function getDummyKeyring(): Promise<Keyring> {
  // Built once per process (one extra derivation, paid lazily). Legacy cost, which
  // calibrated params aim to match; tests use their cheap override.
  dummyKeyring ??= (async () => {
    const params = testKdfOverride ?? LEGACY_KDF;
    const dek = randomBytes(32);
    const wrap = await wrapDek(dek, randomBytes(32).toString("hex"), "passphrase", params);
    return {
      version: KEYRING_VERSION,
      passphrase: wrap,
      recovery: wrap,
      kdf: { ...params },
    } satisfies Keyring;
  })();
  dummyKeyring.catch(() => {
    dummyKeyring = undefined;
  });
  return dummyKeyring;
}

/**
 * Spends the same work as a real password unlock against a keyring nobody can
 * open, so an unknown username takes as long as a wrong password. Always
 * resolves (the unwrap is expected to fail) unless the KDF queue is full, in
 * which case it throws `KdfBusyError` exactly like a real unlock would.
 */
export async function dummyUnwrap(password: string): Promise<void> {
  const keyring = await getDummyKeyring();
  try {
    await unwrapDek(keyring.passphrase, password, "passphrase", kdfOf(keyring));
  } catch (err) {
    if (err instanceof KdfBusyError) throw err;
  }
}

// ---------------------------------------------------------------------------
// Identity key pair storage (see sealing.ts)
// ---------------------------------------------------------------------------

export function readKeyringIdentity(dir: string): KeyringIdentity | null {
  return readKeyring(dir).identity ?? null;
}

/** Atomically stores (or replaces) the identity key pair in the vault's keyring. */
export function writeKeyringIdentity(dir: string, identity: KeyringIdentity): void {
  const parsed = identitySchema.parse(identity);
  replaceKeyringFile(dir, { ...readKeyring(dir), identity: parsed });
}

// ---------------------------------------------------------------------------
// Session secret
// ---------------------------------------------------------------------------

/** Generated once on first run and reused — not derived from any password, since
 * it protects the session cookie, not a database file. Created exclusively with
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
