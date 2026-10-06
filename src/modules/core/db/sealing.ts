import {
  createCipheriv,
  createDecipheriv,
  createPrivateKey,
  createPublicKey,
  diffieHellman,
  generateKeyPairSync,
  hkdfSync,
  randomBytes,
  type KeyObject,
} from "node:crypto";
import { z } from "zod";
import { VaultStateError } from "@/modules/core/errors";
import { readKeyringIdentity, writeKeyringIdentity, type KeyringIdentity } from "./crypto";

/*
 * Sharing a space key without the server learning it. Every user has an X25519
 * identity key pair: the public half is plaintext (accounts.db), the private half
 * lives in their own keyring encrypted under a key derived from their DEK. A
 * space's DEK is sealed to each member's public key:
 *
 *   ephemeral X25519 key pair → ECDH(ephemeral, recipient) → HKDF-SHA256 → AES-256-GCM
 *
 * Only a member who has signed in (and so holds their own DEK) can unseal it.
 */

const SEAL_INFO = Buffer.from("myself-needs:seal:v1");
const IDENTITY_WRAP_INFO = Buffer.from("myself-needs:identity-wrap:v1");
const IDENTITY_AAD = Buffer.from("myself-needs:identity:v1");

export interface SealedBox {
  /** base64 raw X25519 ephemeral public key. */
  epk: string;
  iv: string;
  ciphertext: string;
  tag: string;
}

const b64 = z.string().regex(/^[A-Za-z0-9+/]+={0,2}$/);
const sealedBoxSchema = z.object({ epk: b64, iv: b64, ciphertext: b64, tag: b64 });

function rawPublicKeyB64(key: KeyObject): string {
  const jwk = (key.type === "private" ? createPublicKey(key) : key).export({ format: "jwk" });
  if (jwk.crv !== "X25519" || typeof jwk.x !== "string") {
    throw new VaultStateError("Not an X25519 key.");
  }
  return Buffer.from(jwk.x, "base64url").toString("base64");
}

function publicKeyFromB64(publicKeyB64: string): KeyObject {
  const raw = Buffer.from(publicKeyB64, "base64");
  if (raw.length !== 32) throw new VaultStateError("Invalid public key.");
  return createPublicKey({
    key: { kty: "OKP", crv: "X25519", x: raw.toString("base64url") },
    format: "jwk",
  });
}

/** The DEK is also the SQLCipher key, so the identity wrap uses an HKDF subkey of
 * it rather than the DEK itself (domain separation). */
function identityWrapKey(dekHex: string): Buffer {
  const dek = Buffer.from(dekHex, "hex");
  if (dek.length !== 32) throw new VaultStateError("Invalid vault key.");
  return Buffer.from(hkdfSync("sha256", dek, Buffer.alloc(0), IDENTITY_WRAP_INFO, 32));
}

/** Creates a new identity key pair, the private half encrypted under `dekHex`.
 * Persist it with `writeKeyringIdentity(dir, …)` (or use `ensureIdentity`). */
export function generateIdentity(dekHex: string): {
  publicKeyB64: string;
  encryptedPrivateKey: KeyringIdentity["privateKey"];
} {
  const { publicKey, privateKey } = generateKeyPairSync("x25519");
  const der = privateKey.export({ format: "der", type: "pkcs8" });
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", identityWrapKey(dekHex), iv);
  cipher.setAAD(IDENTITY_AAD);
  const ciphertext = Buffer.concat([cipher.update(der), cipher.final()]);
  return {
    publicKeyB64: rawPublicKeyB64(publicKey),
    encryptedPrivateKey: {
      iv: iv.toString("base64"),
      ciphertext: ciphertext.toString("base64"),
      tag: cipher.getAuthTag().toString("base64"),
    },
  };
}

