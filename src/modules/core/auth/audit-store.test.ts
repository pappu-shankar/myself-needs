// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AUDIT_MAX_ROWS,
  AUDIT_RETENTION_MS,
  countAudit,
  dismissAlert,
  listAudit,
  listDismissedAlerts,
  pruneAudit,
  recordAudit,
  sanitizeAuditDetail,
} from "./audit-store";
import { createAccount } from "./accounts-store";
import { setupTestRegistry, teardownTestRegistry } from "./test-registry";
import type { RegistryDb } from "./accounts-db";

let db: RegistryDb;
beforeEach(() => {
  db = setupTestRegistry();
  vi.spyOn(console, "info").mockImplementation(() => {});
});
afterEach(() => {
  teardownTestRegistry();
  vi.restoreAllMocks();
});

describe("sanitizeAuditDetail", () => {
  it("keeps allow-listed scalar keys and drops everything else", () => {
    expect(
      sanitizeAuditDetail({
        reason: "bad-password",
        count: 3,
        newDevice: true,
        password: "hunter2hunter2",
        recoveryKey: "abcd",
        token: "t",
        username: "typed-name",
        role: { nested: true },
        retryAfterMs: Number.NaN,
      }),
    ).toEqual({ reason: "bad-password", count: 3, newDevice: true });
    expect(sanitizeAuditDetail({ password: "x" })).toBeNull();
    expect(sanitizeAuditDetail(undefined)).toBeNull();
  });

  it("truncates long strings", () => {
    expect(sanitizeAuditDetail({ reason: "r".repeat(500) })?.reason).toHaveLength(120);
  });
});

describe("recordAudit / listAudit", () => {
  it("records and lists newest first, filtered by user/since/events", () => {
    recordAudit({ event: "login.ok", userId: "u1", ip: "203.0.113.1", now: 1 });
    recordAudit({ event: "login.failed", userId: "u1", detail: { count: 2 }, now: 2 });
    recordAudit({ event: "login.ok", userId: "u2", now: 3 });
    recordAudit({ event: "account.disabled", userId: "u1", actorId: "admin", now: 4 });

    expect(listAudit().map((e) => e.at)).toEqual([4, 3, 2, 1]);
    expect(listAudit({ userId: "u1" }).map((e) => e.event)).toEqual([
      "account.disabled",
      "login.failed",
      "login.ok",
    ]);
    expect(listAudit({ userId: "u1", since: 2 })).toHaveLength(2);
    expect(listAudit({ events: ["login.ok"] }).map((e) => e.userId)).toEqual(["u2", "u1"]);
    expect(listAudit({ limit: 1 })).toHaveLength(1);
    expect(listAudit({ userId: "u1", events: ["login.failed"] })[0]).toMatchObject({
      detail: { count: 2 },
      actorId: null,
      ip: null,
    });
    expect(countAudit("login.ok", 0)).toBe(2);
    expect(countAudit("login.ok", 0, "u2")).toBe(1);
  });

  it("never persists or logs secrets passed in detail", () => {
    recordAudit({ event: "login.failed", detail: { password: "correct horse battery" } });
    expect(JSON.stringify(db.prepare("SELECT * FROM audit").all())).not.toContain("horse");
    const logged = vi.mocked(console.info).mock.calls.flat().join(" ");
    expect(logged).toContain("login.failed");
    expect(logged).not.toContain("horse");
  });

  it("rejects malformed event names", () => {
    expect(() => recordAudit({ event: "Login Failed" })).toThrow(/invalid event/);
  });

  it("is not tied to account rows (survives account deletion)", () => {
    const a = createAccount({ username: "alice", role: "member", publicKey: "pk" });
    recordAudit({ event: "account.deleted", userId: a.id });
    db.prepare("DELETE FROM accounts").run();
    expect(listAudit({ userId: a.id })).toHaveLength(1);
  });
});

describe("pruneAudit", () => {
  it("drops entries older than 90 days", () => {
    recordAudit({ event: "old.event", now: 0 });
    recordAudit({ event: "new.event", now: AUDIT_RETENTION_MS });
    expect(pruneAudit(AUDIT_RETENTION_MS + 1)).toBe(1);
    expect(listAudit().map((e) => e.event)).toEqual(["new.event"]);
  });

  it("caps the table at 5000 rows, keeping the newest", () => {
    const insert = db.prepare("INSERT INTO audit (at, event) VALUES (?, 'bulk.event')");
    db.transaction(() => {
      for (let i = 0; i < AUDIT_MAX_ROWS + 25; i++) insert.run(1000 + i);
    })();
    expect(pruneAudit(2000)).toBe(25);
    const count = db.prepare("SELECT COUNT(*) AS n, MIN(at) AS oldest FROM audit").get() as {
      n: number;
      oldest: number;
    };
    expect(count).toEqual({ n: AUDIT_MAX_ROWS, oldest: 1025 });
  });

  it("runs automatically every so often on insert", () => {
    recordAudit({ event: "ancient.event", now: 0 });
    for (let i = 0; i < 60; i++) recordAudit({ event: "fresh.event", now: AUDIT_RETENTION_MS * 2 });
    expect(countAudit("ancient.event", 0)).toBe(0);
  });
});

describe("dismissed alerts", () => {
  it("records dismissals idempotently per user", () => {
    const a = createAccount({ username: "alice", role: "member", publicKey: "pk" });
    const b = createAccount({ username: "bob", role: "member", publicKey: "pk" });
    dismissAlert(a.id, "new-device:s1", 1);
    dismissAlert(a.id, "new-device:s1", 2);
    dismissAlert(a.id, "failures:2026-10-05", 3);
    expect([...listDismissedAlerts(a.id)].sort()).toEqual(["failures:2026-10-05", "new-device:s1"]);
    expect(listDismissedAlerts(b.id).size).toBe(0);
  });
});
