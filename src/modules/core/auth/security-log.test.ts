// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAccount } from "./accounts-store";
import { listRecentSecurityEventsForAdmin } from "./admin-service";
import { recordAudit } from "./audit-store";
import { listMyAuditEvents } from "./queries";
import { setupTestRegistry, teardownTestRegistry } from "./test-registry";

beforeEach(() => {
  setupTestRegistry();
  vi.spyOn(console, "info").mockImplementation(() => {});
});
afterEach(() => {
  teardownTestRegistry();
  vi.restoreAllMocks();
});

describe("listMyAuditEvents", () => {
  it("returns the user's own labelled events with the IP cut to a prefix", () => {
    const me = createAccount({ username: "alice", role: "member", publicKey: "pk" });
    const other = createAccount({ username: "bob", role: "member", publicKey: "pk" });
    recordAudit({
      event: "login.succeeded",
      userId: me.id,
      ip: "203.0.113.57",
      detail: { via: "recovery", uaSummary: "Firefox on Linux" },
      now: 1,
    });
    recordAudit({ event: "password.changed", userId: me.id, now: 2 });
    recordAudit({ event: "login.succeeded", userId: other.id, ip: "198.51.100.9", now: 3 });

    const events = listMyAuditEvents(me.id);
    expect(events.map((e) => e.label)).toEqual(["Password changed", "Signed in"]);
    expect(events[1]).toMatchObject({
      network: "203.0.113.0/24",
      device: "Firefox on Linux",
      note: "via recovery key",
    });
    expect(JSON.stringify(events)).not.toContain("203.0.113.57");
  });

  it("respects the limit", () => {
    const me = createAccount({ username: "alice", role: "member", publicKey: "pk" });
    for (let i = 0; i < 5; i++) recordAudit({ event: "logout", userId: me.id, now: i });
    expect(listMyAuditEvents(me.id, { limit: 2 })).toHaveLength(2);
  });
});

describe("listRecentSecurityEventsForAdmin", () => {
  it("includes failures and invites, and new-device sign-ins for admins only", () => {
    const admin = createAccount({ username: "root", role: "admin", publicKey: "pk" });
    const member = createAccount({ username: "bob", role: "member", publicKey: "pk" });
    recordAudit({ event: "login.failed", userId: member.id, ip: "203.0.113.57", now: 1 });
    recordAudit({ event: "login.new_device", userId: member.id, now: 2 });
    recordAudit({ event: "login.new_device", userId: admin.id, now: 3 });
    recordAudit({ event: "invite.created", actorId: admin.id, now: 4 });
    recordAudit({ event: "login.succeeded", userId: member.id, now: 5 });

    const events = listRecentSecurityEventsForAdmin();
    expect(events.map((e) => [e.event, e.username])).toEqual([
      ["invite.created", "root"],
      ["login.new_device", "root"],
      ["login.failed", "bob"],
    ]);
    expect(events[2].network).toBe("203.0.113.0/24");
    expect(JSON.stringify(events)).not.toContain("203.0.113.57");
  });
});
