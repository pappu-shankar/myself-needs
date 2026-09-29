import { beforeEach, describe, expect, it } from "vitest";
import {
  checkUnlockAllowed,
  recordUnlockFailure,
  recordUnlockSuccess,
  resetUnlockThrottle,
} from "./unlock-throttle";

describe("unlock throttle", () => {
  beforeEach(() => resetUnlockThrottle());

  it("allows the configured number of attempts, then locks out", () => {
    const now = 1_000;

    for (let attempt = 0; attempt < 4; attempt += 1) {
      expect(recordUnlockFailure(now)).toMatchObject({ allowed: true });
    }

    expect(recordUnlockFailure(now)).toMatchObject({
      allowed: false,
      retryAfterMs: 30_000,
    });
    expect(checkUnlockAllowed(now + 29_999).allowed).toBe(false);
    expect(checkUnlockAllowed(now + 30_000).allowed).toBe(true);
  });

  it("resets failures after a successful unlock", () => {
    recordUnlockFailure(1_000);
    recordUnlockFailure(1_000);
    recordUnlockSuccess();

    expect(checkUnlockAllowed(1_000).allowed).toBe(true);
    expect(recordUnlockFailure(1_000).allowed).toBe(true);
  });

  it("forgets an expired failure window", () => {
    recordUnlockFailure(1_000);
    expect(checkUnlockAllowed(1_000 + 15 * 60_000).allowed).toBe(true);
  });
});
