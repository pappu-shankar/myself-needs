import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  closeDatabase: vi.fn(),
}));

vi.mock("@/modules/core/db/client", () => ({
  closeDatabase: mocks.closeDatabase,
  isDatabaseOpen: () => true,
}));

import { beginUnlockedSession, currentEpoch, endUnlockedSession } from "./unlock-state";

describe("unlock session expiry", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    process.env.APP_IDLE_LOCK_MINUTES = "0.001";
    endUnlockedSession();
    mocks.closeDatabase.mockClear();
  });

  afterEach(() => {
    endUnlockedSession();
    delete process.env.APP_IDLE_LOCK_MINUTES;
    vi.useRealTimers();
  });

  it("revokes the epoch and closes the database after inactivity", () => {
    beginUnlockedSession(false);
    expect(currentEpoch()).toBeTruthy();

    vi.advanceTimersByTime(60);

    expect(currentEpoch()).toBeUndefined();
    expect(mocks.closeDatabase).toHaveBeenCalledOnce();
  });

  it("keeps the epoch alive when activity is recorded", () => {
    beginUnlockedSession(false);
    vi.advanceTimersByTime(40);
    beginUnlockedSession(true);
    vi.advanceTimersByTime(40);

    expect(currentEpoch()).toBeTruthy();
  });
});
