// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { setTimeout as sleep } from "node:timers/promises";
import type { RequestScope } from "./vault-types";

const scopeFor = (userId: string, vaultId = userId): RequestScope => ({
  userId,
  role: "member",
  sessionId: `sid-${userId}`,
  vault: { kind: "user", id: vaultId },
  spaceRole: null,
});

afterEach(() => {
  vi.doUnmock("react");
  vi.resetModules();
});

describe("runWithScope / currentScope", () => {
  it("is undefined outside any scope", async () => {
    const { currentScope } = await import("./request-scope");
    expect(currentScope()).toBeUndefined();
  });

  it("never crosses scopes between concurrent requests", async () => {
    const { runWithScope, currentScope } = await import("./request-scope");

    const request = (userId: string) =>
      runWithScope(scopeFor(userId), async () => {
        const seen: (string | undefined)[] = [];
        for (let i = 0; i < 20; i++) {
          await sleep(Math.random() * 3);
          seen.push(currentScope()?.userId);
        }
        return seen;
      });

    const results = await Promise.all(["a", "b", "a", "b"].map(request));
    expect(results[0].every((id) => id === "a")).toBe(true);
    expect(results[1].every((id) => id === "b")).toBe(true);
    expect(results[2].every((id) => id === "a")).toBe(true);
    expect(results[3].every((id) => id === "b")).toBe(true);
    expect(currentScope()).toBeUndefined();
  });

  it("lets a nested scope win and restores the outer one afterwards", async () => {
    const { runWithScope, currentScope } = await import("./request-scope");

    await runWithScope(scopeFor("user"), async () => {
      expect(currentScope()?.vault).toEqual({ kind: "user", id: "user" });
      await runWithScope(
        { ...scopeFor("user"), vault: { kind: "space", id: "space" }, spaceRole: "viewer" },
        async () => {
          await sleep(1);
          expect(currentScope()?.vault).toEqual({ kind: "space", id: "space" });
        },
      );
      expect(currentScope()?.vault).toEqual({ kind: "user", id: "user" });
    });
  });

  it("freezes the scope so callers can't switch vaults mid-request", async () => {
    const { runWithScope, currentScope } = await import("./request-scope");
    runWithScope(scopeFor("a"), () => {
      const scope = currentScope()!;
      expect(Object.isFrozen(scope)).toBe(true);
      expect(Object.isFrozen(scope.vault)).toBe(true);
    });
  });
});

describe("bindRenderScope", () => {
  it("does nothing outside a render (React's cache() gives a fresh box each call)", async () => {
    const { bindRenderScope, currentScope } = await import("./request-scope");
    bindRenderScope(scopeFor("a"));
    expect(currentScope()).toBeUndefined();
  });

  describe("inside one render", () => {
    // Simulates a single React render request: cache() memoizes for its duration.
    async function loadWithRenderCache() {
      vi.resetModules();
      vi.doMock("react", async (importOriginal) => ({
        ...(await importOriginal<typeof import("react")>()),
        cache: <T>(fn: () => T) => {
          let value: { v: T } | undefined;
          return () => (value ??= { v: fn() }).v;
        },
      }));
      return import("./request-scope");
    }

    it("binds the scope for the rest of the render", async () => {
      const { bindRenderScope, currentScope } = await loadWithRenderCache();
      bindRenderScope(scopeFor("a"));
      expect(currentScope()?.userId).toBe("a");
      bindRenderScope(scopeFor("a")); // same user + vault: no-op
      expect(currentScope()?.userId).toBe("a");
    });

    it("throws when a different user or vault is bound in the same render", async () => {
      const { bindRenderScope } = await loadWithRenderCache();
      bindRenderScope(scopeFor("a"));
      expect(() => bindRenderScope(scopeFor("b"))).toThrow(/already bound/);
      expect(() => bindRenderScope(scopeFor("a", "other-vault"))).toThrow(/already bound/);
    });

    it("lets an explicit runWithScope take precedence over the render binding", async () => {
      const { bindRenderScope, currentScope, runWithScope } = await loadWithRenderCache();
      bindRenderScope(scopeFor("a"));
      runWithScope(scopeFor("b"), () => expect(currentScope()?.userId).toBe("b"));
      expect(currentScope()?.userId).toBe("a");
    });
  });
});
