// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAccount } from "./accounts-store";
import {
  createSession,
  getSession,
  ipPrefix,
  isNewDevice,
  listUserSessions,
  parseIp,
  pruneSessions,
  revokeSession,
  revokeUserSessions,
  SESSION_HISTORY_MS,
  summarizeUserAgent,
  touchSession,
  TOUCH_INTERVAL_MS,
} from "./sessions-store";
import { setupTestRegistry, teardownTestRegistry } from "./test-registry";

const CHROME_MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const SAFARI_IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

let userId: string;
beforeEach(() => {
  setupTestRegistry();
  userId = createAccount({ username: "alice", role: "member", publicKey: "pk" }).id;
});
afterEach(() => teardownTestRegistry());

describe("summarizeUserAgent", () => {
  it.each([
    [CHROME_MAC, "Chrome on macOS"],
    [SAFARI_IPHONE, "Safari on iOS"],
    [
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0",
      "Edge on Windows",
    ],
    ["Mozilla/5.0 (X11; Linux x86_64; rv:133.0) Gecko/20100101 Firefox/133.0", "Firefox on Linux"],
    [
      "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
      "Chrome on Android",
    ],
    [
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0 Mobile/15E148 Safari/604.1",
      "Chrome on iOS",
    ],
    [
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15",
      "Safari on macOS",
    ],
    ["curl/8.7.1", "curl"],
    ["", "Unknown device"],
    [null, "Unknown device"],
  ])("%s → %s", (ua, expected) => {
    expect(summarizeUserAgent(ua)).toBe(expected);
  });
});

describe("IP helpers", () => {
  it("computes /24 for IPv4 and /48 for IPv6", () => {
    expect(ipPrefix("203.0.113.77")).toBe("203.0.113.0/24");
    expect(ipPrefix("2001:db8:abcd:12::1")).toBe("2001:db8:abcd::/48");
    expect(ipPrefix("2001:db8:abcd:12::1", 64)).toBe("2001:db8:abcd:12::/64");
    expect(ipPrefix("::1")).toBe("0:0:0::/48");
  });

  it("unwraps IPv4-mapped IPv6 and strips brackets/zones", () => {
    expect(parseIp("::ffff:192.0.2.1")).toEqual({ version: 4, address: "192.0.2.1" });
    expect(parseIp("::ffff:c000:201")).toEqual({ version: 4, address: "192.0.2.1" });
    expect(parseIp("[fe80::1%en0]")).toEqual({ version: 6, address: "fe80:0:0:0:0:0:0:1" });
    expect(ipPrefix("::ffff:192.0.2.1")).toBe("192.0.2.0/24");
  });

  it("rejects garbage", () => {
    expect(parseIp("not-an-ip")).toBeNull();
    expect(ipPrefix("1.2.3")).toBeNull();
    expect(ipPrefix("")).toBeNull();
  });
});

describe("session rows", () => {
  it("stores a UA summary and prefix, never the raw header", () => {
    const s = createSession({
      sid: "s1",
      userId,
      ip: "203.0.113.5",
      userAgent: CHROME_MAC,
      now: 10,
    });
    expect(s).toEqual({
      sid: "s1",
      userId,
      createdAt: 10,
      lastSeen: 10,
      ip: "203.0.113.5",
      ipPrefix: "203.0.113.0/24",
      userAgent: "Chrome on macOS",
      revokedAt: null,
    });
  });

  it("touch is throttled to once a minute and ignores revoked sessions", () => {
    createSession({ sid: "s1", userId, now: 0 });
    expect(touchSession("s1", TOUCH_INTERVAL_MS - 1)).toBe(false);
    expect(touchSession("s1", TOUCH_INTERVAL_MS)).toBe(true);
    expect(getSession("s1")?.lastSeen).toBe(TOUCH_INTERVAL_MS);
    revokeSession("s1", 1);
    expect(touchSession("s1", 10 * TOUCH_INTERVAL_MS)).toBe(false);
  });

  it("revokes one session or all of a user's (optionally sparing one)", () => {
    const bob = createAccount({ username: "bob", role: "member", publicKey: "pk" }).id;
    createSession({ sid: "a1", userId, now: 1 });
    createSession({ sid: "a2", userId, now: 2 });
    createSession({ sid: "a3", userId, now: 3 });
    createSession({ sid: "b1", userId: bob, now: 1 });

    expect(revokeSession("a1", 5)).toBe(true);
    expect(revokeSession("a1", 6)).toBe(false);
    expect(revokeUserSessions(userId, { exceptSid: "a3", now: 7 })).toEqual(["a2"]);
    expect(listUserSessions(userId).map((s) => s.sid)).toEqual(["a3"]);
    expect(listUserSessions(userId, { includeRevoked: true }).map((s) => s.sid)).toEqual([
      "a3",
      "a2",
      "a1",
    ]);
    expect(revokeUserSessions(userId).sort()).toEqual(["a3"]);
    expect(listUserSessions(bob).map((s) => s.sid)).toEqual(["b1"]);
  });

  it("prunes history older than 90 days", () => {
    createSession({ sid: "old", userId, now: 0 });
    createSession({ sid: "new", userId, now: SESSION_HISTORY_MS });
    expect(pruneSessions(SESSION_HISTORY_MS + 1)).toBe(1);
    expect(getSession("old")).toBeNull();
  });
});

describe("isNewDevice", () => {
  it("is false for the very first session", () => {
    expect(isNewDevice(userId, "Chrome on macOS", "203.0.113.0/24")).toBe(false);
  });

  it("flags an unseen browser/network combination", () => {
    createSession({ sid: "s1", userId, ip: "203.0.113.5", userAgent: CHROME_MAC });
    expect(isNewDevice(userId, "Chrome on macOS", "203.0.113.0/24")).toBe(false);
    expect(isNewDevice(userId, "Safari on iOS", "203.0.113.0/24")).toBe(true);
    expect(isNewDevice(userId, "Chrome on macOS", "198.51.100.0/24")).toBe(true);
  });

  it("still remembers revoked sessions and handles missing IPs", () => {
    createSession({ sid: "s1", userId, userAgent: SAFARI_IPHONE });
    revokeSession("s1");
    expect(isNewDevice(userId, "Safari on iOS", null)).toBe(false);
    expect(isNewDevice(userId, "Safari on iOS", "203.0.113.0/24")).toBe(true);
  });
});
