import { useSyncExternalStore } from "react";
import { parseStoredRest, startRest, type RestTimer } from "../_lib/rest";

/**
 * The running rest timer: an end timestamp in a tiny external store, mirrored
 * to sessionStorage so it survives re-renders, server refreshes and a reload
 * mid-rest. Storage can be unavailable (private mode, blocked site data) —
 * every access is guarded and the timer then simply lives in memory.
 */

const KEY = "gym:rest-timer";
const listeners = new Set<() => void>();
/** undefined = not read from storage yet. */
let current: RestTimer | null | undefined;

function read(): RestTimer | null {
  try {
    return parseStoredRest(window.sessionStorage.getItem(KEY));
  } catch {
    return null;
  }
}

export function getRest(): RestTimer | null {
  if (current === undefined) current = typeof window === "undefined" ? null : read();
  return current;
}

export function setRest(next: RestTimer | null): void {
  current = next;
  try {
    if (next) window.sessionStorage.setItem(KEY, JSON.stringify(next));
    else window.sessionStorage.removeItem(KEY);
  } catch {
    // Storage unavailable — the in-memory timer still works.
  }
  for (const listener of listeners) listener();
}

/** Starts (replacing any running) rest countdown from now; returns it, or null for a 0 s rest. */
export function beginRest(workoutId: number, setId: number, seconds: number): RestTimer | null {
  const timer = startRest(workoutId, setId, seconds, Date.now());
  if (timer) setRest(timer);
  return timer;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const getServerRest = () => null;

export function useRestTimer(): RestTimer | null {
  return useSyncExternalStore(subscribe, getRest, getServerRest);
}
