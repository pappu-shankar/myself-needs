import { useSyncExternalStore } from "react";

/**
 * One shared ticking clock for the live timers (elapsed, rest, hold). Only the
 * small components that show a time subscribe, so the rest of the logger
 * doesn't re-render every tick. The server (and the hydration pass) see 0 —
 * callers render a placeholder for that.
 */

const TICK_MS = 250;
const listeners = new Set<() => void>();
let now = 0;
let timer: ReturnType<typeof setInterval> | undefined;

function tick() {
  now = Date.now();
  for (const listener of listeners) listener();
}

function subscribeClock(listener: () => void): () => void {
  listeners.add(listener);
  if (timer === undefined) {
    now = Date.now();
    timer = setInterval(tick, TICK_MS);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer !== undefined) {
      clearInterval(timer);
      timer = undefined;
      // A later first subscriber must not briefly read a stale time.
      now = 0;
    }
  };
}

const getClock = () => now;
const getZero = () => 0;
const subscribeNothing = () => () => {};

/** Epoch ms, refreshed ~4×/s while `active`; 0 on the server, before hydration, or when inactive. */
export function useNow(active = true): number {
  return useSyncExternalStore(
    active ? subscribeClock : subscribeNothing,
    active ? getClock : getZero,
    getZero,
  );
}
