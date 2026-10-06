// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { VaultCloseReason } from "@/modules/core/db/client";
import type { VaultRef } from "@/modules/core/db/vault-types";

const mocks = vi.hoisted(() => ({
  closeVault: vi.fn(),
  listener: undefined as undefined | ((ref: VaultRef, reason: VaultCloseReason) => void),
}));

vi.mock("@/modules/core/db/client", () => ({
  closeVault: mocks.closeVault,
  onVaultClosed: (fn: (ref: VaultRef, reason: VaultCloseReason) => void) => {
    mocks.listener = fn;
    return () => undefined;
  },
}));

import { setupTestRegistry, teardownTestRegistry } from "@/modules/core/auth/test-registry";
import { resetConfigForTests } from "@/modules/core/env/config";
import * as registry from "./session-registry";

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const S = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const K1 = "1".repeat(64);
const K2 = "2".repeat(64);
const space: VaultRef = { kind: "space", id: S };

beforeEach(() => {
  setupTestRegistry();
  registry.resetSessionRegistryForTests();
  mocks.closeVault.mockClear();
  vi.spyOn(console, "info").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  teardownTestRegistry();
  delete process.env.APP_SESSION_MAX_HOURS;
  resetConfigForTests();
});

describe("session registry", () => {
  it("keeps keys while any session lives and closes only unshared vaults on last sign-out", () => {
    registry.registerSession({
      sid: "a1",
      userId: A,
      personalDek: K1,
      spaceKeys: new Map([[S, K2]]),
    });
    registry.registerSession({ sid: "a2", userId: A, personalDek: K1 });
    registry.registerSession({
      sid: "b1",
      userId: B,
      personalDek: K2,
      spaceKeys: new Map([[S, K2]]),
    });

    registry.endSession("a1", "signed-out");
    expect(registry.getCachedKey(A, space)).toBe(K2);
    expect(mocks.closeVault).not.toHaveBeenCalled();

    registry.endSession("a2", "signed-out");
    expect(registry.getCachedKey(A, space)).toBeNull();
    expect(mocks.closeVault.mock.calls.map(([ref]) => ref)).toEqual([{ kind: "user", id: A }]);

    registry.endSession("b1", "signed-out");
    expect(mocks.closeVault.mock.calls.map(([ref]) => ref)).toContainEqual(space);
  });

  it("ends a user's sessions on an idle close of their personal vault, not on eviction", () => {
    registry.registerSession({ sid: "a1", userId: A, personalDek: K1 });
    registry.registerSession({ sid: "b1", userId: B, personalDek: K2 });
    mocks.listener!({ kind: "user", id: A }, "evicted");
    expect(registry.getLiveSession("a1")).not.toBeNull();
    mocks.listener!(space, "idle");
    expect(registry.getLiveSession("a1")).not.toBeNull();
    mocks.listener!({ kind: "user", id: A }, "idle");
    expect(registry.getLiveSession("a1")).toBeNull();
    expect(registry.getLiveSession("b1")).not.toBeNull();
  });

  it("enforces the absolute max age", () => {
    process.env.APP_SESSION_MAX_HOURS = "2";
    resetConfigForTests();
    const now = Date.now();
    registry.registerSession({ sid: "a1", userId: A, personalDek: K1, now });
    expect(registry.getLiveSession("a1", now + 119 * 60_000)).not.toBeNull();
    expect(registry.getLiveSession("a1", now + 120 * 60_000)).toBeNull();
    expect(registry.isUserOnline(A)).toBe(false);
  });

  it("moves sessions off a vault whose key is forgotten, and swaps keys after a re-key", () => {
    registry.registerSession({
      sid: "a1",
      userId: A,
      personalDek: K1,
      spaceKeys: new Map([[S, K2]]),
    });
    registry.registerSession({
      sid: "b1",
      userId: B,
      personalDek: K2,
      spaceKeys: new Map([[S, K2]]),
    });
    registry.setSessionVault("a1", space);
    const fresh = "3".repeat(64);
    registry.replaceCachedKey(space, fresh);
    expect(registry.getCachedKey(B, space)).toBe(fresh);
    registry.forgetKey(A, space);
    expect(registry.getLiveSession("a1")!.vault).toEqual({ kind: "user", id: A });
    expect(registry.usersHoldingKey(space)).toEqual([B]);
  });

  it("sign out everywhere spares the current session when asked", () => {
    registry.registerSession({ sid: "a1", userId: A, personalDek: K1 });
    registry.registerSession({ sid: "a2", userId: A, personalDek: K1 });
    expect(registry.endUserSessions(A, { exceptSid: "a1", reason: "password-changed" })).toEqual([
      "a2",
    ]);
    expect(registry.listLiveSessions(A).map((s) => s.sid)).toEqual(["a1"]);
  });
});
