"use client";

import { useEffect, useState } from "react";
import { formatDuration } from "@/modules/health/engine/units";
import { Button } from "@/components/ui/button";
import { adjustRest, remainingSec, restProgress } from "../_lib/rest";
import { useNow } from "../_hooks/clock";
import { setRest, useRestTimer } from "../_hooks/rest-timer-store";
import { beep, notify, vibrate } from "../_hooks/alerts";

/** A rest that ran out longer ago than this (tab closed, phone asleep) is cleared without alerting. */
const STALE_MS = 10_000;
const OVER_SHOWN_MS = 4_000;

interface RestBarProps {
  workoutId: number;
  sound: boolean;
  notifications: boolean;
}

/**
 * The rest countdown, pinned above the mobile tab bar (to the bottom on
 * desktop). Reads the end time from the rest-timer store, so a re-render,
 * server refresh or reload mid-rest picks up where it was.
 */
export function RestBar({ workoutId, sound, notifications }: RestBarProps) {
  const stored = useRestTimer();
  const rest = stored && stored.workoutId === workoutId ? stored : null;
  const now = useNow(rest !== null);
  const [overAt, setOverAt] = useState<number | null>(null);

  useEffect(() => {
    if (!rest) return;
    const timeout = setTimeout(
      () => {
        const late = Date.now() - rest.endAt;
        setRest(null);
        if (late > STALE_MS) return;
        if (sound) beep(3);
        vibrate([250, 120, 250]);
        if (notifications) notify("Rest over", "Time for your next set.");
        setOverAt(Date.now());
      },
      Math.max(0, rest.endAt - Date.now()),
    );
    return () => clearTimeout(timeout);
  }, [rest, sound, notifications]);

  useEffect(() => {
    if (overAt === null) return;
    const timeout = setTimeout(() => setOverAt(null), OVER_SHOWN_MS);
    return () => clearTimeout(timeout);
  }, [overAt]);

  const showOver = !rest && overAt !== null;
  const left = rest && now > 0 ? remainingSec(rest.endAt, now) : null;
  const progress = rest && now > 0 ? restProgress(rest, now) : 0;

  return (
    <>
      <p role="status" aria-live="polite" className="sr-only">
        {showOver ? "Rest over" : ""}
      </p>
      {(rest || showOver) && (
        <div className="fixed inset-x-0 bottom-[calc(3.375rem+env(safe-area-inset-bottom))] z-30 sm:bottom-0 sm:left-56 sm:pb-[env(safe-area-inset-bottom)]">
          <div className="bg-card/95 supports-backdrop-filter:backdrop-blur border-border border-t shadow-lg">
            {rest && (
              <div className="bg-muted h-1" aria-hidden="true">
                <div
                  className="bg-primary h-full transition-[width] duration-200 ease-linear motion-reduce:transition-none"
                  style={{ width: `${progress * 100}%` }}
                />
              </div>
            )}
            <div className="mx-auto flex max-w-3xl items-center gap-2 px-4 py-2">
              {rest ? (
                <>
                  <div className="min-w-0 flex-1">
                    <p className="text-muted-foreground text-xs">Rest</p>
                    <p className="text-2xl leading-tight font-semibold tabular-nums">
                      {left === null ? formatDuration(rest.totalSec) : formatDuration(left)}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10 px-2.5 tabular-nums"
                    aria-label="Rest 15 seconds less"
                    onClick={() => setRest(adjustRest(rest, -15, Date.now()))}
                  >
                    −15 s
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10 px-2.5 tabular-nums"
                    aria-label="Rest 15 seconds more"
                    onClick={() => setRest(adjustRest(rest, 15, Date.now()))}
                  >
                    +15 s
                  </Button>
                  <Button
                    type="button"
                    variant="default"
                    className="h-10 px-3"
                    onClick={() => setRest(null)}
                  >
                    Skip
                  </Button>
                </>
              ) : (
                <p className="flex-1 py-2.5 text-base font-medium" aria-hidden="true">
                  Rest over — next set
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
