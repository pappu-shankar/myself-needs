import { useEffect } from "react";

interface Sentinel {
  released: boolean;
  release(): Promise<void>;
}

type WakeLockNavigator = Navigator & {
  wakeLock?: { request(type: "screen"): Promise<Sentinel> };
};

/**
 * Keeps the screen on while mounted. The browser drops the lock whenever the
 * page is hidden, so it's re-acquired on return; released on unmount. A
 * silent no-op where the Screen Wake Lock API is missing or refused.
 */
export function useWakeLock(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    const wakeLock = (navigator as WakeLockNavigator).wakeLock;
    if (!wakeLock) return;
    let sentinel: Sentinel | null = null;
    let disposed = false;

    const acquire = async () => {
      if (disposed || document.visibilityState !== "visible") return;
      if (sentinel && !sentinel.released) return;
      try {
        const lock = await wakeLock.request("screen");
        if (disposed) void lock.release().catch(() => {});
        else sentinel = lock;
      } catch {
        // Refused (battery saver, permissions policy) — nothing to do.
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") void acquire();
    };

    void acquire();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", onVisibility);
      void sentinel?.release().catch(() => {});
      sentinel = null;
    };
  }, [enabled]);
}
