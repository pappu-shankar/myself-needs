// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";

let tmpRoot: string;
let originalDataDir: string | undefined;
let sealing: typeof import("./sealing");
let crypto: typeof import("./crypto");
let paths: typeof import("@/modules/core/env/paths");
let errors: typeof import("@/modules/core/errors");

beforeEach(async () => {
  tmpRoot = path.join(process.cwd(), ".vitest-tmp", randomUUID());
  mkdirSync(tmpRoot, { recursive: true });
  originalDataDir = process.env.APP_DATA_DIR;
  process.env.APP_DATA_DIR = path.join(tmpRoot, "data");

  vi.resetModules();
  sealing = await import("./sealing");
  crypto = await import("./crypto");
  paths = await import("@/modules/core/env/paths");
  errors = await import("@/modules/core/errors");
  crypto.__setKdfParamsForTests({ N: 2 ** 10, r: 1, p: 1 });
});

afterEach(() => {
  process.env.APP_DATA_DIR = originalDataDir;
  rmSync(tmpRoot, { recursive: true, force: true });
  vi.resetModules();
});

async function newUser(password = "correct-horse-battery") {
  const dir = paths.getUserDir(randomUUID());
  const { dekHex } = await crypto.createVault(dir, password);
  const publicKeyB64 = sealing.ensureIdentity(dir, dekHex);
  return { dir, dekHex, publicKeyB64, privateKey: sealing.openIdentity(dir, dekHex) };
}

describe("identity key pair", () => {
  it("generates a raw 32-byte X25519 public key and an encrypted private key", () => {
    const dek = randomBytes(32).toString("hex");
    const { publicKeyB64, encryptedPrivateKey } = sealing.generateIdentity(dek);
    expect(Buffer.from(publicKeyB64, "base64")).toHaveLength(32);
    expect(Object.keys(encryptedPrivateKey).sort()).toEqual(["ciphertext", "iv", "tag"]);
  });

  it("stores the identity in the keyring and reopens it with the DEK", async () => {
    const user = await newUser();
    expect(crypto.readKeyringIdentity(user.dir)?.publicKey).toBe(user.publicKeyB64);
    // Idempotent: a second ensure keeps the same key pair.
    expect(sealing.ensureIdentity(user.dir, user.dekHex)).toBe(user.publicKeyB64);
  });

  it("refuses to open the identity with a different DEK", async () => {
    const user = await newUser();
    expect(() => sealing.openIdentity(user.dir, randomBytes(32).toString("hex"))).toThrow(
      errors.VaultStateError,
    );
  });

  it("reports a keyring with no identity", async () => {
    const dir = paths.getUserDir(randomUUID());
    const { dekHex } = await crypto.createVault(dir, "correct-horse-battery");
    expect(() => sealing.openIdentity(dir, dekHex)).toThrow(/no identity key/);
  });
});

describe("seal / unseal", () => {
  it("round-trips a secret to its recipient", async () => {
    const user = await newUser();
    const spaceKey = randomBytes(32);

    const box = sealing.seal(spaceKey, user.publicKeyB64);
    expect(sealing.unseal(box, user.privateKey).equals(spaceKey)).toBe(true);
  });

  it("uses a fresh ephemeral key every time", async () => {
    const user = await newUser();
    const secret = randomBytes(32);
    const a = sealing.seal(secret, user.publicKeyB64);
    const b = sealing.seal(secret, user.publicKeyB64);
    expect(a.epk).not.toBe(b.epk);
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });

  it("can't be opened by anyone else", async () => {
    const alice = await newUser();
    const bob = await newUser();
    const box = sealing.seal(randomBytes(32), alice.publicKeyB64);

    expect(() => sealing.unseal(box, bob.privateKey)).toThrow(errors.VaultStateError);
  });

  it.each(["epk", "iv", "ciphertext", "tag"] as const)(
    "detects tampering with %s",
    async (field) => {
      const user = await newUser();
      const box = sealing.seal(randomBytes(32), user.publicKeyB64);
      const bytes = Buffer.from(box[field], "base64");
      bytes[0] ^= 0x01;

      expect(() =>
        sealing.unseal({ ...box, [field]: bytes.toString("base64") }, user.privateKey),
      ).toThrow(errors.VaultStateError);
    },
  );

  it("encodes and decodes a box for storage", async () => {
    const user = await newUser();
    const secret = randomBytes(32);
    const text = sealing.encodeSealedBox(sealing.seal(secret, user.publicKeyB64));

    expect(sealing.unseal(sealing.decodeSealedBox(text), user.privateKey).equals(secret)).toBe(
      true,
    );
    expect(() => sealing.decodeSealedBox("{nope")).toThrow(errors.VaultStateError);
  });

  it("rejects a malformed recipient key", () => {
    expect(() => sealing.seal(randomBytes(32), Buffer.alloc(16).toString("base64"))).toThrow(
      errors.VaultStateError,
    );
  });
});
