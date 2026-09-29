const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60_000;
const BASE_LOCKOUT_MS = 30_000;

interface ThrottleState {
  failures: number;
  windowStartedAt: number;
  lockedUntil: number;
}

const state = globalThis as unknown as {
  __unlockThrottle?: ThrottleState;
};

function getState(now: number): ThrottleState {
  const current = state.__unlockThrottle;
  if (!current || now - current.windowStartedAt >= WINDOW_MS) {
    state.__unlockThrottle = {
      failures: 0,
      windowStartedAt: now,
      lockedUntil: 0,
    };
  }
  return state.__unlockThrottle!;
}

export interface UnlockThrottleStatus {
  allowed: boolean;
  retryAfterMs: number;
}

export function checkUnlockAllowed(now = Date.now()): UnlockThrottleStatus {
  const current = getState(now);
  const retryAfterMs = Math.max(0, current.lockedUntil - now);
  return { allowed: retryAfterMs === 0, retryAfterMs };
}

export function recordUnlockFailure(now = Date.now()): UnlockThrottleStatus {
  const current = getState(now);
  current.failures += 1;
  if (current.failures >= MAX_ATTEMPTS) {
    const lockoutStep = current.failures - MAX_ATTEMPTS;
    current.lockedUntil = now + BASE_LOCKOUT_MS * 2 ** lockoutStep;
  }
  return checkUnlockAllowed(now);
}

export function recordUnlockSuccess(): void {
  state.__unlockThrottle = undefined;
}

export function resetUnlockThrottle(): void {
  state.__unlockThrottle = undefined;
}
