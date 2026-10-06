// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DomainError } from "@/modules/core/errors";
import { attachRegistryDb, openRegistryDb, transaction } from "./accounts-db";
import { createAccount, findByUsername } from "./accounts-store";
import {
  createInvite,
  getInvite,
  hashInviteToken,
  INVITE_DEFAULT_TTL_MS,
  INVITE_MAX_TTL_MS,
  inviteState,
  listInvites,
  markInviteUsedBy,
  peekInvite,
  pruneInvites,
  redeemInvite,
  revokeInvite,
} from "./invites";
import { setupTestRegistry, teardownTestRegistry } from "./test-registry";
import type { RegistryDb } from "./accounts-db";

const HOUR = 60 * 60_000;
let db: RegistryDb;
let adminId: string;

beforeEach(() => {
  db = setupTestRegistry();
  adminId = createAccount({ username: "root", role: "admin", publicKey: "pk" }).id;
});
afterEach(() => teardownTestRegistry());

describe("createInvite", () => {
  it("returns a 32-byte base64url token and stores only its sha256", () => {
    const { token, invite } = createInvite({ createdBy: adminId, note: " for bob ", now: 0 });
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(token, "base64url")).toHaveLength(32);
    expect(invite).toMatchObject({ createdBy: adminId, createdAt: 0, note: "for bob" });
    expect(invite.expiresAt).toBe(INVITE_DEFAULT_TTL_MS);
    expect(INVITE_DEFAULT_TTL_MS).toBe(72 * HOUR);
    const stored = db.prepare("SELECT token_hash FROM invites").get() as { token_hash: string };
    expect(stored.token_hash).toBe(hashInviteToken(token));
    expect(stored.token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(db.prepare("SELECT * FROM invites").all())).not.toContain(token);
  });

  it("generates distinct tokens", () => {
    const tokens = new Set(
      Array.from({ length: 20 }, () => createInvite({ createdBy: adminId }).token),
    );
    expect(tokens.size).toBe(20);
  });

  it("enforces expiry bounds", () => {
    expect(() => createInvite({ createdBy: adminId, now: 100, expiresAt: 100 })).toThrow(
      DomainError,
    );
    expect(() =>
      createInvite({ createdBy: adminId, now: 0, expiresAt: INVITE_MAX_TTL_MS + 1 }),
    ).toThrow(/14 days/);
    expect(
      createInvite({ createdBy: adminId, now: 0, expiresAt: INVITE_MAX_TTL_MS }).invite.expiresAt,
    ).toBe(INVITE_MAX_TTL_MS);
  });

  it("rejects overlong notes", () => {
    expect(() => createInvite({ createdBy: adminId, note: "n".repeat(201) })).toThrow(DomainError);
  });
});

describe("redeemInvite", () => {
  it("redeems once; reuse returns null", () => {
    const { token, invite } = createInvite({ createdBy: adminId, now: 0 });
    expect(peekInvite(token, 10)?.id).toBe(invite.id);
    const redeemed = redeemInvite(token, 10);
    expect(redeemed).toMatchObject({ id: invite.id, usedAt: 10 });
    expect(redeemInvite(token, 11)).toBeNull();
    expect(peekInvite(token, 11)).toBeNull();
    expect(inviteState(getInvite(invite.id)!, 11)).toBe("used");
  });

  it("rejects expired invites (expiry is exclusive)", () => {
    const { token, invite } = createInvite({ createdBy: adminId, now: 0, expiresAt: HOUR });
    expect(peekInvite(token, HOUR)).toBeNull();
    expect(redeemInvite(token, HOUR)).toBeNull();
    expect(inviteState(invite, HOUR)).toBe("expired");
    expect(redeemInvite(token, HOUR - 1)).not.toBeNull();
  });

  it("rejects revoked invites; revoking is only possible while pending", () => {
    const { token, invite } = createInvite({ createdBy: adminId, now: 0 });
    expect(revokeInvite(invite.id, 5)).toBe(true);
    expect(revokeInvite(invite.id, 6)).toBe(false);
    expect(redeemInvite(token, 7)).toBeNull();
    expect(inviteState(getInvite(invite.id)!, 7)).toBe("revoked");

    const used = createInvite({ createdBy: adminId, now: 0 });
    redeemInvite(used.token, 1);
    expect(revokeInvite(used.invite.id, 2)).toBe(false);
  });

  it("rejects malformed and unknown tokens", () => {
    createInvite({ createdBy: adminId });
    expect(redeemInvite("")).toBeNull();
    expect(redeemInvite("not a token")).toBeNull();
    expect(redeemInvite("A".repeat(43))).toBeNull();
  });

  it("rolls back with the caller's transaction", () => {
    const { token, invite } = createInvite({ createdBy: adminId, now: 0 });
    expect(() =>
      transaction(() => {
        expect(redeemInvite(token, 1)).not.toBeNull();
        createAccount({ username: "root", role: "member", publicKey: "pk" }); // taken
      }),
    ).toThrow(/already taken/);
    expect(getInvite(invite.id)?.usedAt).toBeNull();

    const created = transaction(() => {
      const redeemed = redeemInvite(token, 2);
      if (!redeemed) return null;
      const account = createAccount({ username: "bob", role: "member", publicKey: "pk-b" });
      markInviteUsedBy(redeemed.id, account.id);
      return account;
    });
    expect(created?.username).toBe("bob");
    expect(getInvite(invite.id)).toMatchObject({ usedAt: 2, usedBy: findByUsername("bob")!.id });
  });

  it("only one of several concurrent redeems succeeds (separate connections)", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "registry-"));
    try {
      const primary = setupTestRegistry({ dir });
      const owner = createAccount({ username: "root", role: "admin", publicKey: "pk" });
      const { token } = createInvite({ createdBy: owner.id, now: 0 });
      const connections = [
        primary,
        ...Array.from({ length: 4 }, () => openRegistryDb(path.join(dir, "accounts.db"))),
      ];

      const results = await Promise.all(
        connections.map(async (conn) => {
          await Promise.resolve();
          attachRegistryDb(conn);
          return redeemInvite(token, 1);
        }),
      );
      expect(results.filter(Boolean)).toHaveLength(1);
      for (const conn of connections) if (conn.open) conn.close();
    } finally {
      teardownTestRegistry();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("listInvites / pruneInvites", () => {
  it("lists newest first", () => {
    createInvite({ createdBy: adminId, now: 1, note: "old" });
    createInvite({ createdBy: adminId, now: 2, note: "new" });
    expect(listInvites().map((i) => i.note)).toEqual(["new", "old"]);
  });

  it("prunes only finished invites past the cutoff", () => {
    const pending = createInvite({ createdBy: adminId, now: 0, expiresAt: INVITE_MAX_TTL_MS });
    const expired = createInvite({ createdBy: adminId, now: 0, expiresAt: HOUR });
    const day = 24 * HOUR;
    expect(pruneInvites(INVITE_MAX_TTL_MS - 1, 0)).toBe(1);
    expect(getInvite(expired.invite.id)).toBeNull();
    expect(getInvite(pending.invite.id)).not.toBeNull();
    expect(pruneInvites(100 * day)).toBe(1);
  });
});
