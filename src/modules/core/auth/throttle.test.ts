// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAccount } from "./accounts-store";
import {
  backoffMs,
  checkLogin,
  GLOBAL_MAX_FAILURES,
  GLOBAL_WINDOW_MS,
  IP_MAX_FAILURES,
  IP_WINDOW_MS,
  pruneLoginThrottle,
  recordLoginFailure,
  recordLoginSuccess,
  resetThrottleMemory,
  throttleKey,
  USERNAME_FORGET_MS,
} from "./throttle";
import { setupTestRegistry, teardownTestRegistry } from "./test-registry";
import type { RegistryDb } from "./accounts-db";

const MIN = 60_000;
let db: RegistryDb;
beforeEach(() => {
  db = setupTestRegistry();
});
afterEach(() => teardownTestRegistry());

function fail(times: number, user: string, ip: string | null, now: number) {
  for (let i = 0; i < times; i++) recordLoginFailure(user, ip, now);
}

describe("backoffMs", () => {
  it("is 0 below 5 failures, then 30 s doubling up to 15 min", () => {
    expect([1, 2, 3, 4].map(backoffMs)).toEqual([0, 0, 0, 0]);
    expect([5, 6, 7, 8, 9].map(backoffMs)).toEqual([30_000, 60_000, 120_000, 240_000, 480_000]);
    expect(backoffMs(10)).toBe(15 * MIN);
    expect(backoffMs(1000)).toBe(15 * MIN);
  });
});

describe("per-username backoff", () => {
  it("locks after 5 failures and releases when the lock passes", () => {
    fail(4, "alice", null, 0);
    expect(checkLogin("alice", null, 0)).toEqual({ allowed: true, retryAfterMs: 0 });
    const status = recordLoginFailure("alice", null, 1000);
    expect(status).toEqual({ allowed: false, retryAfterMs: 30_000 });
    expect(checkLogin("alice", null, 1000 + 29_999)).toEqual({ allowed: false, retryAfterMs: 1 });
    expect(checkLogin("alice", null, 31_000).allowed).toBe(true);
    // Next failure doubles.
    expect(recordLoginFailure("alice", null, 31_000).retryAfterMs).toBe(60_000);
  });

  it("does not affect other usernames", () => {
    fail(5, "alice", null, 0);
    expect(checkLogin("bob", null, 0).allowed).toBe(true);
  });

  it("keys on the normalized username", () => {
    fail(5, " ALICE ", null, 0);
    expect(checkLogin("alice", null, 0).allowed).toBe(false);
    expect(throttleKey("Ａlice")).toBe(throttleKey("alice"));
  });

  it("treats unknown usernames exactly like real accounts", () => {
    createAccount({ username: "alice", role: "member", publicKey: "pk" });
    fail(5, "alice", null, 0);
    fail(5, "ghost", null, 0);
    expect(checkLogin("alice", null, 0)).toEqual(checkLogin("ghost", null, 0));
  });

  it("is persisted (survives an in-memory reset) and stores no plaintext name", () => {
    fail(5, "alice", null, 0);
    resetThrottleMemory();
    expect(checkLogin("alice", null, 0).allowed).toBe(false);
    expect(JSON.stringify(db.prepare("SELECT * FROM login_throttle").all())).not.toContain("alice");
  });

  it("success clears the backoff", () => {
    fail(6, "alice", null, 0);
    recordLoginSuccess("ALICE");
    expect(checkLogin("alice", null, 0).allowed).toBe(true);
    expect(recordLoginFailure("alice", null, 0).allowed).toBe(true);
  });

  it("forgets the failure count a day after the last failure", () => {
    fail(4, "alice", null, 0);
    expect(recordLoginFailure("alice", null, USERNAME_FORGET_MS).allowed).toBe(true);
    expect(pruneLoginThrottle(USERNAME_FORGET_MS * 3)).toBe(1);
  });
});

describe("per-IP window", () => {
  it("blocks an IP after 20 failures in 15 min across usernames", () => {
    for (let i = 0; i < IP_MAX_FAILURES; i++) recordLoginFailure(`user${i}`, "203.0.113.9", i);
    const blocked = checkLogin("fresh", "203.0.113.9", IP_MAX_FAILURES);
    expect(blocked.allowed).toBe(false);
    // The oldest failure (t=0) leaves the window at t = 15 min.
    expect(blocked.retryAfterMs).toBe(IP_WINDOW_MS - IP_MAX_FAILURES);
    expect(checkLogin("fresh", "203.0.113.10", IP_MAX_FAILURES).allowed).toBe(true);
    expect(checkLogin("fresh", "203.0.113.9", IP_WINDOW_MS).allowed).toBe(true);
  });

  it("is skipped when no IP is passed", () => {
    for (let i = 0; i < IP_MAX_FAILURES; i++) recordLoginFailure(`user${i}`, null, 0);
    expect(checkLogin("fresh", null, 0).allowed).toBe(true);
  });

  it("groups IPv6 by /64 and unwraps IPv4-mapped addresses", () => {
    for (let i = 0; i < IP_MAX_FAILURES; i++) {
      recordLoginFailure(`user${i}`, `2001:db8:1:2::${i.toString(16)}`, 0);
    }
    expect(checkLogin("fresh", "2001:db8:1:2:ffff::1", 0).allowed).toBe(false);
    expect(checkLogin("fresh", "2001:db8:1:3::1", 0).allowed).toBe(true);

    resetThrottleMemory();
    for (let i = 0; i < IP_MAX_FAILURES; i++)
      recordLoginFailure(`user${i}`, "::ffff:198.51.100.7", 0);
    expect(checkLogin("fresh", "198.51.100.7", 0).allowed).toBe(false);
  });
});

describe("global window", () => {
  it("blocks everyone after 60 failures per minute", () => {
    for (let i = 0; i < GLOBAL_MAX_FAILURES; i++) recordLoginFailure(`user${i}`, null, 1000);
    const status = checkLogin("someone", null, 1000);
    expect(status).toEqual({ allowed: false, retryAfterMs: GLOBAL_WINDOW_MS });
    expect(checkLogin("someone", null, 1000 + GLOBAL_WINDOW_MS).allowed).toBe(true);
  });

  it("reports the longest of the applicable waits", () => {
    fail(10, "alice", null, 0); // username locked 15 min
    for (let i = 0; i < GLOBAL_MAX_FAILURES; i++) recordLoginFailure(`u${i}`, null, 0);
    expect(checkLogin("alice", null, 0).retryAfterMs).toBe(15 * MIN);
  });
});
