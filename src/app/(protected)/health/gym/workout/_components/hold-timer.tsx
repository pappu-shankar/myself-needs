"use client";

import { useEffect, useState } from "react";
import { Play, Timer, X } from "lucide-react";
import { formatDuration } from "@/modules/health/engine/units";
import { Button } from "@/components/ui/button";
import { useNow } from "../_hooks/clock";
import { beep, vibrate } from "../_hooks/alerts";

interface HoldTimerProps {
  /** e.g. "set 2" — the set the hold will be logged to; null when every set is done. */
  setName: string | null;
  targetSec: number | null;
  sound: boolean;
  /** Logs the hold. */
  onDone: (seconds: number) => void;
}

/**
 * Work timer for timed holds: counts up from "Start hold", signals when the
 * target is reached, and "Done" logs the measured time as the set's duration.
 */
export function HoldTimer({ setName, targetSec, sound, onDone }: HoldTimerProps) {
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const now = useNow(startedAt !== null);

  useEffect(() => {
    if (startedAt === null || !targetSec) return;
    const timeout = setTimeout(
      () => {
        if (sound) beep(1);
        vibrate(200);
      },
      Math.max(0, startedAt + targetSec * 1000 - Date.now()),
    );
    return () => clearTimeout(timeout);
  }, [startedAt, targetSec, sound]);

  if (startedAt === null) {
    return (
      <Button
        type="button"
        variant="outline"
        className="h-10"
        disabled={setName === null}
        onClick={() => setStartedAt(Date.now())}
      >
        <Play aria-hidden="true" />
        Start hold
        {setName && <span className="sr-only"> for {setName}</span>}
      </Button>
    );
  }

  const elapsed = now > 0 ? Math.max(0, Math.floor((now - startedAt) / 1000)) : 0;
  const reached = targetSec !== null && elapsed >= targetSec;
  return (
    <div className="bg-muted/60 flex w-full flex-wrap items-center gap-3 rounded-lg p-3">
      <Timer className="text-muted-foreground size-5" aria-hidden="true" />
      <p className="min-w-0 flex-1">
        <span className="text-3xl font-semibold tabular-nums">{formatDuration(elapsed)}</span>
        {targetSec !== null && (
          <span className="text-muted-foreground ml-2 text-sm tabular-nums">
            / {formatDuration(targetSec)}
            {reached && <span className="text-primary ml-1 font-medium">target reached</span>}
          </span>
        )}
      </p>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="ghost"
          className="h-10"
          onClick={() => setStartedAt(null)}
          aria-label="Cancel hold"
        >
          <X aria-hidden="true" />
        </Button>
        <Button
          type="button"
          variant="default"
          className="h-10"
          onClick={() => {
            const seconds = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
            setStartedAt(null);
            onDone(seconds);
          }}
        >
          Done — log {setName}
        </Button>
      </div>
    </div>
  );
}
