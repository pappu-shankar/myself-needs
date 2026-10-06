// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { AuditEntry } from "./audit-store";
import { computeAlerts } from "./security-alerts";

const ME = "me";
const NOW = 1_700_000_000_000;
let nextId = 1;

function entry(event: string, minutesAgo: number, extra: Partial<AuditEntry> = {}): AuditEntry {
  return {
    id: nextId++,
    at: NOW - minutesAgo * 60_000,
    event,
    userId: ME,
    actorId: null,
    ip: null,
    detail: null,
    ...extra,
  };
}

describe("computeAlerts", () => {
  it("flags five or more failed sign-ins in a day, once per burst", () => {
    const four = [1, 2, 3, 4].map((m) => entry("login.failed", m));
    expect(computeAlerts(ME, four, new Set(), NOW)).toEqual([]);
    const five = [...four, entry("login.failed", 5)];
    const [alert] = computeAlerts(ME, five, new Set(), NOW);
    expect(alert).toMatchObject({ kind: "failed-logins", severity: "warning" });
    expect(alert.message).toContain("5 wrong-password attempts");
    expect(computeAlerts(ME, five, new Set([alert.id]), NOW)).toEqual([]);
    // A new failure after dismissal raises it again.
    expect(
      computeAlerts(ME, [...five, entry("login.failed", 0)], new Set([alert.id]), NOW),
    ).toHaveLength(1);
  });

  it("ignores failures older than a day", () => {
    const old = [1, 2, 3, 4, 5].map((m) => entry("login.failed", 25 * 60 + m));
    expect(computeAlerts(ME, old, new Set(), NOW)).toEqual([]);
  });

  it("reports new devices, recovery-key use and admin changes, newest first", () => {
    const alerts = computeAlerts(
      ME,
      [
        entry("login.new_device", 30, { detail: { uaSummary: "Firefox on Linux" } }),
        entry("recovery.used", 10),
        entry("account.role_changed", 5, { actorId: "admin", detail: { role: "admin" } }),
        entry("account.role_changed", 4, { actorId: ME }), // self-change: no alert
        entry("login.new_device", 60, { userId: "someone-else" }),
      ],
      new Set(),
      NOW,
    );
    expect(alerts.map((a) => a.kind)).toEqual(["admin-changed", "recovery-used", "new-device"]);
    expect(alerts[2].message).toContain("Firefox on Linux");
    expect(alerts[0].message).toContain("to admin");
  });

  it("drops anything older than 30 days", () => {
    expect(computeAlerts(ME, [entry("recovery.used", 31 * 24 * 60)], new Set(), NOW)).toEqual([]);
  });
});