function decryptIdentity(identity: KeyringIdentity, dekHex: string): KeyObject {
  let der: Buffer;
  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      identityWrapKey(dekHex),
      Buffer.from(identity.privateKey.iv, "base64"),
    );
    decipher.setAAD(IDENTITY_AAD);
    decipher.setAuthTag(Buffer.from(identity.privateKey.tag, "base64"));
    der = Buffer.concat([
      decipher.update(Buffer.from(identity.privateKey.ciphertext, "base64")),
      decipher.final(),
    ]);
  } catch {
    throw new VaultStateError("Your identity key couldn't be opened with this vault key.");
  }
  const privateKey = createPrivateKey({ key: der, format: "der", type: "pkcs8" });
  if (rawPublicKeyB64(privateKey) !== identity.publicKey) {
    throw new VaultStateError("Your identity key doesn't match its stored public key.");
  }
  return privateKey;
}

/** Decrypts the identity private key stored in the keyring at `dir`. */
export function openIdentity(dir: string, dekHex: string): KeyObject {
  const identity = readKeyringIdentity(dir);
  if (!identity) throw new VaultStateError("This account has no identity key yet.");
  return decryptIdentity(identity, dekHex);
}

/** Returns the vault's identity public key, generating and storing a key pair
 * first if the keyring has none (accounts created before sharing existed). */
export function ensureIdentity(dir: string, dekHex: string): string {
  const existing = readKeyringIdentity(dir);
  if (existing) {
    decryptIdentity(existing, dekHex); // proves the DEK matches before we trust it
    return existing.publicKey;
  }
  const { publicKeyB64, encryptedPrivateKey } = generateIdentity(dekHex);
  writeKeyringIdentity(dir, { publicKey: publicKeyB64, privateKey: encryptedPrivateKey });
  return publicKeyB64;
}

function sealKey(sharedSecret: Buffer, epkRaw: Buffer, recipientRaw: Buffer): Buffer {
  // Salt binds the derived key to both public keys of this exchange.
  const salt = Buffer.concat([epkRaw, recipientRaw]);
  return Buffer.from(hkdfSync("sha256", sharedSecret, salt, SEAL_INFO, 32));
}

export function seal(secret: Buffer, recipientPublicKeyB64: string): SealedBox {
  const recipient = publicKeyFromB64(recipientPublicKeyB64);
  const ephemeral = generateKeyPairSync("x25519");
  const shared = diffieHellman({ privateKey: ephemeral.privateKey, publicKey: recipient });
  const epkRaw = Buffer.from(rawPublicKeyB64(ephemeral.publicKey), "base64");
  const key = sealKey(shared, epkRaw, Buffer.from(recipientPublicKeyB64, "base64"));
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(secret), cipher.final()]);
  return {
    epk: epkRaw.toString("base64"),
    iv: iv.toString("base64"),
    ciphertext: ciphertext.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
  };
}

/** Throws `VaultStateError` if the box wasn't sealed to this key or was altered. */
export function unseal(box: SealedBox, privateKey: KeyObject): Buffer {
  try {
    const parsed = sealedBoxSchema.parse(box);
    const epkRaw = Buffer.from(parsed.epk, "base64");
    const shared = diffieHellman({ privateKey, publicKey: publicKeyFromB64(parsed.epk) });
    const recipientRaw = Buffer.from(rawPublicKeyB64(privateKey), "base64");
    const decipher = createDecipheriv(
      "aes-256-gcm",
      sealKey(shared, epkRaw, recipientRaw),
      Buffer.from(parsed.iv, "base64"),
    );
    decipher.setAuthTag(Buffer.from(parsed.tag, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(parsed.ciphertext, "base64")),
      decipher.final(),
    ]);
  } catch {
    throw new VaultStateError("A shared space key couldn't be opened with your identity key.");
  }
}

/** Text form for storage (e.g. `space_members.sealed_key`). */
export function encodeSealedBox(box: SealedBox): string {
  return JSON.stringify(sealedBoxSchema.parse(box));
}

export function decodeSealedBox(text: string): SealedBox {
  try {
    return sealedBoxSchema.parse(JSON.parse(text));
  } catch {
    throw new VaultStateError("A stored space key is unreadable.");
  }
}
